import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode, ShiftType } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

export type WorkdayEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { tenant: string; site: string; host: string; parseDescriptionHeader: boolean };
};

const ListItemSchema = z.object({
  title: z.string(),
  externalPath: z.string().startsWith('/job/'),
  locationsText: z.string().default(''),
  bulletFields: z.array(z.string()).default([]),
});

const ListSchema = z.object({ total: z.number(), jobPostings: z.array(ListItemSchema) });

const DetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string(),
    location: z.string().optional(),
    startDate: z.string(),
    timeType: z.string().optional(),
    jobReqId: z.string(),
    // Outbound URLs are built from the employers registry only, never user input, https: only
    // (plan Global Constraints). z.string().url() is scheme-agnostic and would pass
    // javascript:/data:/http: — use z.url() with a protocol restriction instead.
    externalUrl: z.url({ protocol: /^https$/ }),
  }),
  hiringOrganization: z.object({ name: z.string() }).optional(),
});

export function parseWorkdayList(payload: unknown): { total: number; stubs: JobStub[] } {
  const parsed = ListSchema.parse(payload);
  return {
    total: parsed.total,
    stubs: parsed.jobPostings.map((item) => ({
      sourceJobId: item.bulletFields[0] ?? item.externalPath,
      externalPath: item.externalPath,
      title: item.title,
      locationsText: item.locationsText,
    })),
  };
}

/**
 * SHN encodes its header-block line breaks as an HTML entity, sometimes double-escaped. Shared by
 * `parseDescriptionHeader` and `stripDescriptionHeader`, which must agree on the delimiter.
 * Safe to share despite the `g` flag: both uses are `.replace`, which resets `lastIndex`.
 */
const XA_ENTITY = /&amp;#xa;|&#xa;/gi;

export type HeaderFields = {
  union?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'year';
  shiftType?: ShiftType;
  employmentType?: EmploymentType;
};

/** SHN authoring convention only. Must fail soft — a missing header yields {}. */
export function parseDescriptionHeader(rawDescription: string): HeaderFields {
  const text = rawDescription.replace(XA_ENTITY, '\n');
  const fields: HeaderFields = {};

  // Each capture is bounded to [^\n<], which is the ONLY thing that ends it: the class stops the
  // match at a newline or at the start of the HTML body. There is deliberately no end anchor.
  // A trailing `$` is not merely redundant, it is fatal — the header block's last line is
  // unterminated in the real SHN fixture (`Hours: All Shifts<br />`), so after capturing the
  // value the next char is `<`, which is neither a newline nor end-of-input; since [^\n<]+ can
  // only give back characters that are also not `<`, `$` is unsatisfiable and the whole match
  // fails. `.trim()` because the class retains any whitespace sitting before the `<`.
  const union = text.match(/^Union:\s*([^\n<]+)/m);
  if (union) fields.union = union[1].trim();

  // Anchored to a line start like its three siblings. Unanchored it also matched rates
  // quoted in the BODY prose, so a posting whose header carries no rate at all picked up
  // an unrelated figure -- verified: a body mentioning "$99.00 - $199.00" yielded
  // salaryMin 99 / salaryMax 199 for a job the employer never quoted that for. Salary
  // drives a seeker's decision, so a wrong one is worse than none.
  const salary = text.match(/^Minimum\s*-\s*Maximum\s+(Hourly|Annual)\s+(?:Rate|Salary):\s*\$?([\d.,]+)\s*-\s*\$?([\d.,]+)/im);
  if (salary) {
    fields.salaryPeriod = salary[1].toLowerCase() === 'hourly' ? 'hour' : 'year';
    fields.salaryMin = Number(salary[2].replace(/,/g, ''));
    fields.salaryMax = Number(salary[3].replace(/,/g, ''));
  }

  const hours = text.match(/^Hours:\s*([^\n<]+)/m);
  if (hours) {
    const h = hours[1].trim().toLowerCase();
    // \b before "day" so "Saturday"/"Sunday" don't misclassify as a day shift.
    if (/night/.test(h)) fields.shiftType = 'night';
    else if (/evening/.test(h)) fields.shiftType = 'evening';
    else if (/rotat/.test(h)) fields.shiftType = 'rotating';
    else if (/\bday/.test(h)) fields.shiftType = 'day';
    else if (/weekend/.test(h)) fields.shiftType = 'weekend';
  }

  const jobType = text.match(/^Job Type:\s*([^\n<]+)/m);
  if (jobType) {
    const t = jobType[1].trim().toLowerCase();
    if (/casual/.test(t)) fields.employmentType = 'casual';
    else if (/temporary/.test(t)) fields.employmentType = 'temporary';
    else if (/full.?time/.test(t)) fields.employmentType = 'full_time';
    else if (/part.?time/.test(t)) fields.employmentType = 'part_time';
  }

  return fields;
}

/**
 * Strips the SHN-style plaintext metadata block (`Job Number: ...`, `Union: ...`, etc.) from the
 * front of a raw jobDescription so it doesn't get shown to job seekers as body prose alongside
 * the structured fields `parseDescriptionHeader` already extracted from it. Fail-soft: anything
 * that doesn't look like a header block (CHEO, Oak Valley — no header at all) passes through
 * byte-identical.
 */
