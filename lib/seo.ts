import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { isPlausibleCity } from '@/lib/normalize/city';

/** The site-wide pitch, used by the home page and as the layout's fallback. The
 * bare tagline ("Healthcare jobs across Canada") was too thin to earn a click
 * from a search result. */
export const HOME_DESCRIPTION =
  'Nursing, PSW, allied health, pharmacy and physician jobs from hospitals and health authorities across Canada. ' +
  'Every listing links straight to the employer’s own application page, refreshed every six hours.';

type PageMetaInput = {
  title: string;
  description: string;
  /** Path only ("/browse/toronto"); metadataBase in app/layout.tsx makes it absolute. */
  path: string;
  /** Keep the page out of the index but let crawlers follow its links. */
  noindex?: boolean;
};

/**
 * One place that turns a page's title/description/path into the full set of
 * search and social tags: canonical, Open Graph and Twitter. Next.js does not
 * derive og:title from <title>, and a child's `openGraph` replaces the
 * layout's wholesale rather than merging, so every page has to spell these
 * out — this helper is what keeps them from drifting apart.
 */
export function pageMeta({ title, description, path, noindex }: PageMetaInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      locale: 'en_CA',
      title,
      description,
      url: path,
    },
    twitter: { card: 'summary_large_image', title, description },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Ingest cleans city values (workers/dedupe.ts via lib/normalize/city.ts),
 * but a value it could not repair — no salvageable place and no employer
 * default — is still stored. It can be filtered on, but must never become an
 * indexed landing page. */
export function isIndexableCity(city: string): boolean {
  return isPlausibleCity(city);
}

/** A landing page with fewer listings than this is thin content: it still
 * renders (links must never go stale between refreshes) but is noindexed and
 * left out of the sitemap. Kept equal to the hub's LINK_THRESHOLD so a page is
 * advertised from /browse exactly when it is offered to search engines. */
export const INDEX_THRESHOLD = LINK_THRESHOLD;

export function isIndexableLanding(city: string, count: number): boolean {
  return isIndexableCity(city) && count >= INDEX_THRESHOLD;
}
