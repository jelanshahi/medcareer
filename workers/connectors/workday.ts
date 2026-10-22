import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
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
  config: {
    tenant: string;
    site: string;
    host: string;
    parseDescriptionHeader: boolean;
    /**
     * Source id suffix when one tenant carries several employers (Extendicare and ParaMed share
     * `extendicare`). Defaults to the tenant, which is what every older row's source id is.
     */
    key?: string;
    /**
     * Read city and province from each posting's location instead of the registry. For employers
     * spread over many towns and provinces; see `resolveWorkdayLocation`.
     */
    locationFromPosting?: boolean;
    /** Location strings that name a home but no town, mapped to "City, PR". */
    locationAliases?: Record<string, string>;
  };
};

/** The source id prefix-and-key for an employer's raw postings. */
export function workdaySourceId(config: WorkdayEmployer['config']): string {
  return `workday:${config.key ?? config.tenant}`;
}

const ListItemSchema = z.object({
  title: z.string(),
  externalPath: z.string().startsWith('/job/'),
  locationsText: z.string().default(''),
  postedOn: z.string().optional(),
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

const DAY_MS = 86_400_000;

/**
 * "Posted Today", "Posted Yesterday", "Posted 8 Days Ago", "Posted 30+ Days Ago" → an
 * approximate date, so the runner can skip a posting that is past the 30-day cutoff without
 * fetching it. "30+" is placed just past the cutoff: it says no more than that. Extendicare
 * keeps hundreds of evergreen postings open, and fetching each one every run to learn its
 * date would cost a request per posting for nothing.
 */
export function postedAtFromPostedOn(postedOn: string | undefined, now: Date = new Date()): Date | undefined {
  const text = (postedOn ?? '').toLowerCase();
  let days: number | undefined;
  if (/\btoday\b/.test(text)) days = 0;
  else if (/\byesterday\b/.test(text)) days = 1;
  else if (/30\+\s*days/.test(text)) days = 31;
  else {
    const match = text.match(/(\d+)\s*days?\s+ago/);
    if (match) days = Number(match[1]);
  }
  return days === undefined ? undefined : new Date(now.getTime() - days * DAY_MS);
}

export function parseWorkdayList(payload: unknown, now: Date = new Date()): { total: number; stubs: JobStub[] } {
  const parsed = ListSchema.parse(payload);
  return {
    total: parsed.total,
    stubs: parsed.jobPostings.map((item) => ({
      sourceJobId: item.bulletFields[0] ?? item.externalPath,
      externalPath: item.externalPath,
      title: item.title,
      locationsText: item.locationsText,
      postedAt: postedAtFromPostedOn(item.postedOn, now),
    })),
  };
}

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * City and province from a Workday location string. Extendicare and ParaMed write these by
 * hand, and they come in three shapes:
 *
 *   "LTC - Viking - 5020 - 57th Ave, P.O. Box 430, Viking, Alberta"   → Viking, AB
 *   "LTC - York (York St.) 333 York Street \nSudbury, ON"            → Sudbury, ON
 *   "LTC - Athabasca (53rd St.)"                                     → only via the alias map
 *
 * The town is the part before a trailing province, on the last line, after any "Name - "
 * prefix. A trailing note in brackets is dropped ("Lindsay, Ontario (Kent St Job Posting)").
 * A candidate with a digit in it is a street address, not a town, and is refused.
 *
 * Returns null rather than guessing: a care-home job filed under the wrong province is worse
 * than one left out, and the caller says which string needs an alias.
 */
export function resolveWorkdayLocation(
  location: string,
  aliases: Record<string, string> = {},
): { city: string; province: ProvinceCode } | null {
  const aliased = aliases[collapse(location)];
  const source = aliased ?? collapse(location.split('\n').pop() ?? '').replace(/\s*\([^)]*\)$/, '');

  const parts = source.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const province = provinceCodeFromName(parts[parts.length - 1]);
  if (!province) return null;

  const city = (parts[parts.length - 2].split(' - ').pop() ?? '').trim();
  if (!city || /\d/.test(city)) return null;
  return { city, province };
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

  let place = { city: employer.defaultCity, province: employer.province };
  if (employer.config.locationFromPosting) {
    const resolved = resolveWorkdayLocation(info.location ?? '', employer.config.locationAliases);
    // Thrown, so the runner logs the string and skips this one posting.
    if (!resolved) {
      throw new Error(`No town in Workday location "${collapse(info.location ?? '')}" for ${info.jobReqId}; add it to locationAliases`);
    }
    place = resolved;
  }

  return {
    sourceId: workdaySourceId(employer.config),
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
    // Workday exposes no city field; location is a facility string. City comes from the
    // registry, unless the employer opts into reading it from that string.
    city: place.city,
    province: place.province,
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
 * Runaway guard, for when every end condition in `nextWorkdayPage` fails. Extendicare, the
 * largest tenant, lists ~470; hitting this means something is wrong.
 */
const MAX_OFFSET = 2000;
const limit = createHostLimiter();

export type WorkdayCrawlState = { firstTotal?: number; seen: Set<string> };

/**
 * What one list page adds, and where the next one starts. Three ways a crawl ends:
 *
 * - A short page.
 * - The first page's `total` is reached. Only the first page's: SHN and Oak Valley report
 *   total 0 on every later page (observed 2026-09-10), so a later total is ignored.
 * - A page that brings nothing new. Past the end, Workday does not return an empty page, it
 *   serves page one again (SHN, 120 postings: offset 200 returns the first page). Read
 *   naively, every request was a full page, so SHN was crawled to MAX_OFFSET -- 100 list pages
 *   and 2,000 detail fetches, 34 minutes of an ingest job with a 60-minute limit -- and every
 *   run from 21 Oct 2026 was cancelled before the jobs table was rebuilt.
 */
export function nextWorkdayPage(
  state: WorkdayCrawlState,
  offset: number,
  total: number,
  stubs: JobStub[],
): { fresh: JobStub[]; nextOffset?: number } {
  if (offset === 0 && total > 0) state.firstTotal = total;

  const fresh = stubs.filter((s) => !state.seen.has(s.sourceJobId));
  for (const s of fresh) state.seen.add(s.sourceJobId);

  const nextOffset = offset + PAGE_SIZE;
  const hasMore = stubs.length === PAGE_SIZE
    && fresh.length > 0
    && (state.firstTotal === undefined || nextOffset < state.firstTotal)
    && nextOffset < MAX_OFFSET;
  return { fresh, nextOffset: hasMore ? nextOffset : undefined };
}

export function createWorkdayConnector(employer: WorkdayEmployer, ctx: LogContext): Connector {
  const { tenant, site, host } = employer.config;
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const headers = { 'Content-Type': 'application/json', 'User-Agent': SITE.userAgent };
  // One connector per ingest run, so this is one crawl's worth of state.
  const crawl: WorkdayCrawlState = { seen: new Set() };

  return {
    id: workdaySourceId(employer.config),
    kind: 'ats',
    refreshKnown: true,

    async fetchPage(cursor?: string) {
      const offset = cursor ? Number(cursor) : 0;
      const res = await limit(host, () => fetchWithBackoff(`${base}/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
      }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${base}/jobs`);
      const { total, stubs } = parseWorkdayList(await res.json());
      const { fresh, nextOffset } = nextWorkdayPage(crawl, offset, total, stubs);
      log(ctx, 'info', 'fetched list page', { offset, returned: stubs.length, fresh: fresh.length, total });
      return { items: fresh, nextCursor: nextOffset === undefined ? undefined : String(nextOffset) };
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
