import { parse } from 'node-html-parser';
import type { JobStub, ProvinceCode } from '@/lib/types';
import type { Connector } from './types';

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
