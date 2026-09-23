import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * WordPress running the WP Job Manager plugin, which Quebec's health employers share:
 * `/poste/{slug}/` pages, a `job_listing` sitemap, and schema.org JobPosting JSON-LD.
 *
 * Only MUHC (`carrieres.cusm.ca`) is active. The seven Santé Québec sites on the same
 * platform are seeded inactive: they link from their footers to the Government of Quebec's
 * copyright policy, which forbids reproducing, storing or publishing its content "sans
 * autorisation préalable", and storing a description is exactly what this pipeline does.
 * MUHC publishes no terms of use and links only privacy notices. See
 * docs/research/canada-health-ats.md; switching the others on is one SQL update once Santé
 * Québec answers.
 */
export type WpJobManagerEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    key: string;
    host: string;
    /** Yoast's path by default; sites on WordPress core sitemaps override it. */
    sitemapPath?: string;
  };
};

const YOAST_SITEMAP = '/job_listing-sitemap.xml';

/** `jobLocation.address` is a bare string here, not the PostalAddress the schema implies. */
const AddressSchema = z.union([
  z.string(),
  z.object({ addressLocality: z.string().optional(), addressRegion: z.string().optional() }),
]);

const JobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  datePosted: z.string().min(1),
  employmentType: z.union([z.string(), z.array(z.string())]).optional(),
  jobLocation: z.object({ address: AddressSchema.optional() }).optional(),
});

const DetailSchema = z.object({
  posting: JobPostingSchema,
  url: z.url({ protocol: /^https$/ }),
  fields: z.record(z.string(), z.string()).optional(),
});
export type WpJobManagerDetail = z.infer<typeof DetailSchema>;

/** Runaway guard: the largest of these sites lists ~156 postings. */
const MAX_JOBS = 5000;

function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

/** Entity decode. Twice for plain text, once for a value that is meant to be HTML. */
const decode = (value: string) => parse(value).text;

/**
 * Parsed one `<url>` block at a time rather than by a single pattern spanning `</loc>` to
 * `<lastmod>`: the Capitale-Nationale site puts `<xhtml:link hreflang>` alternates between
 * them, and an adjacency-based pattern reads zero postings there while the run still reports
 * success — the quiet failure that empties a source.
 */
export function parseWpSitemap(xml: string, host: string): JobStub[] {
  const stubs: JobStub[] = [];
  for (const block of xml.split('</url>')) {
    const loc = block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
    if (!loc || !lastmod) continue;

    const path = requireHost(loc, host).pathname;
    const slug = path.match(/^\/poste\/([^/]+)\/?$/)?.[1];
    if (!slug) continue;

    const modified = new Date(lastmod);
    if (Number.isNaN(modified.getTime())) continue;

    stubs.push({
      sourceJobId: slug,
      externalPath: path,
      title: '',
      locationsText: '',
      /**
       * The *modified* date, not the posted one — WordPress bumps it on every edit, and it
       * matched `datePosted` on only 6 of 16 postings sampled. It is carried anyway because
       * nothing is modified before it is posted, so it is a safe upper bound: the runner can
       * skip a posting whose last edit is already past the cutoff without fetching it, and
       * checks the real `datePosted` again after hydration.
       */
      postedAt: modified,
    });
  }
  return stubs;
}

/** Reads the JobPosting out of the page's JSON-LD, which may be wrapped in an `@graph`. */
export function extractWpJobManagerDetail(html: string, url: string): WpJobManagerDetail {
  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      // A page can carry several JSON-LD blocks and only some are well formed; keep looking.
      continue;
    }
    const graph = (parsed as { '@graph'?: unknown[] })['@graph'] ?? [parsed];
    for (const node of graph) {
      if ((node as { '@type'?: string })['@type'] !== 'JobPosting') continue;
      return DetailSchema.parse({ posting: node, url });
    }
  }
  throw new Error('WP Job Manager page carries no JobPosting JSON-LD');
}

export function employmentTypeFromWp(value: string | string[] | undefined): EmploymentType | undefined {
  const first = (Array.isArray(value) ? value[0] : value)?.toUpperCase();
  switch (first) {
    case 'FULL_TIME': return 'full_time';
    case 'PART_TIME': return 'part_time';
    case 'TEMPORARY': return 'temporary';
    case 'CONTRACTOR': return 'contract';
    default: return undefined;
  }
}

/**
 * Quebec appends the administrative region in brackets — "LaSarre (Abitibi-Témiscamingue)",
 * "Val d'Or (Abitibi-Témiscamingue)" — on every city but Montréal. Left alone each becomes its
 * own city on the site, with a slug to match, so the same town splits from itself as soon as a
 * second employer writes it plainly.
 */
const stripRegion = (city: string) => city.replace(/\s*\([^)]*\)\s*$/, '').trim();

export function cityFromAddress(address: unknown, fallback: string): string {
  const raw = typeof address === 'string'
    ? address
    : (address as { addressLocality?: string } | undefined)?.addressLocality ?? '';
  return stripRegion(decode(raw).trim()) || fallback;
}

export function normalizeWpJobManager(raw: unknown, employer: WpJobManagerEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const { posting } = detail;
  const url = requireHost(detail.url, employer.config.host);

  const sourceJobId = url.pathname.match(/^\/poste\/([^/]+)\/?$/)?.[1];
  if (!sourceJobId) throw new Error(`No posting slug in "${detail.url}"`);

  const postedAt = new Date(posting.datePosted);
  if (Number.isNaN(postedAt.getTime())) throw new Error(`Unreadable datePosted "${posting.datePosted}"`);

  return {
    sourceId: `wpjobmanager:${employer.config.key}`,
    sourceJobId,
    sourceUrl: detail.url,
    // Twice: the stored value already held an entity ("l&rsquo;exercice") before the JSON-LD
    // encoder escaped the ampersand, so one pass leaves "&rsquo;" showing to the applicant.
    // The third pass is a no-op, so this is not a guess about depth.
    title: decode(decode(posting.title)).replace(/\s+/g, ' ').trim(),
    // `hiringOrganization.name` is empty on every posting seen, so the registry names it.
    employerName: employer.name,
    // Once only: one pass turns the escaped markup back into HTML and leaves its own
    // entities alone, which is what the sanitizer and the job page want.
    description: sanitizeDescription(decode(posting.description)),
    city: cityFromAddress(posting.jobLocation?.address, employer.defaultCity),
    province: employer.province,
    postedAt,
    // `validThrough` is a placeholder — exactly a year after `datePosted`, or the year end —
    // so it is deliberately unused, as on iCIMS. The 60-day expiry in dedupe is more honest.
    employmentType: employmentTypeFromWp(posting.employmentType),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

export function createWpJobManagerConnector(employer: WpJobManagerEmployer, ctx: LogContext): Connector {
  const { key, host, sitemapPath } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };

  return {
    id: `wpjobmanager:${key}`,
    kind: 'ats',
    // One page fetch per posting, and the sitemap's modified date already filters most of
    // them out before hydration.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      if (cursor) return { items: [] };

      const url = `https://${host}${sitemapPath ?? YOAST_SITEMAP}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Sitemap fetch failed ${res.status} for ${url}`);

      const items = parseWpSitemap(await res.text(), host).slice(0, MAX_JOBS);
      log(ctx, 'info', 'fetched sitemap', { returned: items.length });
      return { items };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return extractWpJobManagerDetail(await res.text(), url);
    },

    normalize(raw: unknown) {
      return normalizeWpJobManager(raw, employer);
    },
  };
}
