import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode, ShiftType } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * Oracle Taleo career portals fronted by the SelectMinds job board — the setup Alberta Health
 * Services (careers.albertahealthservices.ca) and Covenant Health (careers.covenanthealth.ca)
 * share. Taleo itself exposes no public job API, but the SelectMinds front end renders plain
 * server-side HTML: a paged search list and one detail page per job.
 */
export type TaleoEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  /** `key` names the source (`taleo:<key>`); `host` is the SelectMinds portal. */
  config: { key: string; host: string };
};

/** What `hydrate` stores in raw_postings.payload: the fields we read, not the ~70KB page. */
const DetailSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  title: z.string().min(1),
  location: z.string(),
  postedOn: z.iso.date(),
  descriptionHtml: z.string().min(1),
  fields: z.record(z.string(), z.string()),
});
export type TaleoDetail = z.infer<typeof DetailSchema>;

const LIST_PAGE_SIZE = 10;
/** Runaway guard: AHS, the largest portal, is ~106 pages. */
const MAX_PAGES = 400;

function decodeText(fragment: string): string {
  return parse(fragment).text.replace(/\s+/g, ' ').trim();
}

/** Throws when a URL from the page points anywhere but the registry host. */
function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

export function parseTaleoList(html: string, host: string): { total: number; stubs: JobStub[] } {
  const root = parse(html);
  const totalText = root.querySelector('.total_results')?.text.replace(/[^\d]/g, '');
  if (!totalText) throw new Error('Taleo list page has no result count');

  const stubs = root.querySelectorAll('.job_list_row').map((row) => {
    const id = row.id.match(/^job_list_(\d+)$/)?.[1];
    const link = row.querySelector('a.job_link');
    const href = link?.getAttribute('href');
    if (!id || !link || !href) throw new Error(`Malformed Taleo list row "${row.id}"`);
    return {
      sourceJobId: id,
      externalPath: requireHost(href, host).pathname,
      title: link.text.trim(),
      locationsText: row.querySelector('.location')?.text.replace(/\s+/g, ' ').trim() ?? '',
    };
  });

  return { total: Number(totalText), stubs };
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * The portal shows "Aug 29, 2026" for older jobs and "20 hours ago" / "6 days ago" for recent
 * ones. Relative dates are resolved against `now` at hydrate time and stored as a plain date,
 * so re-normalizing a stored payload later never shifts the posting date.
 */
export function parsePostDate(text: string, now: Date): string {
  const t = text.trim().toLowerCase();

  const absolute = t.match(/^([a-z]{3})[a-z]* (\d{1,2}), (\d{4})$/);
  if (absolute && MONTHS[absolute[1]]) {
    return `${absolute[3]}-${MONTHS[absolute[1]]}-${absolute[2].padStart(2, '0')}`;
  }

  const relative = t.match(/^(\d+|an?) (minute|hour|day|week)s? ago$/);
  const unitMs = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };
  if (relative) {
    const count = /^\d+$/.test(relative[1]) ? Number(relative[1]) : 1;
    const unit = relative[2] as keyof typeof unitMs;
    return new Date(now.getTime() - count * unitMs[unit]).toISOString().slice(0, 10);
  }
  if (t === 'today' || t === 'just now') return now.toISOString().slice(0, 10);
  if (t === 'yesterday') return new Date(now.getTime() - unitMs.day).toISOString().slice(0, 10);

  throw new Error(`Unparseable Taleo post date "${text}"`);
}

/**
 * Pure extraction from a detail page. The job-fields block is malformed HTML
 * (`<ul><b><li>Label: </b>value</li>`), which an HTML parser re-nests unpredictably, so those
 * fields and the description are read from the raw markup instead.
 */
export function extractTaleoDetail(html: string, now: Date): TaleoDetail {
  const root = parse(html);

  const url = root.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const title = root.querySelector('h1.title')?.text.replace(/\s+/g, ' ').trim();
  const postDate = root.querySelector('.job_post_date .field_value')?.text;
  const location = html.match(/location: \{ name: "([^"]*)"/)?.[1] ?? '';

  const start = html.indexOf('<div class="job_description">');
  const end = html.indexOf('<!-- TEC-19749', start);
  if (!url || !title || !postDate || start === -1 || end === -1) {
    throw new Error('Taleo detail page is missing url, title, post date or description');
  }
  const descriptionHtml = html.slice(start + '<div class="job_description">'.length, end);

  const fields: Record<string, string> = {};
  // `(?:<\/b>\s*)+`: some rows close the bold twice ("Multi-Site: </b></b>Not Applicable").
  for (const m of descriptionHtml.matchAll(/<li>([^:<]+):\s*(?:<\/b>\s*)+([^<]*)<\/li>/g)) {
    fields[m[1].trim()] = decodeText(m[2]);
  }

  return DetailSchema.parse({
    url,
    title,
    location: decodeText(location),
    postedOn: parsePostDate(postDate, now),
    descriptionHtml,
    fields,
  });
}

export function employmentTypeFromClass(fields: Record<string, string>): EmploymentType | undefined {
  const cls = (fields['Employee Class'] || fields['Temporary Employee Class'] || '').toLowerCase();
  if (!cls) return undefined;
  if (/casual|relief/.test(cls)) return 'casual';
  if (/^temp/.test(cls)) return 'temporary';
  if (/full.?time/.test(cls)) return 'full_time';
  if (/part.?time/.test(cls)) return 'part_time';
  return undefined;
}

