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

import { PROVINCE_CODES } from '@/lib/types';

const PLACEHOLDER_CITIES = new Set([
  'tbd', 'tba', 'n/a', 'na', 'none', 'unknown', 'various', 'multiple', 'other',
  'various locations', 'multiple locations', 'multiple sites', 'various sites',
  'remote', 'canada', 'province wide', 'provincewide', 'all locations',
  'unavailable', 'travel', 'within the region', 'west zone',
]);

/** Placeholders that run on into a sentence ("To be determined based on …"). */
const PLACEHOLDER_OPENINGS = /^(to be (determined|announced|confirmed)\b|reside within\b)/i;

/**
 * Values confirmed against live postings to be one listing, keyed lower-case.
 * Added by hand: title-casing or fuzzy matching by rule would break "Portage la
 * Prairie" or merge places that only look alike. A region an employer posts
 * under ("Niagara Region", "Timiskaming") keeps its own entry; only the
 * spellings of one region are merged.
 */
const CITY_ALIASES = new Map<string, string>([
  ['moose jaw', 'Moose Jaw'],
  ['meadow lake', 'Meadow Lake'],
  ['st catharines', 'St. Catharines'],
  ['st catherines', 'St. Catharines'],
  ['st. catherines', 'St. Catharines'],
  ['elliott lake', 'Elliot Lake'],
  // A facility entered as the city.
  ['selkirk regional health centre', 'Selkirk'],
  // Two towns with nothing between them.
  ['geraldton longlac', 'Geraldton'],
  ['gta', 'Greater Toronto Area'],
  ['greater toronto', 'Greater Toronto Area'],
]);

/** "Prince Albert, SK": the province has its own column. */
const PROVINCE_SUFFIX = new RegExp(`,\\s*(${PROVINCE_CODES.join('|')})$`, 'i');

/** Between the towns of "Regina or Saskatoon", "Winkler / Morden", "Winkler or area". */
const TOWN_SEPARATORS = /\/|\s(?:or|and|&)\s/i;

const MAX_CITY_LENGTH = 40;
const MAX_CITY_WORDS = 5;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_CITIES.has(value.toLowerCase()) || PLACEHOLDER_OPENINGS.test(value);
}

/** The part before the first comma, bracket, slash, semicolon or spaced dash. */
function headOf(city: string): string {
  return city.split(/,|\(|\/|;| - | – /)[0]?.trim().replace(/\s+/g, ' ') ?? '';
}

/** True when the value reads like a single place name. */
export function isPlausibleCity(city: string): boolean {
  const value = city.trim().replace(/\s+/g, ' ');
  if (!value || isPlaceholder(value)) return false;
  if (value.length > MAX_CITY_LENGTH) return false;
  if (value.split(' ').length > MAX_CITY_WORDS) return false;
  // A real place name has letters; "123" or "-" is a feed artefact.
  if (!/[a-z]/i.test(value)) return false;
  return true;
}

/**
 * The leading place name of a longer value, when there is an obvious one:
 * its head (see headOf), and then that head's leading run of capitalised
 * words ("Killarney service will be provided to …" → "Killarney"). Null when
 * nothing plausible is left.
 */
export function salvageCity(city: string): string | null {
  const head = headOf(city);
  // Without this, "Within the region" would yield the city "Within".
  if (isPlaceholder(head)) return null;
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
 * The one entry a place is listed under, so spellings of it do not each get a
 * filter option and a landing page. A posting naming several towns is listed
 * under the first.
 */
function canonicalCity(value: string): string {
  if (isPlaceholder(headOf(value))) return value;
  const tidied = value.replace(/[‘’]/g, "'").replace(PROVINCE_SUFFIX, '');
  const first = tidied.split(TOWN_SEPARATORS)[0].trim();
  const town = isPlausibleCity(first) ? first : tidied;
  return CITY_ALIASES.get(town.toLowerCase()) ?? town;
}

/**
 * The value to store as a job's city: the feed's own value when it is a place,
 * else a place salvaged from it, either one under its listed spelling (see
 * canonicalCity). A placeholder ("TBD", "Travel") is stored as
 * written: the posting names no city, so none is guessed for it. Any other
 * artefact takes the employer's registered default city, else stays as it is.
 * What is not a place is left out of city lists and landing pages
 * (lib/provinces.ts, lib/seo.ts).
 */
export function cleanCity(city: string, fallback?: string | null): string {
  const trimmed = city.trim().replace(/\s+/g, ' ');
  if (isPlausibleCity(trimmed)) return canonicalCity(trimmed);
  const salvaged = salvageCity(trimmed);
  if (salvaged) return canonicalCity(salvaged);
  if (isPlaceholder(headOf(trimmed))) return trimmed;
  if (fallback && isPlausibleCity(fallback)) return fallback.trim();
  return trimmed;
}
