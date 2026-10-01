import { parse } from 'node-html-parser';
import { z } from 'zod';
import type { JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import type { Connector } from './types';
import { provinceCodeFromName } from '@/lib/provinces';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';

/**
 * SilkRoad Technology career sites (jobs-ca.silkroad.com and friends) -- a classic
 * server-rendered ATS, not a SPA. robots.txt states `Crawl-Delay: 10`, which this connector's
 * rate limiter honours directly (see `limit` below) rather than deferring confirmation to a
 * later pre-flight step the way SmartRecruiters' rate limit needed to be.
 */
export type SilkRoadEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    host: string;
    /** First URL path segment, e.g. "MAHC", "Baycrest". */
    tenant: string;
    /** Second URL path segment, e.g. "MAHCCareers", "Careers". */
    boardCode: string;
  };
};

export function parseSilkRoadListing(html: string, tenant: string, boardCode: string): JobStub[] {
  const root = parse(html);
  const prefix = `/${tenant}/${boardCode}/jobs/`;
  const ids = new Set<string>();
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    // Require the remainder after the prefix to be purely digits, so a deeper path like
    // "/MAHC/MAHCCareers/jobs/1621/apply" (if one exists) is not mistaken for a job id.
    if (href && href.startsWith(prefix) && /^\d+$/.test(href.slice(prefix.length))) {
      ids.add(href.slice(prefix.length));
    }
  }
  return [...ids].map((id) => ({
    sourceJobId: id,
    externalPath: `${prefix}${id}`,
    // The listing page's link text is not a reliable title source across tenants; hydrate()
    // always fetches the full detail page regardless, same as every HTML-scraping connector here.
    title: '',
    locationsText: '',
  }));
}

/** Reads the first `application/ld+json` script's parsed content, if the page has one. */
export function extractJsonLd(html: string): unknown {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

/** "CA-ON" -> "ON". Also accepts a bare code. Null for anything unrecognized. */
export function provinceFromIsoRegion(region?: string): ProvinceCode | null {
  if (!region) return null;
  const code = region.startsWith('CA-') ? region.slice(3) : region;
  return provinceCodeFromName(code);
}

/**
 * Finds the value of a labelled field by the text of its <h2>, not by its container's id --
 * ids are partly tenant-specific custom fields (MAHC's "mahc_positiontype" etc.), but the
 * human-readable label is what a future tenant on this fallback path is most likely to share.
 * node-html-parser exposes no parentNode/nextSibling/nextElementSibling (confirmed against its
 * own type definitions, node_modules/node-html-parser/dist/nodes/html.d.ts), so this reads each
 * whole field container and its own <h2>/<div> children, rather than walking from the <h2> to
 * "the next sibling" the way a full DOM API would allow.
 */
export function fieldByLabel(root: ReturnType<typeof parse>, label: string): string | undefined {
  for (const container of root.querySelectorAll('[id^="ConfigurablePageDetail__"]')) {
    const heading = container.querySelector('h2');
    if (heading?.text.trim() !== label) continue;
    const value = container.querySelector('div');
    return value?.text.trim() || undefined;
  }
  return undefined;
}

/**
 * "100 Frank Miller Dr, Huntsville, Ontario, Canada" -> city "Huntsville", province "ON".
 * Indexed from the END of the comma list, not the start: the leading street-address portion is
 * variable-length (it may be absent entirely), but the trailing "..., city, province, country"
 * shape is constant -- unlike oraclecloud.ts's parseLocation, which can safely index from the
 * start because its "city, province, country" shape has no variable-length prefix.
 */
export function parseLabelLocation(location: string): { city?: string; province: ProvinceCode | null } {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts.length >= 3 ? parts[parts.length - 3] : undefined;
  const province = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  return { city, province: province ? provinceCodeFromName(province) : null };
}

/** "9/3/2026" -> Date at UTC midnight. Throws on anything that is not exactly M/D/YYYY. */
export function parseSilkRoadLabelDate(value: string): Date {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Unparseable Posted Date "${value}"`);
  const [, month, day, year] = match;
  const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Unparseable Posted Date "${value}"`);
  return date;
}

const JsonLdAddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.string().optional(),
});

const JsonLdJobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  datePosted: z.string().min(1),
  jobLocation: z.object({ address: JsonLdAddressSchema }).optional(),
});

