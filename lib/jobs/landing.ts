import { createServerClient } from '@/lib/db/server';

export type LandingRow = { city: string; category: string | null };

/** One unfiltered read of every active job's city and category. Every count on
 * every /browse page derives from this, the same approach the home page and
 * the /jobs facets already take. Cheap at current scale (a few hundred rows).
 * If active volume ever nears PostgREST's default 1000-row cap this needs an
 * explicit count query instead. */
export async function loadLandingRows(): Promise<LandingRow[]> {
  // supabase-js resolves { data, error } rather than rejecting; an unchecked
  // error here would render every landing page as an empty "0 jobs".
  const { data, error } = await createServerClient()
    .from('jobs')
    .select('city,category')
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as LandingRow[];
}

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
