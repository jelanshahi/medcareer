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
 * Phenom career sites, which Sienna Senior Living runs at `careers.siennaliving.ca`.
 *
 * The board is a single-page app, but every posting is also a real page carrying a complete
 * schema.org JobPosting, and the sitemap lists all of them. robots.txt disallows only the
 * apply, chatbot, job-cart and tracking paths — the job pages and the sitemap are open.
 *
 * Sienna operates long-term care and retirement homes in more than one province, so the
 * province comes from each posting rather than from the registry row.
 */
export type PhenomEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { key: string; host: string };
};

const AddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.string().optional(),
});

const JobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  datePosted: z.string().min(1),
  employmentType: z.union([z.string(), z.array(z.string())]).optional(),
  jobLocation: z.object({ address: AddressSchema.optional() }).optional(),
  /** "PSW, HCA and Guest Attendant" — the board's own grouping, kept for the log only. */
  occupationalCategory: z.string().optional(),
});

const DetailSchema = z.object({
  posting: JobPostingSchema,
  url: z.url({ protocol: /^https$/ }),
});
export type PhenomDetail = z.infer<typeof DetailSchema>;

/** Runaway guard: Sienna, the only tenant so far, lists ~490 postings. */
const MAX_JOBS = 5000;

function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

const decode = (value: string) => parse(value).text;

/**
 * Job URLs are `/job/{id}/{Title-Slug}`. Parsed one `<url>` block at a time rather than by a
 * pattern spanning `</loc>` to `<lastmod>`, for the same reason as the Quebec sitemaps: a
 * pattern that assumes the two are adjacent reads zero postings the day a tag appears between
 * them, and the run still reports success.
 */
export function parsePhenomSitemap(xml: string, host: string): JobStub[] {
  const stubs: JobStub[] = [];
  for (const block of xml.split('</url>')) {
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    if (!loc) continue;

    const path = requireHost(loc, host).pathname;
    const id = path.match(/^\/job\/([^/]+)\//)?.[1];
    if (!id) continue;

    const lastmod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
    const modified = lastmod ? new Date(lastmod) : undefined;

    stubs.push({
      sourceJobId: id,
      externalPath: path,
      title: '',
      locationsText: '',
      /**
       * The sitemap's modified date, used only to skip a posting past the cutoff before
       * fetching it. It matched `datePosted` on the postings checked, but the posting's own
       * date is what gets stored, and the runner checks that again after hydration.
       */
      postedAt: modified && !Number.isNaN(modified.getTime()) ? modified : undefined,
    });
    if (stubs.length >= MAX_JOBS) break;
  }
  return stubs;
}

export function extractPhenomDetail(html: string, url: string): PhenomDetail {
  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      // The page carries several JSON-LD blocks — WebPage, BreadcrumbList, JobPosting — and
      // not all of them are well formed. Keep looking rather than giving up on the first.
      continue;
    }
    const graph = (parsed as { '@graph'?: unknown[] })['@graph'] ?? [parsed];
    for (const node of graph) {
      if ((node as { '@type'?: string })['@type'] !== 'JobPosting') continue;
      return DetailSchema.parse({ posting: node, url });
    }
  }
  throw new Error('Phenom job page carries no JobPosting JSON-LD');
}

export function employmentTypeFromPhenom(value: string | string[] | undefined): EmploymentType | undefined {
  const first = (Array.isArray(value) ? value[0] : value)?.toUpperCase();
  switch (first) {
    case 'FULL_TIME': return 'full_time';
    case 'PART_TIME': return 'part_time';
    case 'TEMPORARY': return 'temporary';
    case 'CONTRACTOR': return 'contract';
    case 'PER_DIEM': return 'casual';
    default: return undefined;
  }
}

export function normalizePhenom(raw: unknown, employer: PhenomEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const { posting } = detail;
  const url = requireHost(detail.url, employer.config.host);

  const sourceJobId = url.pathname.match(/^\/job\/([^/]+)\//)?.[1];
  if (!sourceJobId) throw new Error(`No job id in "${detail.url}"`);

  const postedAt = new Date(posting.datePosted);
  if (Number.isNaN(postedAt.getTime())) throw new Error(`Unreadable datePosted "${posting.datePosted}"`);

  const address = posting.jobLocation?.address;

  return {
    sourceId: `phenom:${employer.config.key}`,
    sourceJobId,
    sourceUrl: detail.url,
    title: decode(posting.title).replace(/\s+/g, ' ').trim(),
    employerName: employer.name,
    // The board names no site or home per posting — the residence appears inside the
    // description prose instead, which is not a field we can read reliably.
    description: sanitizeDescription(decode(posting.description)),
    city: address?.addressLocality?.trim() || employer.defaultCity,
    // This operator runs homes in more than one province, so the posting decides.
    province: provinceCodeFromName(address?.addressRegion ?? '') ?? employer.province,
    postedAt,
    employmentType: employmentTypeFromPhenom(posting.employmentType),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

export function createPhenomConnector(employer: PhenomEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };

  return {
    id: `phenom:${key}`,
    kind: 'ats',
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      if (cursor) return { items: [] };

      const url = `https://${host}/sitemap.xml`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Sitemap fetch failed ${res.status} for ${url}`);

      const items = parsePhenomSitemap(await res.text(), host);
      log(ctx, 'info', 'fetched sitemap', { returned: items.length });
      return { items };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return extractPhenomDetail(await res.text(), url);
    },

    normalize(raw: unknown) {
      return normalizePhenom(raw, employer);
    },
  };
}
