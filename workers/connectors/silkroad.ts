import { parse } from 'node-html-parser';
import type { JobStub, ProvinceCode } from '@/lib/types';
import type { Connector } from './types';
import { provinceCodeFromName } from '@/lib/provinces';

/**
 * SilkRoad Technology career sites (jobs-ca.silkroad.com and friends) -- a classic
 * server-rendered ATS, not a SPA. robots.txt states `Crawl-Delay: 10`, which this connector's
 * rate limiter honours directly (see `limit` in Task 5) rather than deferring confirmation to a
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