/** "Days" → day; "Days, Evenings, Nights, Weekends" → rotating. Weekends/On Call qualify, not decide. */
export function shiftTypeFromPattern(pattern: string | undefined): ShiftType | undefined {
  if (!pattern) return undefined;
  const parts = new Set(pattern.toLowerCase().split(',').map((p) => p.trim()));
  const core = (['days', 'evenings', 'nights'] as const).filter((p) => parts.has(p));
  if (core.length > 1) return 'rotating';
  if (core[0] === 'days') return 'day';
  if (core[0] === 'evenings') return 'evening';
  if (core[0] === 'nights') return 'night';
  if (parts.has('weekends')) return 'weekend';
  return undefined;
}

function money(value: string | undefined): number | undefined {
  const n = Number((value ?? '').replace(/[$,\s]/g, ''));
  return value && Number.isFinite(n) && n > 0 ? n : undefined;
}

function salaryFrom(fields: Record<string, string>) {
  const min = money(fields['Minimum Salary'] ?? fields['Minimum Hourly Salary']);
  const max = money(fields['Maximum Salary'] ?? fields['Maximum Hourly Salary']);
  if (min === undefined || max === undefined || min > max) return {};
  // Every sampled AHS/Covenant posting quotes an hourly rate (highest seen: $80.20). An annual
  // figure would be in the tens of thousands, so the magnitude settles it.
  return { salaryMin: min, salaryMax: max, salaryPeriod: max < 1000 ? ('hour' as const) : ('year' as const) };
}

/** "28-SEP-2026" → end of that day in Alberta, so a job is never expired while still open. */
function closesAtFrom(value: string | undefined): Date | undefined {
  const m = value?.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!m || !month) return undefined;
  const date = new Date(`${m[3]}-${month}-${m[1].padStart(2, '0')}T23:59:59-07:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * The portal's markup reads as garbage once the non-allowed tags are stripped: the field list
 * is `<ul><b><li>Label: </b>value</li>`, which sanitizes to a label bullet followed by a loose
 * value, and section headings are `<font size="+1"><b>…</b></font>`. Rebuild both as allowed
 * tags before sanitizing.
 */
function tidyDescription(html: string, fields: Record<string, string>): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = Object.entries(fields)
    .filter(([, value]) => value)
    .map(([label, value]) => `<li><strong>${escape(label)}:</strong> ${escape(value)}</li>`)
    .join('');
  return html
    .replace(/<ul>(?:\s*<b>\s*<li>[^:<]+:\s*(?:<\/b>\s*)+[^<]*<\/li>)+\s*<\/ul>/, list ? `<ul>${list}</ul>` : '')
    .replace(/<font[^>]*>\s*<b>([^<]*)<\/b>\s*<\/font>/g, '<h4>$1</h4>');
}

export function normalizeTaleo(detail: unknown, employer: TaleoEmployer): NormalizedPosting {
  const d = DetailSchema.parse(detail);
  requireHost(d.url, employer.config.host);

  // "Edmonton Zone, Edmonton, Royal Alexandra Hospital": zone, city, facility. Province-wide
  // postings carry no location at all ("Primary Location: Alberta"), and a handful say
  // "Various Locations" -- those fall back to the registry city.
  const parts = d.location.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts[1] && !/various/i.test(parts[1]) ? parts[1] : employer.defaultCity;
  const primary = d.fields['Primary Location'];
  const facilityName = parts.length > 2
    ? parts.slice(2).join(', ')
    : primary && primary !== 'Alberta' && primary !== city ? primary : undefined;

  const sourceJobId = d.url.match(/-(\d+)$/)?.[1];
  if (!sourceJobId) throw new Error(`No job id at the end of "${d.url}"`);

  return {
    sourceId: `taleo:${employer.config.key}`,
    sourceJobId,
    sourceUrl: d.url,
    title: d.title,
    employerName: employer.name,
    facilityName,
    description: sanitizeDescription(tidyDescription(d.descriptionHtml, d.fields)),
    city,
    province: employer.province,
    postedAt: new Date(`${d.postedOn}T00:00:00Z`),
    closesAt: closesAtFrom(d.fields['Posting End Date']),
    employmentType: employmentTypeFromClass(d.fields),
    shiftType: shiftTypeFromPattern(d.fields['Shift Pattern']),
    ...salaryFrom(d.fields),
    applyUrl: d.url,
  };
}

const limit = createHostLimiter();

export function createTaleoConnector(employer: TaleoEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };

  return {
    id: `taleo:${key}`,
    kind: 'ats',
    // ~1,100 AHS detail pages at 1 req/s is ~20 minutes. Postings are static once published,
    // so after the first run only new jobs are fetched; known ones are just marked as seen.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      // An empty search redirects to a fresh `/jobs/search/<id>`; later pages hang off that id.
      const url = cursor ?? `https://${host}/jobs/search/`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);
      const searchUrl = requireHost(res.url, host).href.replace(/\/page\d+$/, '').replace(/\/$/, '');
      const page = Number(url.match(/\/page(\d+)$/)?.[1] ?? 1);

      const { total, stubs } = parseTaleoList(await res.text(), host);
      log(ctx, 'info', 'fetched list page', { page, returned: stubs.length, total });

      const hasMore = stubs.length > 0 && page * LIST_PAGE_SIZE < total && page < MAX_PAGES;
      return { items: stubs, nextCursor: hasMore ? `${searchUrl}/page${page + 1}` : undefined };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return extractTaleoDetail(await res.text(), new Date());
    },

    normalize(raw: unknown) {
      return normalizeTaleo(raw, employer);
    },
  };
}
