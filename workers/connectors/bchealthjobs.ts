import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * The unbranded ASP.NET careers application that Interior Health and Northern Health both run
 * (`jobs.interiorhealth.ca`, `expectmore.northernhealth.ca`). It carries no vendor name
 * anywhere in the markup; the signature to recognise it by is the `/ViewJobPosting/{id}` URL,
 * so if a third BC authority turns up on the same app it belongs on this connector.
 *
 * Both hosts allow crawling — robots.txt names a sitemap and disallows nothing — and neither
 * organisation publishes any terms of use restricting it (checked 20 Sep 2026).
 */
export type BcHealthJobsEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { key: string; host: string };
};

const AddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.string().optional(),
  streetAddress: z.string().optional(),
});

/** `jobLocation` is a single object here, not the array iCIMS sends. */
const JobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  datePosted: z.string().optional(),
  employmentType: z.string().optional(),
  jobLocation: z.object({ address: AddressSchema }).optional(),
});

const DetailSchema = z.object({
  posting: JobPostingSchema,
  /** Built from the registry host and the sitemap path: the JSON-LD carries no `url`. */
  url: z.url({ protocol: /^https$/ }),
  /** The sitemap's last-modified date for this URL. See `resolvePostedAt`. */
  lastModified: z.iso.datetime({ offset: true }),
  fields: z.record(z.string(), z.string()),
});
export type BcHealthJobsDetail = z.infer<typeof DetailSchema>;

/** Runaway guard: Interior Health, the larger of the two, lists ~1,350 postings. */
const MAX_JOBS = 5000;

/** Throws when a URL from the portal points anywhere but the registry host. */
function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

export function parseBcHealthJobsSitemap(xml: string, host: string): JobStub[] {
  const stubs: JobStub[] = [];
  // `\s*` between the tags, though both hosts currently serve the sitemap minified: if either
  // ever pretty-prints it, a tighter pattern would match nothing, the run would report success
  // with 0 fetched, and expire_stale_jobs would quietly deactivate the whole source a week
  // later. Same reason icims.ts allows it.
  const pattern = /<loc>([^<]*\/ViewJobPosting\/(\d+))<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
  for (const m of xml.matchAll(pattern)) {
    const lastmod = new Date(m[3]);
    if (Number.isNaN(lastmod.getTime())) continue;
    stubs.push({
      sourceJobId: m[2],
      externalPath: requireHost(m[1], host).pathname,
      // The sitemap carries no title or location; the posting supplies both after hydration.
      title: '',
      locationsText: '',
      postedAt: lastmod,
    });
  }
  return stubs;
}

/**
 * The detail fields, which the page lays out as a card of `<h6>` label / `<p>` value pairs:
 * Competition #, Employee Type, Bargaining Unit, Facility, Location, Department, Reports To,
 * Close Date, and — on about half of postings — Hourly Wage.
 *
 * The pair must be adjacent. The same `card-text` class is used for "Share this posting"
 * immediately after the last field, and requiring a label before the value keeps it out.
 */
export function parseCardFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const text = (fragment: string) => parse(fragment).text.replace(/\s+/g, ' ').trim();
  const pattern = /<h6[^>]*class="card-title[^"]*"[^>]*>([\s\S]*?)<\/h6>\s*<p[^>]*class="card-text"[^>]*>([\s\S]*?)<\/p>/g;
  for (const m of html.matchAll(pattern)) {
    const label = text(m[1]).replace(/:$/, '');
    if (label && !(label in fields)) fields[label] = text(m[2]);
  }
  return fields;
}

/**
 * The sitemap's `<lastmod>` and the posting's own `datePosted` agreed exactly on all ten
 * postings sampled across a 3.5-year spread, and `lastmod` is never bumped — the oldest entry
 * in the sitemap is from 2023. That is what lets the runner drop a posting past the 30-day
 * cutoff without fetching it, which matters more here than anywhere else we crawl: these two
 * authorities leave postings open until filled, so 83% of the sitemap is older than 30 days.
 *
 * The posting's own date still wins when it parses, being the employer's own statement.
 */
export function resolvePostedAt(detail: BcHealthJobsDetail): Date {
  const lastModified = new Date(detail.lastModified);
  if (!detail.posting.datePosted) return lastModified;

  // "2026-9-18": month and day are not zero-padded, so this is not ISO 8601. Handing it to
  // `new Date` would parse it in local time and could shift the date by a day, so it is split
  // by hand and rebuilt in UTC.
  const m = detail.posting.datePosted.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return lastModified;
  const posted = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(posted.getTime()) ? lastModified : posted;
}

/**
 * "PERMANENT FULL TIME", "RELIEF FULL TIME", "TERM SPECIFIC FULL TIME", "CASUAL",
 * "PERMANENT PART TIME (0.50 FTE)".
 *
 * Ordered, not first-match. "Relief" is BC health's word for covering someone else's line and
 * "term specific" for a fixed end date; both describe the engagement rather than the hours, so
 * they are tested before the full/part time half of the same string.
 */