export function stripDescriptionHeader(rawDescription: string): string {
  const normalized = rawDescription.replace(XA_ENTITY, '\n');
  // Require the known leading key rather than a generic `Key: value` shape. A shape test also
  // matches real prose ("Position Summary: We are hiring…"), and would then throw away every
  // character before the first "<" — i.e. the opening sentence of the posting.
  const looksLikeHeader = /^Job Number:\s/.test(normalized);
  if (!looksLikeHeader) return rawDescription;

  // Search the original raw string, not `normalized` — the entity substitution changes the
  // string length, and the entities themselves never contain "<", so the index of the first "<"
  // is identical between the two; using `rawDescription` avoids an offset mismatch.
  const cutIndex = rawDescription.indexOf('<');
  if (cutIndex === -1) return rawDescription;
  return rawDescription.slice(cutIndex);
}

function employmentTypeFromTimeType(timeType?: string): EmploymentType | undefined {
  if (!timeType) return undefined;
  const t = timeType.toLowerCase();
  if (t.includes('full')) return 'full_time';
  if (t.includes('part')) return 'part_time';
  return undefined;
}

export function normalizeWorkday(detail: unknown, employer: WorkdayEmployer): NormalizedPosting {
  const parsed = DetailSchema.parse(detail);
  const info = parsed.jobPostingInfo;

  const header = employer.config.parseDescriptionHeader
    ? parseDescriptionHeader(info.jobDescription)
    : {};

  // Outbound URLs are built from the employers registry only, never user input (plan Global
  // Constraints). The schema pins the scheme to https:, but externalUrl is still external data
  // that becomes the applyUrl a job seeker clicks, so the host must match the registry too.
  // Failing hard on one posting is correct: a connector failure never aborts the other sources.
  const externalHost = new URL(info.externalUrl).host;
  if (externalHost !== employer.config.host) {
    throw new Error(
      `externalUrl host "${externalHost}" does not match registry host ` +
        `"${employer.config.host}" for ${info.jobReqId}`,
    );
  }

  const postedAt = new Date(`${info.startDate}T00:00:00Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable startDate "${info.startDate}" for ${info.jobReqId}`);
  }

  return {
    sourceId: `workday:${employer.config.tenant}`,
    sourceJobId: info.jobReqId,
    sourceUrl: info.externalUrl,
    title: info.title,
    employerName: employer.name,
    facilityName: info.location,
    description: sanitizeDescription(
      employer.config.parseDescriptionHeader
        ? stripDescriptionHeader(info.jobDescription)
        : info.jobDescription,
    ),
    // Workday exposes no city; location is a facility string. City comes from the registry.
    city: employer.defaultCity,
    province: employer.province,
    postedAt,
    employmentType: header.employmentType ?? employmentTypeFromTimeType(info.timeType),
    shiftType: header.shiftType,
    salaryMin: header.salaryMin,
    salaryMax: header.salaryMax,
    salaryPeriod: header.salaryPeriod,
    applyUrl: info.externalUrl,
  };
}

const PAGE_SIZE = 20;
/**
 * Runaway guard. Pagination stops on a short page rather than on `total` (see fetchPage),
 * so a tenant that always returned a full page would loop forever. No Ontario hospital
 * posts anywhere near this many roles at once; hitting it means something is wrong.
 */
const MAX_OFFSET = 2000;
const limit = createHostLimiter();

export function createWorkdayConnector(employer: WorkdayEmployer, ctx: LogContext): Connector {
  const { tenant, site, host } = employer.config;
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const headers = { 'Content-Type': 'application/json', 'User-Agent': SITE.userAgent };

  return {
    id: `workday:${tenant}`,
    kind: 'ats',

    async fetchPage(cursor?: string) {
      const offset = cursor ? Number(cursor) : 0;
      const res = await limit(host, () => fetchWithBackoff(`${base}/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
      }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${base}/jobs`);
      const { total, stubs } = parseWorkdayList(await res.json());
      const nextOffset = offset + PAGE_SIZE;
      log(ctx, 'info', 'fetched list page', { offset, returned: stubs.length, total });
      // Paginate on a SHORT PAGE, not on `total`. Observed live on 2026-09-10: shn and
      // oakvalleyhealth return total:0 on every page after the first (cheo does not), so
      // `nextOffset < total` stopped both crawls at 40 of 114 and 40 of 70 respectively.
      // A full page means "ask again"; a short page is the only reliable end-of-list signal.
      const hasMore = stubs.length === PAGE_SIZE && nextOffset < MAX_OFFSET;
      return { items: stubs, nextCursor: hasMore ? String(nextOffset) : undefined };
    },

    async hydrate(stub) {
      const res = await limit(host, () => fetchWithBackoff(`${base}${stub.externalPath}`, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return res.json();
    },

    normalize(raw: unknown) {
      return normalizeWorkday(raw, employer);
    },
  };
}
