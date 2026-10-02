import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
import type { JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import { employmentTypeFromPhenom } from './phenom';
import type { Connector } from './types';

/**
 * SE Health's own careers site, `careers.sehc.com`: a Kentico site that lists every open
 * posting across Ontario and Alberta (home care, nursing, PSW, rehab, corporate) in a
 * server-rendered, paged list, and carries a schema.org JobPosting on each posting page.
 * robots.txt is `Disallow:` (nothing) and names a sitemap, whose `lastmod` dates are years
 * stale and so no use for freshness — the list is the source of truth instead.
 *
 * **Not enabled: the host's WAF challenges the crawler.** After about 350 requests in half an
 * hour from one address (a full list crawl plus a sample of postings, run a few times while
 * building this), every request — including with a browser User-Agent — began returning an F5
 * CAPTCHA page ("Validation needed due to the detection of invalid input from this client IP
 * address, error code 338") with HTTP 200. A production first run is about the same size, so the
 * employer row is seeded inactive pending SE Health's permission. See
 * docs/research/canada-health-ats.md. The empty-first-page check below exists because that page
 * parses as zero postings.
 *
 * Two more traps:
 *
 * - **The list wraps.** `?page=N` past the last page does not 404 or come back empty; it
 *   serves page 1 again, so "stop on an empty page" never stops. The crawl ends when a page's
 *   first posting is page 1's first posting.
 * - **The certificate chain is incomplete.** The server presents the Sectigo root where the
 *   `OV R36` intermediate belongs. Browsers fetch the missing intermediate themselves; Node does
 *   not, so every request fails with "unable to verify the first certificate". The fix keeps
 *   verification on: `NODE_EXTRA_CA_CERTS=workers/certs/sectigo-ov-r36.pem` adds the real
 *   intermediate (fetched from the leaf's own CA Issuers link, and checked to chain to a root Node
 *   already trusts). Never switch verification off for this. The workflow sets the variable.
 */
export type SeHealthEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { key: string; host: string; cityAliases?: Record<string, string> };
};

const POSTING_PREFIX = '/current-positions/';

/** Runaway guard: the board runs to 32 pages of 10 today. */
const MAX_PAGES = 100;

const AddressSchema = z.object({
  addressLocality: z.string().optional(),
});

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
});
export type SeHealthDetail = z.infer<typeof DetailSchema>;

function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

const decode = (value: string) => parse(value).text;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * "Posted 3 Days Ago" → the newest date it can mean. A coarse age is only ever used to skip a
 * posting before fetching it, so it must never skip one that is really inside the cutoff:
 * "3 Weeks Ago" could be 21 to 27 days old, and reading it as exactly 21 days errs towards
 * keeping it. Months go the other way: "2 Months Ago" is at least 60 days old on any reading,
 * so it is always past the ingest cutoff and is dated 30 days a month. That matters here —
 * about half the board is months old, and an old posting that is skipped is never recorded, so
 * without this each run would fetch every one of those pages again. "1 Month Ago" could be 30 to
 * 59 days, too coarse to decide, so it is left unset and the posting's own `datePosted` decides.
 */
export function postedAtFromAge(text: string, now: Date): Date | undefined {
  const lower = text.trim().toLowerCase();
  if (/\btoday\b/.test(lower)) return now;
  const match = lower.match(/(\d+)\s+(hour|day|week|month)s?\s+ago/);
  if (!match) return undefined;
  const count = Number(match[1]);
  if (match[2] === 'month') return count >= 2 ? new Date(now.getTime() - count * 30 * DAY_MS) : undefined;
  const unit = match[2] === 'hour' ? HOUR_MS : match[2] === 'day' ? DAY_MS : 7 * DAY_MS;
  return new Date(now.getTime() - count * unit);
}

/** One page of the list. A row's job id is its URL slug, e.g. `registered-nurse-(4)`. */
export function parseSeHealthList(html: string, host: string, now: Date = new Date()): JobStub[] {
  const stubs: JobStub[] = [];
  const root = parse(html);
  for (const row of root.querySelectorAll('.current-positions-results-item')) {
    const link = row.querySelector('.job-position-title a');
    const href = link?.getAttribute('href');
    if (!href) continue;

    const path = requireHost(new URL(href, `https://${host}`).href, host).pathname;
    if (!path.startsWith(POSTING_PREFIX)) continue;
    const slug = path.slice(POSTING_PREFIX.length);
    if (!slug) continue;

    stubs.push({
      sourceJobId: slug,
      externalPath: path,
      title: link?.text.replace(/\s+/g, ' ').trim() ?? '',
      locationsText: row.querySelector('.job-position-location')?.text.trim() ?? '',
      postedAt: postedAtFromAge(row.querySelector('.job-position-opened-date')?.text ?? '', now),
    });
  }
  return stubs;
}

