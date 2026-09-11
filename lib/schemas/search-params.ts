import { z } from 'zod';
import { CATEGORIES, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_TYPES, type EmploymentType } from '@/lib/taxonomy/employment';

export const PAGE_SIZE = 25;
export const MAX_LIMIT = 50;

/** Omits the design's "closing" option: closes_at is null for every job (see brief). */
export const SORTS = ['newest', 'salary'] as const;
export type Sort = (typeof SORTS)[number];

// A hostile client could repeat a facet key hundreds of times; bound the
// array itself as well as each entry so parsing stays cheap either way.
const MAX_FACET_VALUES = 20;
const MAX_CITY_LENGTH = 80;

const QSchema = z.string().trim().min(1).max(120);
const SortSchema = z.enum(SORTS).catch('newest');
const PageSchema = z.coerce.number().int().min(1).max(400).catch(1);
const CitySchema = z.string().trim().min(1).max(MAX_CITY_LENGTH);

export type SearchParams = {
  q?: string;
  city?: string[];
  category?: Category[];
  employment_type?: EmploymentType[];
  sort: Sort;
  page: number;
};

/** searchParams values arrive as a single string or (for repeated keys, as
 * checkboxes of the same name produce) a string array. Always flatten to an
 * array for facet fields, and to a single value for scalar fields. */
function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.length ? arr.slice(0, MAX_FACET_VALUES) : undefined;
}

function toScalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Validates each array entry against an enum, drops invalid entries and
 * duplicates individually rather than discarding the whole facet — one bad
 * value in a hostile query string should not silently clear a good one. */
function parseEnumArray<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] | undefined {
  const arr = toArray(value);
  if (!arr) return undefined;
  const allowedSet = new Set<string>(allowed);
  const kept = [...new Set(arr.filter((v): v is T => allowedSet.has(v)))];
  return kept.length ? kept : undefined;
}

function parseCityArray(value: string | string[] | undefined): string[] | undefined {
  const arr = toArray(value);
  if (!arr) return undefined;
  const kept = [
    ...new Set(
      arr
        .map((v) => CitySchema.safeParse(v))
        .filter((r) => r.success)
        .map((r) => r.data),
    ),
  ];
  return kept.length ? kept : undefined;
}

/** Never trust the query string. Unparseable input degrades to defaults. */
export function parseSearchParams(
  input: Record<string, string | string[] | undefined>,
): SearchParams {
  return {
    q: QSchema.safeParse(toScalar(input.q)).data,
    city: parseCityArray(input.city),
    category: parseEnumArray(input.category, CATEGORIES),
    employment_type: parseEnumArray(input.employment_type, EMPLOYMENT_TYPES),
    sort: SortSchema.parse(toScalar(input.sort)),
    page: PageSchema.parse(toScalar(input.page)),
  };
}