export function normalizeSilkRoad(html: string, employer: SilkRoadEmployer, sourceJobId: string): NormalizedPosting {
  const { host, tenant, boardCode } = employer.config;
  const url = `https://${host}/${tenant}/${boardCode}/jobs/${sourceJobId}`;

  const jsonLdRaw = extractJsonLd(html);
  const jsonLd = jsonLdRaw ? JsonLdJobPostingSchema.safeParse(jsonLdRaw) : undefined;

  if (jsonLd?.success) {
    const { title, description, datePosted, jobLocation } = jsonLd.data;
    const postedAt = new Date(datePosted);
    if (Number.isNaN(postedAt.getTime())) {
      throw new Error(`Unparseable datePosted "${datePosted}" for ${sourceJobId}`);
    }
    const address = jobLocation?.address;

    return {
      sourceId: `silkroad:${tenant}`,
      sourceJobId,
      sourceUrl: url,
      title,
      employerName: employer.name,
      description: sanitizeDescription(description),
      city: address?.addressLocality || employer.defaultCity,
      province: provinceFromIsoRegion(address?.addressRegion) ?? employer.province,
      postedAt,
      applyUrl: url,
    };
  }

  // Label-based fallback: this tenant's pages carry no JSON-LD.
  const root = parse(html);
  const titleEl = root.getElementById('Jobs_JobDetail_TitleText');
  const descriptionEl = root.getElementById('ConfigurablePageDetail__JobDescription');
  if (!titleEl || !descriptionEl) {
    throw new Error(`Missing title or description for ${sourceJobId}`);
  }

  const locationLabel = fieldByLabel(root, 'Job Location');
  const location = locationLabel ? parseLabelLocation(locationLabel) : undefined;

  const postedLabel = fieldByLabel(root, 'Posted Date');
  if (!postedLabel) {
    // A JSON-LD block that exists but fails schema validation falls through to this path
    // silently; if the label path then also can't find a date, the error should say so rather
    // than looking like a plain "no JSON-LD, no label" case.
    const jsonLdNote = jsonLdRaw ? ' (a JSON-LD block was present but failed schema validation)' : '';
    throw new Error(`No Posted Date field for ${sourceJobId}${jsonLdNote}`);
  }

  return {
    sourceId: `silkroad:${tenant}`,
    sourceJobId,
    sourceUrl: url,
    title: titleEl.text.trim(),
    employerName: employer.name,
    description: sanitizeDescription(descriptionEl.innerHTML),
    city: location?.city || employer.defaultCity,
    province: location?.province ?? employer.province,
    postedAt: parseSilkRoadLabelDate(postedLabel),
    applyUrl: url,
  };
}

const PAGE_SIZE = 10;
/** Runaway guard: the largest tenant seen during design was ~3 pages (26 postings); 20 is
 *  generous headroom. Without this, a tenant that ignores or clamps `?page=N` and keeps
 *  returning the same full page would loop forever, eating the whole shared ingest run at
 *  this host's 10-second crawl delay. */
const MAX_PAGES = 20;

const HydratedPageSchema = z.object({
  html: z.string().min(1),
  sourceJobId: z.string().min(1),
});

// robots.txt on jobs-ca.silkroad.com states "Crawl-Delay: 10" -- a 10-second minimum interval,
// not the default 1 second every other connector here uses. Both employers share this one host,
// so they automatically share this one rate budget, the same shared-host behavior already
// established for SmartRecruiters and Manitoba's SuccessFactors tenant.
const limit = createHostLimiter(10_000);

export function createSilkRoadConnector(employer: SilkRoadEmployer, ctx: LogContext): Connector {
  const { host, tenant, boardCode } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };
  const base = `https://${host}/${tenant}/${boardCode}`;
  // Per-connector-instance state: a tenant that keeps returning the same full page (ignoring
  // ?page=N) would otherwise look like infinite "new" pages forever.
  const seenIds = new Set<string>();

  return {
    id: `silkroad:${tenant}`,
    kind: 'ats',
    // One detail fetch per posting, and postings don't change once published, so known ones
    // are only marked as seen -- same reasoning as iCIMS and Oracle Cloud.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      const page = cursor ? Number(cursor) : 1;
      const url = `${base}?page=${page}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }, { baseDelayMs: 10_000 }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);

      const allItems = parseSilkRoadListing(await res.text(), tenant, boardCode);
      const items = allItems.filter((item) => !seenIds.has(item.sourceJobId));
      for (const item of items) seenIds.add(item.sourceJobId);
      log(ctx, 'info', 'fetched list page', {
        page, returned: items.length, duplicatesSkipped: allItems.length - items.length,
      });

      // Stop on a short page, once a page adds nothing new, or past MAX_PAGES -- this platform
      // publishes no total count to paginate against, so a short/duplicate page or the page cap
      // are the only reliable end-of-list signals.
      const hasMore = allItems.length === PAGE_SIZE && items.length > 0 && page < MAX_PAGES;
      return { items, nextCursor: hasMore ? String(page + 1) : undefined };
    },

    async hydrate(stub) {
      const url = `${base}/jobs/${stub.sourceJobId}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }, { baseDelayMs: 10_000 }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return { html: await res.text(), sourceJobId: stub.sourceJobId };
    },

    normalize(raw: unknown) {
      const { html, sourceJobId } = HydratedPageSchema.parse(raw);
      return normalizeSilkRoad(html, employer, sourceJobId);
    },
  };
}
