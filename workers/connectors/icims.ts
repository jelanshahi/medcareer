import { parse } from 'node-html-parser';
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
 * iCIMS career portals (careers-vch.icims.com and friends). Their robots.txt allows crawling
 * and points at a sitemap listing every open posting with a last-modified date, and each
 * posting carries schema.org JobPosting JSON-LD plus the employer's own labelled fields.
 */
export type IcimsEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    key: string;
    host: string;
    /** Region names the portal uses ("Greater Toronto") mapped to one city. */
    cityAliases?: Record<string, string>;
  };
};

const AddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.string().optional(),
  streetAddress: z.string().optional(),
});

const JobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.url({ protocol: /^https$/ }),
  datePosted: z.string().optional(),
  employmentType: z.string().optional(),
  baseSalary: z
    .object({ minValue: z.number().optional(), maxValue: z.number().optional() })
    .optional(),
  jobLocation: z.array(z.object({ address: AddressSchema })).optional(),
});

const DetailSchema = z.object({
  posting: JobPostingSchema,
  /** The sitemap's last-modified date for this URL, as a fallback posting date. */
  lastModified: z.iso.datetime({ offset: true }),
  fields: z.record(z.string(), z.string()),
});
export type IcimsDetail = z.infer<typeof DetailSchema>;

/** Runaway guard: VCH, the largest portal, lists ~930 postings. */
const MAX_JOBS = 5000;
const YEAR_MS = 365 * 86_400_000;

/** Throws when a URL from the portal points anywhere but the registry host. */
function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

export function parseIcimsSitemap(xml: string, host: string): JobStub[] {
  const stubs: JobStub[] = [];
  for (const m of xml.matchAll(/<loc>([^<]*\/jobs\/(\d+)\/[^<]*\/job)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
    const lastmod = new Date(m[3]);
    if (Number.isNaN(lastmod.getTime())) continue;
    stubs.push({
      sourceJobId: m[2],
      externalPath: requireHost(m[1], host).pathname,
      // The sitemap carries no title; the posting itself supplies it after hydration.
      title: '',
      locationsText: '',
      postedAt: lastmod,
    });
  }
  return stubs;
}

/**
 * VCH and Mackenzie Health publish a placeholder `datePosted` — always exactly two years
 * before the moment the page is served — so every posting would look two years old. The
 * sitemap's last-modified date matched the real posting date on 19 of 20 postings at the two
 * portals that do publish real ones, so it stands in wherever `datePosted` is not believable.
 */
export function resolvePostedAt(detail: IcimsDetail, now: Date = new Date()): Date {
  const lastModified = new Date(detail.lastModified);
  const posted = detail.posting.datePosted ? new Date(detail.posting.datePosted) : null;
  if (!posted || Number.isNaN(posted.getTime())) return lastModified;

  const age = now.getTime() - posted.getTime();
  const believable = age >= 0 && age < YEAR_MS;
  return believable ? posted : lastModified;
}

/**
 * The employer's own wording ("Temporary Part-Time", "Casual") beats schema.org's OTHER,
 * which is what these portals send for everything but plain full/part time.
 *
 * Ordered, not first-match: VCH carries both "Position Type: Baseline" — which says nothing
 * about hours — and "Job Status: Regular Full-Time", and the labels appear in that order.
 */
const STATUS_LABELS = ['job status', 'employee type', 'employment type', 'employee status', 'position type'];

export function employmentTypeFromIcims(detail: IcimsDetail): EmploymentType | undefined {
  const keys = Object.keys(detail.fields);
  const statusKey = STATUS_LABELS
    .map((label) => keys.find((k) => k.toLowerCase() === label))
    .find(Boolean);
  const status = (statusKey ? detail.fields[statusKey] : '').toLowerCase();
  if (status) {
    if (/casual|relief/.test(status)) return 'casual';
    if (/^temp/.test(status)) return 'temporary';
    if (/full.?time/.test(status)) return 'full_time';
    if (/part.?time/.test(status)) return 'part_time';
  }

  switch (detail.posting.employmentType) {
    case 'FULL_TIME': return 'full_time';
    case 'PART_TIME': return 'part_time';
    case 'TEMPORARY': return 'temporary';
    case 'CONTRACTOR': return 'contract';
    default: return undefined;
  }
}

function salaryFrom(detail: IcimsDetail) {
  const min = detail.posting.baseSalary?.minValue;
  const max = detail.posting.baseSalary?.maxValue;
  if (!min || !max || min > max) return {};
  // These portals quote hourly rates; an annual figure would be in the tens of thousands.
  return { salaryMin: min, salaryMax: max, salaryPeriod: max < 1000 ? ('hour' as const) : ('year' as const) };
}

/** Reads the JSON-LD posting and the portal's labelled `<dt>/<dd>` fields off a job page. */
export function extractIcimsDetail(html: string, lastModified: Date): IcimsDetail {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (!raw) throw new Error('iCIMS job page carries no JSON-LD posting');

  const fields: Record<string, string> = {};
  const text = (fragment: string) => parse(fragment).text.replace(/\s+/g, ' ').trim();
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const label = text(m[1]).replace(/:$/, '');
    if (label) fields[label] = text(m[2]);
  }

  return DetailSchema.parse({
    posting: JSON.parse(raw),
    lastModified: lastModified.toISOString(),
    fields,
  });
}

