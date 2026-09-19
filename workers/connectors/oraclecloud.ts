import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { shiftTypeFromPattern } from '@/lib/normalize/shift';
import { provinceCodeFromName } from '@/lib/provinces';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * Oracle Cloud Recruiting career sites — what the Saskatchewan Health Authority hires
 * through. Its REST API lists 200 requisitions per request with posted dates, so a whole
 * province's listing costs ~11 requests and only new postings are fetched individually.
 */
export type OracleCloudEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  /** `site` is the career site number, e.g. "CX_1001". */
  config: { key: string; host: string; site: string };
};

const RequisitionSchema = z.object({
  Id: z.string().min(1),
  Title: z.string().min(1),
  PostedDate: z.string().min(1),
  PrimaryLocation: z.string().default(''),
});

const ListSchema = z.object({
  items: z.array(z.object({
    TotalJobsCount: z.number(),
    requisitionList: z.array(RequisitionSchema).default([]),
  })).min(1),
});

const DetailSchema = z.object({
  Id: z.string().min(1),
  Title: z.string().min(1),
  ExternalPostedStartDate: z.string().min(1),
  PrimaryLocation: z.string().default(''),
  ExternalDescriptionStr: z.string().default(''),
  ShortDescriptionStr: z.string().default(''),
  JobSchedule: z.string().nullish(),
  RequisitionType: z.string().nullish(),
  PostingEndDate: z.string().nullish(),
});
export type OracleCloudDetail = z.infer<typeof DetailSchema>;

const DetailResponseSchema = z.object({ items: z.array(DetailSchema).min(1) });

const LIST_PAGE_SIZE = 200;
/** Runaway guard: Saskatchewan, the largest site, is ~11 pages. */
const MAX_PAGES = 100;

/**
 * The labelled block these postings open with:
 * "Position # : 090377 … Facility: Red Deer Nursing Home City/Town: Porcupine Plain
 * Department: Chronic Resident Unit Type: Part-time regular FTE: 0.47
 * Shift Information : Days, Nights, Weekends … Salary or Pay Band: Pay Band Nurse A $38.580 to $50.070".
 */
const FIELD_LABELS = [
  'Position #', 'Expected Start Date', 'Expected Up To Date', 'Union', 'Facility', 'City/Town',
  'Department', 'Type', 'FTE', 'Shift Information', 'Hours of Work', 'Relief', 'Float',
  'Field Hours', 'Salary or Pay Band', 'Travel Required',
];