export function extractSeHealthDetail(html: string, url: string): SeHealthDetail {
  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if ((parsed as { '@type'?: string })['@type'] !== 'JobPosting') continue;
    return DetailSchema.parse({ posting: parsed, url });
  }
  throw new Error('SE Health job page carries no JobPosting JSON-LD');
}

/**
 * `datePosted` is "2026-10-01 12:00:00 AM": a date with a midnight placeholder, in no stated
 * zone, which `new Date()` would read in the machine's own zone. Only the date is meaningful,
 * so it is pinned to noon UTC, which is the same calendar day in every Canadian zone.
 */
export function parseSeHealthDate(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Unreadable datePosted "${value}"`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(date.getTime())) throw new Error(`Unreadable datePosted "${value}"`);
  return date;
}

/** "Innisfil, ON" → city and province. The location carries both; `addressRegion` is empty. */
export function splitLocation(value: string): { city: string; province?: ProvinceCode } {
  const comma = value.lastIndexOf(',');
  if (comma === -1) return { city: value.trim() };
  const province = provinceCodeFromName(value.slice(comma + 1));
  // A trailing piece that is not a province is part of the name, not a region to drop.
  if (!province) return { city: value.trim() };
  const city = value.slice(0, comma).trim();
  // "Ontario, ON" is a province-wide posting, not a place called Ontario; an empty city lets the
  // registry's default stand in rather than minting a /browse/ontario page.
  return { city: provinceCodeFromName(city) ? '' : city, province };
}

export function normalizeSeHealth(raw: unknown, employer: SeHealthEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const { posting } = detail;
  const url = requireHost(detail.url, employer.config.host);

  if (!url.pathname.startsWith(POSTING_PREFIX)) throw new Error(`Not a posting URL: "${detail.url}"`);
  const sourceJobId = url.pathname.slice(POSTING_PREFIX.length);
  if (!sourceJobId) throw new Error(`No job id in "${detail.url}"`);

  const { city, province } = splitLocation(decode(posting.jobLocation?.address?.addressLocality ?? ''));

  return {
    sourceId: `sehc:${employer.config.key}`,
    sourceJobId,
    sourceUrl: detail.url,
    title: decode(posting.title).replace(/\s+/g, ' ').trim(),
    employerName: employer.name,
    description: sanitizeDescription(decode(posting.description)),
    city: (city && employer.config.cityAliases?.[city]) || city || employer.defaultCity,
    // SE Health posts in more than one province, so the posting decides.
    province: province ?? employer.province,
    postedAt: parseSeHealthDate(posting.datePosted),
    employmentType: employmentTypeFromPhenom(posting.employmentType),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

const CERT_HINT =
  'If this is a certificate error, set NODE_EXTRA_CA_CERTS=workers/certs/sectigo-ov-r36.pem (the host sends an incomplete chain)';

export function createSeHealthConnector(employer: SeHealthEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };
  // Set while reading page 1, then compared against every later page to spot the wrap.
  let firstSlug: string | undefined;

  const get = async (url: string) => {
    try {
      return await limit(host, () => fetchWithBackoff(url, { headers }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // fetchWithBackoff keeps only the outer "fetch failed", which hides a TLS cause.
      throw new Error(message.includes('fetch failed') ? `${message}. ${CERT_HINT}` : message);
    }
  };

  return {
    id: `sehc:${key}`,
    kind: 'ats',
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      const page = cursor ? Number(cursor) : 1;
      if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) return { items: [] };

      const url = `https://${host}/job-openings?page=${page}`;
      const res = await get(url);
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);

      const items = parseSeHealthList(await res.text(), host);
      // A board with no openings at all is not something this employer has ever shown, but the
      // WAF's CAPTCHA page (HTTP 200, no rows) is. Reading it as "no postings" would report
      // success and let every stored job age out, so an empty first page is an error.
      if (page === 1 && items.length === 0) {
        throw new Error(`No postings on the first page of ${url}: blocked by the WAF, or the layout changed`);
      }
      if (page === 1) firstSlug = items[0].sourceJobId;
      // Past the last page the board serves page 1 again rather than an empty page.
      if (items.length === 0 || (page > 1 && items[0].sourceJobId === firstSlug)) return { items: [] };

      log(ctx, 'info', 'fetched list page', { page, returned: items.length });
      return { items, nextCursor: String(page + 1) };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await get(url);
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return extractSeHealthDetail(await res.text(), url);
    },

    normalize(raw: unknown) {
      return normalizeSeHealth(raw, employer);
    },
  };
}
