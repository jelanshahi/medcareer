import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';

/** City names come from employer feeds, not from a fixed list, so landing-page
 * URLs are derived from the stored value rather than a hand-maintained map.
 * Keep this lossy-but-stable: two cities that slugify identically would
 * collide, which is why resolveCity returns the first exact slug match and the
 * caller 404s on null rather than guessing. */
export function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Maps a URL slug back to the exact stored city name, or null when we carry
 * no such city. Null must become notFound() at the call site — never a query
 * with an unvalidated string. */
export function resolveCity(slug: string, cities: string[]): string | null {
  const wanted = slugifyCity(slug);
  if (!wanted) return null;
  return cities.find((c) => slugifyCity(c) === wanted) ?? null;
}

/** Category keys are already URL-safe, so a discipline slug is just a key.
 * Validates before it reaches a query. */
export function isCategorySlug(value: string): value is Category {
  return value in CATEGORY_LABELS;
}
