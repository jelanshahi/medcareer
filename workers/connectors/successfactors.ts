import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * SAP SuccessFactors career sites — the setup Nova Scotia Health and IWK Health share at
 * jobs.nshealth.ca. The search pages are plain server-rendered HTML carrying a posted date
 * per row, so postings past the age cutoff are skipped without ever being fetched.
 *
 * One host can carry several career sites (`/nsha/`, `/iwk/`, `/physicians/`), which is how
 * the two employers are told apart: every posting claims the same `hiringOrganization`.
 */
export type SuccessFactorsEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    key: string;
    host: string;
    /** URL segments of this employer's career sites, e.g. ["nsha", "physicians"]. */
    sites: string[];
  };
};

const DetailSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  title: z.string().min(1),
  postedAt: z.iso.datetime(),
  closesAt: z.iso.datetime().optional(),
  locality: z.string(),
  descriptionHtml: z.string().min(1),
  fields: z.record(z.string(), z.string()),
});
export type SuccessFactorsDetail = z.infer<typeof DetailSchema>;

const LIST_PAGE_SIZE = 25;
/** Runaway guard: the largest Nova Scotia site is 9 pages. */
const MAX_PAGES_PER_SITE = 200;

/** The labelled fields these postings open with. Order matters only for the lookahead below. */
const FIELD_LABELS = [
  'Req ID', 'Requisition ID', 'Company', 'Location', 'Department/Program', 'Department',
  'Type of Employment', 'Opportunity Type', 'Union', 'Posting Closing Date',
  'Estimated Annual Salary', 'Type of Remuneration',
];

const text = (html: string) => parse(html).text.replace(/\s+/g, ' ').trim();

export function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

/** "Sep 18, 2026" as the search pages write it. */
export function parseListDate(value: string): Date | undefined {
  const date = new Date(`${value.trim()} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseSearchPage(html: string, host: string, site: string): JobStub[] {
  const stubs: JobStub[] = [];
  for (const row of html.split(/<tr class="data-row/).slice(1)) {
    const href = row.match(/href="([^"]*\/job\/[^"]*)"/)?.[1]?.replace(/&amp;/g, '&');
    if (!href) continue;
    const url = requireHost(new URL(href, `https://${host}`).href, host);
    // The row repeats its location and dates; the first date is the posting date, and the
    // closing date that follows it is written differently ("25-Sep-26"), so this cannot
    // pick up the wrong one.
    const posted = row.match(/>\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*</)?.[1];
    const id = url.pathname.match(/\/(\d+)\/?$/)?.[1];
    if (!id) continue;

    stubs.push({
      sourceJobId: id,
      externalPath: `${url.pathname}${url.search}`,
      title: text(row.match(/<a[^>]*\/job\/[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
      locationsText: '',
      postedAt: posted ? parseListDate(posted) : undefined,
    });
  }
  return stubs;
}

/**
 * Postings open with a labelled block ("Req ID: … Location: … Type of Employment: …") whose
 * labels sit inside nested <strong> tags, so it is read from the text rather than the markup.
 * Each value runs until the next known label.
 */
export function parseDescriptionFields(descriptionText: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lookahead = FIELD_LABELS.map((l) => l.replace(/[/]/g, '\\/')).join('|');
  for (const label of FIELD_LABELS) {
    const match = descriptionText.match(
      new RegExp(`${label.replace(/[/]/g, '\\/')}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${lookahead})\\s*:|$)`),
    );
    const value = match?.[1]?.trim();
    // Values run to the end of the block on the last label, so cut anything that has clearly
    // run on into the body prose.
    if (value) fields[label] = value.split(/\s{2,}|About (?:the|This) Opportunity/)[0].trim().slice(0, 300);
  }
  return fields;
}

/** "Sat Sep 26 03:00:00 UTC 2026", the format the microdata uses. */
export function parseMicrodataDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function extractSuccessFactorsDetail(html: string): SuccessFactorsDetail {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta itemprop="${name}" content="([^"]*)"`))?.[1];

  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]
    ?? html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const postedAt = parseMicrodataDate(meta('datePosted'));

  // Read through a parser rather than slicing: the container is `<span class="jobdescription">`
  // on the Nova Scotia Health and IWK sites but `<span itemprop="description"
  // class="jobdescription">` on the physician site, and its end is only findable by nesting.
  const descriptionHtml = parse(html).querySelector('.jobdescription')?.innerHTML;
  if (!canonical || !title || !postedAt || !descriptionHtml) {
    throw new Error('SuccessFactors posting is missing url, title, posted date or description');
  }

  return DetailSchema.parse({
    url: canonical,
    title: text(title),
    postedAt: postedAt.toISOString(),
    closesAt: parseMicrodataDate(meta('validThrough'))?.toISOString(),
    locality: meta('addressLocality') ?? '',
    descriptionHtml,
    fields: parseDescriptionFields(text(descriptionHtml)),
  });
}