const asText = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function parseDescriptionFields(descriptionText: string): Record<string, string> {
  const escape = (label: string) => label.replace(/[.*+?^${}()|[\]\\#/]/g, '\\$&');
  const lookahead = FIELD_LABELS.map(escape).join('|');
  const fields: Record<string, string> = {};
  for (const label of FIELD_LABELS) {
    const match = descriptionText.match(
      new RegExp(`${escape(label)}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${lookahead})\\s*:|$)`),
    );
    const value = match?.[1]?.trim();
    if (value) fields[label] = value.slice(0, 200);
  }
  return fields;
}

function readEmploymentType(value: string): EmploymentType | undefined {
  const v = value.toLowerCase();
  if (!v.trim()) return undefined;
  // Casual and temporary are checked first: "Full-time temporary" is a temporary post that
  // happens to be full-time hours, and the end date is what matters to a job seeker.
  if (/casual|relief/.test(v)) return 'casual';
  if (/temporary|term\b/.test(v)) return 'temporary';
  if (/full.?time/.test(v)) return 'full_time';
  if (/part.?time/.test(v)) return 'part_time';
  return undefined;
}

/**
 * The posting's own "Type: Part-time regular" wins outright over the API's `JobSchedule`,
 * which disagrees with it: a posting typed "Part-time regular" can carry JobSchedule
 * "Full time". Reading them as one string let the wrong one win.
 */
export function employmentTypeFromOracle(
  fields: Record<string, string>,
  jobSchedule: string | null | undefined,
): EmploymentType | undefined {
  return readEmploymentType(fields['Type'] ?? '') ?? readEmploymentType(jobSchedule ?? '');
}

/**
 * "Pay Band Nurse A $38.580 to $50.070" — the band's name sits between the label and the
 * figures, so the rate is matched on the figures themselves. `RequisitionType` ("Hourly")
 * says which period it is; SHA quotes three decimals, which is a real hourly rate.
 */
export function parseSalary(fields: Record<string, string>, requisitionType: string | null | undefined) {
  const band = fields['Salary or Pay Band'];
  const match = band?.match(/\$\s*([\d,]+\.?\d*)\s*(?:to|-|–)\s*\$?\s*([\d,]+\.?\d*)/);
  if (!match) return {};
  const min = Number(match[1].replace(/,/g, ''));
  const max = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || min > max) return {};

  const hourly = /hourly/i.test(requisitionType ?? '') || max < 1000;
  return { salaryMin: min, salaryMax: max, salaryPeriod: hourly ? ('hour' as const) : ('year' as const) };
}

/** "Saskatoon, SK, Canada" → city and province code. */
export function parseLocation(location: string) {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  return { city: parts[0] || undefined, province: parts[1] ? provinceCodeFromName(parts[1]) : null };
}

export function normalizeOracleCloud(raw: unknown, employer: OracleCloudEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);

  const postedAt = new Date(detail.ExternalPostedStartDate);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable posted date "${detail.ExternalPostedStartDate}" for ${detail.Id}`);
  }

  const descriptionText = asText(detail.ExternalDescriptionStr || detail.ShortDescriptionStr);
  const fields = parseDescriptionFields(descriptionText);
  const location = parseLocation(detail.PrimaryLocation);

  const closesAt = detail.PostingEndDate ? new Date(detail.PostingEndDate) : undefined;
  const url = `https://${employer.config.host}/hcmUI/CandidateExperience/en/sites/${employer.config.site}/job/${detail.Id}`;

  return {
    sourceId: `oraclecloud:${employer.config.key}`,
    sourceJobId: detail.Id,
    sourceUrl: url,
    title: detail.Title,
    employerName: employer.name,
    // "Facility: Red Deer Nursing Home" is the site someone would actually work at.
    facilityName: fields['Facility'] || undefined,
    description: sanitizeDescription(detail.ExternalDescriptionStr || detail.ShortDescriptionStr),
    city: fields['City/Town'] || location.city || employer.defaultCity,
    province: location.province ?? employer.province,
    postedAt,
    closesAt: closesAt && !Number.isNaN(closesAt.getTime()) ? closesAt : undefined,
    employmentType: employmentTypeFromOracle(fields, detail.JobSchedule),
    shiftType: shiftTypeFromPattern(fields['Shift Information']),
    ...parseSalary(fields, detail.RequisitionType),
    applyUrl: url,
  };
}

const limit = createHostLimiter();

export function createOracleCloudConnector(employer: OracleCloudEmployer, ctx: LogContext): Connector {
  const { key, host, site } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent, Accept: 'application/json' };
  const api = `https://${host}/hcmRestApi/resources/latest`;

  return {
    id: `oraclecloud:${key}`,
    kind: 'ats',
    // One API call per posting, and postings do not change once published, so known ones
    // are only marked as seen.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      const offset = cursor ? Number(cursor) : 0;
      const url = `${api}/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList`
        + `&finder=findReqs;siteNumber=${site},limit=${LIST_PAGE_SIZE},offset=${offset},sortBy=POSTING_DATES_DESC`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);

      const { items } = ListSchema.parse(await res.json());
      const { TotalJobsCount: total, requisitionList } = items[0];

      const stubs: JobStub[] = requisitionList.map((r) => {
        const postedAt = new Date(r.PostedDate);
        return {
          sourceJobId: r.Id,
          externalPath: `/job/${r.Id}`,
          title: r.Title,
          locationsText: r.PrimaryLocation,
          postedAt: Number.isNaN(postedAt.getTime()) ? undefined : postedAt,
        };
      });

      log(ctx, 'info', 'fetched list page', { offset, returned: stubs.length, total });
      const hasMore = stubs.length === LIST_PAGE_SIZE
        && offset + LIST_PAGE_SIZE < total
        && offset / LIST_PAGE_SIZE < MAX_PAGES;
      return { items: stubs, nextCursor: hasMore ? String(offset + LIST_PAGE_SIZE) : undefined };
    },

    async hydrate(stub) {
      const url = `${api}/recruitingCEJobRequisitionDetails?expand=all&onlyData=true`
        + `&finder=ById;Id=%22${encodeURIComponent(stub.sourceJobId)}%22,siteNumber=${site}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return DetailResponseSchema.parse(await res.json()).items[0];
    },

    normalize(raw: unknown) {
      return normalizeOracleCloud(raw, employer);
    },
  };
}
