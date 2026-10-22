import { cache } from 'react';
import { createServerClient } from '@/lib/db/server';
import { selectAll } from '@/lib/db/select-all';
import { slugifyCity } from '@/lib/jobs/city-slug';
import { roleOf } from '@/lib/taxonomy/roles';

/**
 * Every active job's listing-level columns — enough to render a job row, count it by
 * province, role or employer, and summarise its pay. Drives the province, role, employer
 * and salary pages, which slice the same set different ways.
 *
 * Paged past PostgREST's 1000-row cap (selectAll throws on a query error, so a failure
 * never renders as an empty page). Wrapped in React's cache() so generateMetadata and the
 * page body share one read per request instead of making two.
 */
export type CatalogRow = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  category: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

export type CatalogJob = CatalogRow & { role: string | null; employerSlug: string };

const COLUMNS =
  'slug,title,employer_name,facility_name,city,province,category,employment_type,salary_min,salary_max,salary_period,posted_at';

/**
 * Reading the whole active set is a dozen paged round trips, and was most of a ~1.1s TTFB
 * on every province, role, employer and pay page. Ingest only changes the set every six
 * hours, so a warm server instance keeps its last read for a few minutes and shares one
 * in-flight read between concurrent requests. In memory rather than unstable_cache: the
 * set is several MB serialised, past what the data cache will store per entry. A failed
 * read is never kept, so the next request retries.
 */
const CATALOG_TTL_MS = 5 * 60 * 1000;
let memo: { at: number; jobs: Promise<CatalogJob[]> } | null = null;

async function readCatalog(): Promise<CatalogJob[]> {
  const db = createServerClient();
  const rows = await selectAll<CatalogRow>((from, to) =>
    db.from('jobs').select(COLUMNS).eq('is_active', true).order('id').range(from, to),
  );
  return rows.map((r) => ({ ...r, role: roleOf(r.title)?.slug ?? null, employerSlug: slugifyCity(r.employer_name) }));
}

export const loadCatalog = cache(async (): Promise<CatalogJob[]> => {
  if (!memo || Date.now() - memo.at > CATALOG_TTL_MS) {
    const jobs = readCatalog();
    const entry = { at: Date.now(), jobs };
    memo = entry;
    jobs.catch(() => {
      if (memo === entry) memo = null;
    });
  }
  return memo.jobs;
});

/** Newest first, capped — the list a landing page shows. */
export function newest<T extends { posted_at: string }>(jobs: T[], limit: number): T[] {
  return [...jobs].sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at)).slice(0, limit);
}

/** Counts by a key, as [key, count] pairs, largest first. Null keys are skipped. */
export function countBy<T>(items: T[], key: (item: T) => string | null): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
