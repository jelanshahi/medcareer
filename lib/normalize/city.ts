/**
 * City values come straight from employer feeds, and some are not places at
 * all: "TBD", "Various Locations", or a sentence about which towns a role
 * serves ("Killarney service will be provided to Boissevain, Cartwright,
 * Deloraine and Glenboro"). Each distinct value becomes a /browse landing page
 * and a filter option, so a bad one is a junk page on the live site.
 *
 * Cleaning happens in workers/dedupe.ts, which rebuilds every job row on every
 * run — so a fix here also repairs rows already stored, on the next run.
 * raw_postings keeps the original value; fingerprints are computed from it and
 * are deliberately not affected.
 */

const PLACEHOLDER_CITIES = new Set([
  'tbd', 'tba', 'n/a', 'na', 'none', 'unknown', 'various', 'multiple', 'other',
  'various locations', 'multiple locations', 'multiple sites', 'various sites',
  'remote', 'canada', 'province wide', 'provincewide', 'all locations',
]);

const MAX_CITY_LENGTH = 40;
const MAX_CITY_WORDS = 5;

/** True when the value reads like a single place name. */
export function isPlausibleCity(city: string): boolean {
  const value = city.trim().replace(/\s+/g, ' ');
  const lower = value.toLowerCase();
  if (!value || PLACEHOLDER_CITIES.has(lower)) return false;
  if (value.length > MAX_CITY_LENGTH) return false;
  if (value.split(' ').length > MAX_CITY_WORDS) return false;
  // A real place name has letters; "123" or "-" is a feed artefact.
  if (!/[a-z]/i.test(value)) return false;
  return true;
}

/**
 * The leading place name of a longer value, when there is an obvious one:
 * the part before the first comma, bracket, slash, semicolon or spaced dash,
 * and then its leading run of capitalised words ("Killarney service will be
 * provided to …" → "Killarney"). Null when nothing plausible is left.
 */
export function salvageCity(city: string): string | null {
  const head = city.split(/,|\(|\/|;| - | – /)[0]?.trim() ?? '';
  if (isPlausibleCity(head) && head.split(/\s+/).length <= 3) return head;

  const words = head.split(/\s+/);
  const lead: string[] = [];
  for (const word of words) {
    if (!/^[A-ZÀ-Ý]/.test(word)) break;
    lead.push(word);
    if (lead.length === 3) break;
  }
  const candidate = lead.join(' ');
  return candidate && isPlausibleCity(candidate) ? candidate : null;
}

/**
 * The value to store as a job's city: the feed's own value when it is a place,
 * else a place salvaged from it, else the employer's registered default city,
 * else the original (landing pages still refuse to index it — lib/seo.ts).
 */
export function cleanCity(city: string, fallback?: string | null): string {
  const trimmed = city.trim().replace(/\s+/g, ' ');
  if (isPlausibleCity(trimmed)) return trimmed;
  const salvaged = salvageCity(trimmed);
  if (salvaged) return salvaged;
  if (fallback && isPlausibleCity(fallback)) return fallback.trim();
  return trimmed;
}