export function normalizeIcims(raw: unknown, employer: IcimsEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const { posting } = detail;
  requireHost(posting.url, employer.config.host);

  const sourceJobId = posting.url.match(/\/jobs\/(\d+)\//)?.[1];
  if (!sourceJobId) throw new Error(`No job id in "${posting.url}"`);

  const address = posting.jobLocation?.[0]?.address;
  const locality = (address?.addressLocality ?? '').trim();
  const city = employer.config.cityAliases?.[locality] ?? (locality || employer.defaultCity);

  const workLocationKey = Object.keys(detail.fields).find((k) => /work location|facility|site$/i.test(k));
  const street = address?.streetAddress;
  const facilityName = (workLocationKey ? detail.fields[workLocationKey] : undefined)
    ?? (street && street !== 'UNAVAILABLE' ? street : undefined);

  const shiftKey = Object.keys(detail.fields).find((k) => /shift/i.test(k));

  return {
    sourceId: `icims:${employer.config.key}`,
    sourceJobId,
    sourceUrl: posting.url,
    title: posting.title,
    employerName: employer.name,
    facilityName,
    description: sanitizeDescription(posting.description),
    city,
    province: provinceCodeFromName(address?.addressRegion ?? '') ?? employer.province,
    postedAt: resolvePostedAt(detail),
    // `validThrough` is a placeholder too (always a year out), so it is deliberately unused:
    // the 60-day expiry in dedupe is more honest than a made-up closing date.
    employmentType: employmentTypeFromIcims(detail),
    shiftType: shiftTypeFromPattern(shiftKey ? detail.fields[shiftKey] : undefined),
    ...salaryFrom(detail),
    applyUrl: posting.url,
  };
}

const limit = createHostLimiter();

export function createIcimsConnector(employer: IcimsEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };
  const lastModifiedById = new Map<string, Date>();

  return {
    id: `icims:${key}`,
    kind: 'ats',
    // One page fetch per posting, and these postings do not change once published, so known
    // ones are only marked as seen.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      // The sitemap lists every open posting in one response — there is nothing to page.
      if (cursor) return { items: [] };

      const url = `https://${host}/sitemap.xml`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Sitemap fetch failed ${res.status} for ${url}`);

      const items = parseIcimsSitemap(await res.text(), host).slice(0, MAX_JOBS);
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
      return extractIcimsDetail(await res.text(), lastModified);
    },

    normalize(raw: unknown) {
      return normalizeIcims(raw, employer);
    },
  };
}
