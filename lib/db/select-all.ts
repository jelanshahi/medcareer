/** Matches PostgREST's default max-rows cap on Supabase. */
export const SELECT_PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: unknown };

/**
 * Reads every row of a query that can exceed PostgREST's 1000-row response cap. An unpaged
 * select past the cap does not fail -- it silently returns the first 1000 rows, so counts and
 * facet lists look plausible and are wrong.
 *
 * `page(from, to)` must apply `.range(from, to)` to a query with a stable `.order()`, or rows
 * can repeat or go missing between pages. Stops on the first short page.
 */
export async function selectAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await page(from, from + SELECT_PAGE_SIZE - 1);
    // supabase-js resolves with { data, error } rather than rejecting.
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < SELECT_PAGE_SIZE) return rows;
  }
}