export function employmentTypeFromBc(value: string | undefined): EmploymentType | undefined {
  const status = (value ?? '').toLowerCase();
  if (!status) return undefined;
  if (/casual|relief/.test(status)) return 'casual';
  if (/term specific|temporary|term\b/.test(status)) return 'temporary';
  if (/full.?time/.test(status)) return 'full_time';
  if (/part.?time/.test(status)) return 'part_time';
  return undefined;
}

/** "$29.76 - $31.64". Absent on about half of postings, which quote no rate at all. */
export function parseHourlyWage(value: string | undefined) {
  if (!value) return {};
  const amounts = [...value.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (amounts.length === 0) return {};
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  // The field is labelled "Hourly Wage", but the guard costs nothing and stops an annual
  // figure ever being quoted to applicants as an hourly rate.
  return { salaryMin: min, salaryMax: max, salaryPeriod: max < 1000 ? ('hour' as const) : ('year' as const) };
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/**
 * "SEPTEMBER 20, 2026", or "OPEN UNTIL FILLED" on the majority, which sets no date.
 *
 * Anchored to the **end** of the closing day, not its start. `closesAt` becomes `expires_at`
 * in dedupe, so a plain `new Date(value)` — local midnight — would take the posting off the
 * site at the very start of the day it actually closes, losing applicants a full day. This is
 * the same fix, for the same reason, as `closesAtFrom` in taleo.ts.
 *
 * -08:00 year round: BC is -08:00 in winter and -07:00 under daylight time. Using the winter
 * offset means a summer posting stays live one hour past local midnight rather than expiring
 * an hour early, which is the safe direction to be wrong in.
 */
export function parseCloseDate(value: string | undefined): Date | undefined {
  if (!value || /open until filled/i.test(value)) return undefined;
  const m = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const month = m && MONTHS[m[1].toLowerCase()];
  if (!m || !month) return undefined;
  const closes = new Date(`${m[3]}-${month}-${m[2].padStart(2, '0')}T23:59:59-08:00`);
  return Number.isNaN(closes.getTime()) ? undefined : closes;
}

const MINOR_WORDS = new Set(['of', 'and', 'the', 'at', 'in', 'for', 'to', 'on', 'or', 'a']);

/**
 * Facility comes back shouted, abbreviated, and truncated by the source at about 25 characters
 * ("CASTLEGAR DIST HLTH CTR", "DAWSON CREEK & DIST HOSPI" — that last one is cut off at source,
 * not here). Title case stops the job cards shouting.
 *
 * Two departures from plain title case, both ordinary usage rather than a list of this site's
 * acronyms: joining words stay lowercase, so "UNIV. HOSPITAL OF N. BC" does not become
 * "Univ. Hospital Of N. Bc"; and the employer's own province code stays uppercase, because
 * "Bc" on a BC job board reads as a typo.
 *
 * Genuine acronyms the source uses — FSJ (Fort St. John), EK (East Kootenay), CHSC — are still
 * title cased, and "Fsj Hosp/Health Centre" is the cost of that. No rule separates them from
 * the vowel-less abbreviations they sit beside (Hlth, Ctr, Rgnl, Bndry, Svc), which all read
 * better title cased, and a hand-written list of the acronyms would go stale.
 *
 * The apostrophe is kept inside the word so "ST. PAUL'S" does not become "St. Paul'S".
 */
export function titleCase(value: string, provinceCode?: string): string {
  const province = provinceCode?.toLowerCase();
  let isFirstWord = true;
  return value.replace(/[A-Za-z'’]+/g, (w) => {
    const lower = w.toLowerCase();
    const first = isFirstWord;
    isFirstWord = false;
    if (province && lower === province) return w.toUpperCase();
    if (!first && MINOR_WORDS.has(lower)) return lower;
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
  });
}

/**
 * "Flexible" is how this site says a role has no fixed site — it is not a place, and shown on
 * a job card as the facility it would mislead. Same for the other placeholders it uses.
 */
const PLACEHOLDER_FACILITY = /^(flexible|various|multiple|tbd|n\/?a)\b/i;

/**
 * Tokens that must survive title casing of a shouted job title. Clinical abbreviations come
 * from the same set the dedupe title normalizer keeps in lib/normalize/title.ts, plus the unit
 * and imaging ones these two authorities actually use. Roman numerals are in here because
 * grade markers are common in this data ("ACTIVITY WORKER II"), and "Activity Worker Ii" would
 * be worse than the shouting it replaced.
 */
const TITLE_ACRONYMS = new Set([
  'RN', 'RPN', 'LPN', 'NP', 'PSW', 'HCA', 'RCA', 'MLT', 'MRT', 'SLP', 'MOA', 'LPNS',
  'ICU', 'NICU', 'PICU', 'CCU', 'ER', 'OR', 'UPCC', 'MHSU', 'ECG', 'EEG', 'MRI', 'CT',
  'I', 'II', 'III', 'IV', 'V',
]);

/**
 * Northern Health shouts every job title ("REGISTERED NURSE (RN), MED SURG") and Interior
 * Health does not: 117 of Northern's 118 postings are fully uppercase against 0 of Interior's
 * 216. Left alone, one authority shouts on the job cards while the other beside it reads
 * normally.
 *
 * Only a title that is *entirely* uppercase is touched, so Interior's are passed through
 * untouched and a future mixed-case title from either is safe.
 */
export function displayTitle(value: string): string {
  if (value !== value.toUpperCase()) return value;
  let isFirstWord = true;
  return value.replace(/[A-Za-z'’]+/g, (w) => {
    const first = isFirstWord;
    isFirstWord = false;
    const upper = w.toUpperCase();
    if (TITLE_ACRONYMS.has(upper)) return upper;
    const lower = w.toLowerCase();
    if (!first && MINOR_WORDS.has(lower)) return lower;
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
  });
}

/**
 * Northern Health writes "Prince George, BC"; Interior Health writes plain "Castlegar".
 *
 * The suffix is stripped from whichever value is used, not just from the JSON-LD one:
 * `jobLocation` is optional, and Northern Health's "Location" card field carries the same
 * suffix, so stripping only the first would file those postings under a city named
 * "Prince George, BC".
 */
function cityFrom(locality: string, fallback: string): string {
  const strip = (value: string) => value.replace(/,\s*[A-Za-z]{2}\s*$/, '').trim();
  return strip(locality) || strip(fallback);
}

export function extractBcHealthJobsDetail(html: string, url: string, lastModified: Date): BcHealthJobsDetail {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new Error('BC careers job page carries no JSON-LD posting');

  return DetailSchema.parse({
    posting: JSON.parse(raw),
    url,
    lastModified: lastModified.toISOString(),
    fields: parseCardFields(html),
  });
}

export function normalizeBcHealthJobs(raw: unknown, employer: BcHealthJobsEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const { posting, fields } = detail;
  const url = requireHost(detail.url, employer.config.host);

  const sourceJobId = url.pathname.match(/\/ViewJobPosting\/(\d+)/)?.[1];
  if (!sourceJobId) throw new Error(`No job id in "${detail.url}"`);

  const address = posting.jobLocation?.address;
  const locality = (address?.addressLocality ?? '').trim();
  const facility = fields['Facility'];

  return {
    sourceId: `bchealthjobs:${employer.config.key}`,
    sourceJobId,
    sourceUrl: detail.url,
    title: displayTitle(posting.title),
    // One host is one authority here, unlike the shared Manitoba site, so the registry name is
    // used in preference to `hiringOrganization` ("Interior Health Authority") to keep employer
    // names on the site consistent with how we name everyone else.
    employerName: employer.name,
    facilityName: facility && !PLACEHOLDER_FACILITY.test(facility)
      ? titleCase(facility, employer.province)
      : undefined,
    description: sanitizeDescription(posting.description),
    city: cityFrom(locality, fields['Location'] || employer.defaultCity),
    province: provinceCodeFromName(address?.addressRegion ?? '') ?? employer.province,
    postedAt: resolvePostedAt(detail),
    closesAt: parseCloseDate(fields['Close Date']),
    // `||`, not `??`: a card whose "Employee Type" is present but blank is an empty string,
    // which `??` treats as a value and would leave the employment type null rather than
    // falling back to the JSON-LD.
    employmentType: employmentTypeFromBc(fields['Employee Type'] || posting.employmentType),
    // This site states no shift anywhere: not in the JSON-LD, not in the labelled fields, not
    // in the description prose (checked across both authorities). Left undefined, not guessed.
    ...parseHourlyWage(fields['Hourly Wage']),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

export function createBcHealthJobsConnector(employer: BcHealthJobsEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };
  const lastModifiedById = new Map<string, Date>();

  return {
    id: `bchealthjobs:${key}`,
    kind: 'ats',
    // One page fetch per posting, and a posting does not change once published, so known
    // stubs are only marked as seen.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      // The sitemap lists every open posting in one response — there is nothing to page.
      if (cursor) return { items: [] };

      const url = `https://${host}/sitemap.xml`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Sitemap fetch failed ${res.status} for ${url}`);

      const items = parseBcHealthJobsSitemap(await res.text(), host).slice(0, MAX_JOBS);
      for (const item of items) if (item.postedAt) lastModifiedById.set(item.sourceJobId, item.postedAt);

      log(ctx, 'info', 'fetched sitemap', { returned: items.length });
      return { items };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);

      const lastModified = stub.postedAt ?? lastModifiedById.get(stub.sourceJobId);
      if (!lastModified) throw new Error(`No sitemap date held for ${stub.sourceJobId}`);
      return extractBcHealthJobsDetail(await res.text(), url, lastModified);
    },

    normalize(raw: unknown) {
      return normalizeBcHealthJobs(raw, employer);
    },
  };
}