/** "Permanent Hourly FT (100%)", "Temporary Hourly PT", "Casual Relief". */
export function employmentTypeFromSuccessFactors(fields: Record<string, string>): EmploymentType | undefined {
  const value = (fields['Type of Employment'] || fields['Opportunity Type'] || '').toLowerCase();
  if (!value) return undefined;
  // Checked before full/part time: "Temporary Hourly FT" is a temporary post that happens to
  // be full-time hours, and the end date is what matters to a job seeker.
  if (/casual|relief/.test(value)) return 'casual';
  if (/temporary|temp\b/.test(value)) return 'temporary';
  if (/\bft\b|full.?time/.test(value)) return 'full_time';
  if (/\bpt\b|part.?time/.test(value)) return 'part_time';
  return undefined;
}

/**
 * The rate is prose, not a field: "Compensation and Benefits $38.43 - $50.99 hourly", and for
 * physician posts "Estimated Annual Salary: 100,000 - 150,000".
 */
export function parseSalary(descriptionText: string, fields: Record<string, string>) {
  const hourly = descriptionText.match(
    /\$\s*([\d,]+\.?\d*)\s*(?:-|–|to)\s*\$?\s*([\d,]+\.?\d*)\s*(hourly|per hour|\/\s*hour|annually|per year|\/\s*year)/i,
  );
  if (hourly) {
    const min = Number(hourly[1].replace(/,/g, ''));
    const max = Number(hourly[2].replace(/,/g, ''));
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max) {
      return { salaryMin: min, salaryMax: max, salaryPeriod: /hour/i.test(hourly[3]) ? ('hour' as const) : ('year' as const) };
    }
  }

  const annual = fields['Estimated Annual Salary']?.match(/([\d,]+)\s*(?:-|–|to)\s*([\d,]+)/);
  if (annual) {
    const min = Number(annual[1].replace(/,/g, ''));
    const max = Number(annual[2].replace(/,/g, ''));
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max) {
      return { salaryMin: min, salaryMax: max, salaryPeriod: 'year' as const };
    }
  }
  return {};
}

export function normalizeSuccessFactors(raw: unknown, employer: SuccessFactorsEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const url = requireHost(detail.url, employer.config.host);

  const sourceJobId = url.pathname.match(/\/(\d+)\/?$/)?.[1];
  if (!sourceJobId) throw new Error(`No job id at the end of "${detail.url}"`);

  // "All Locations" is what a province-wide posting says; the registry city stands in.
  const locality = detail.locality.trim();
  const city = locality && !/^all locations$/i.test(locality) ? locality : employer.defaultCity;

  // "Northern Zone, All Saints Springhill Hospital" — the site is the part after the zone.
  const location = detail.fields['Location'];
  const facilityName = location?.includes(',')
    ? location.split(',').pop()?.trim() || undefined
    : undefined;

  const descriptionText = text(detail.descriptionHtml);

  return {
    sourceId: `successfactors:${employer.config.key}`,
    sourceJobId,
    sourceUrl: detail.url,
    title: detail.title,
    employerName: employer.name,
    facilityName,
    description: sanitizeDescription(detail.descriptionHtml),
    city,
    // addressRegion is truncated to "Nova" on every Nova Scotia posting, so it is not used.
    province: employer.province,
    postedAt: new Date(detail.postedAt),
    closesAt: detail.closesAt ? new Date(detail.closesAt) : undefined,
    employmentType: employmentTypeFromSuccessFactors(detail.fields),
    ...parseSalary(descriptionText, detail.fields),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

export function createSuccessFactorsConnector(
  employer: SuccessFactorsEmployer,
  ctx: LogContext,
): Connector {
  const { key, host, sites } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };

  return {
    id: `successfactors:${key}`,
    kind: 'ats',
    // One page fetch per posting, and these postings do not change once published.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      // "<site index>:<startrow>" — one employer can span several career sites on one host.
      const [siteIndex, startRow] = (cursor ?? '0:0').split(':').map(Number);
      const site = sites[siteIndex];
      if (!site) return { items: [] };

      const url = `https://${host}/${site}/search/?startrow=${startRow}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Search fetch failed ${res.status} for ${url}`);

      const items = parseSearchPage(await res.text(), host, site);
      log(ctx, 'info', 'fetched search page', { site, startRow, returned: items.length });

      const morePages = items.length === LIST_PAGE_SIZE && startRow / LIST_PAGE_SIZE < MAX_PAGES_PER_SITE;
      const nextCursor = morePages
        ? `${siteIndex}:${startRow + LIST_PAGE_SIZE}`
        : siteIndex + 1 < sites.length ? `${siteIndex + 1}:0` : undefined;
      return { items, nextCursor };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Posting fetch failed ${res.status} for ${stub.sourceJobId}`);
      return extractSuccessFactorsDetail(await res.text());
    },

    normalize(raw: unknown) {
      return normalizeSuccessFactors(raw, employer);
    },
  };
}
