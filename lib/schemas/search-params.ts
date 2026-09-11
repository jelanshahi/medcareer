import { z } from 'zod';
import { CATEGORIES, type Category } from '@/lib/taxonomy/categories';

export const PAGE_SIZE = 25;
export const MAX_LIMIT = 50;

const SearchParamsSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  category: z.enum([...CATEGORIES] as [Category, ...Category[]]).optional(),
  page: z.coerce.number().int().min(1).max(400).catch(1),
});

export type SearchParams = z.infer<typeof SearchParamsSchema>;

/** Never trust the query string. Unparseable input degrades to defaults. */
export function parseSearchParams(
  input: Record<string, string | string[] | undefined>,
): SearchParams {
  const flat = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  // Parse field by field so one bad value does not discard the good ones.
  const shape = SearchParamsSchema.shape;
  return {
    q: shape.q.safeParse(flat.q).data,
    city: shape.city.safeParse(flat.city).data,
    category: shape.category.safeParse(flat.category).data,
    page: shape.page.parse(flat.page),
  };
}
