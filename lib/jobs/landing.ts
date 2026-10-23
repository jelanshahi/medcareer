import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/db/server';
import { selectAll } from '@/lib/db/select-all';

export type LandingRow = { city: string; province: string; category: string | null };

async function readLandingRows(): Promise<LandingRow[]> {
  const db = createServerClient();
  return selectAll((from, to) =>
    db.from('jobs').select('city,province,category').eq('is_active', true).order('id').range(from, to),
  );
}

/** Every active job's city, province and category. Every count on every /browse
 * page derives from this, the same approach the home page and the /jobs facets
 * take. Paged: with Alberta added, active jobs pass PostgREST's 1000-row cap.
 *
 * The read is eight paged round trips (~7.9K jobs), and it ran twice per request
 * (metadata and page) on routes that crawlers hit tens of thousands of times, which
 * used up the Fluid CPU allowance in days. It is now held in the shared data cache
 * for six hours, the ingest cadence, so a refresh never lags ingest by more than one run. The
 * value is ~350KB, well under the data cache's per-entry limit. React's cache()
 * dedupes the metadata and page calls within one render. A failed read throws
 * and is not cached. */
const cachedLandingRows = unstable_cache(readLandingRows, ['landing-rows'], { revalidate: 21600 });

export const loadLandingRows = cache((): Promise<LandingRow[]> => cachedLandingRows());

export function countsByCity(rows: LandingRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.city] = (out[r.city] ?? 0) + 1;
  return out;
}

export function countsByCategory(rows: LandingRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.category) continue;
    out[r.category] = (out[r.category] ?? 0) + 1;
  }
  return out;
}

export function pairCount(rows: LandingRow[], city: string, category: string): number {
  return rows.filter((r) => r.city === city && r.category === category).length;
}

/** Landing pages below this count still render — a link must never go stale
 * between refreshes — but are not linked from the hub or the asides, so we do
 * not parade one-job pages (spec section 6.1). */
export const LINK_THRESHOLD = 3;
