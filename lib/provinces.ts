import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';
import type { ProvinceCode } from '@/lib/types';

export const PROVINCE_NAMES: Record<ProvinceCode, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

/** "British Columbia" → "BC". Also accepts a code. Null when it is neither. */
export function provinceCodeFromName(value: string): ProvinceCode | null {
  const wanted = value.trim().toLowerCase();
  const asCode = wanted.toUpperCase() as ProvinceCode;
  if (PROVINCE_NAMES[asCode]) return asCode;
  const found = (Object.keys(PROVINCE_NAMES) as ProvinceCode[])
    .find((code) => PROVINCE_NAMES[code].toLowerCase() === wanted);
  return found ?? null;
}

/** "AB" → "Alberta". Unknown codes pass through rather than rendering blank. */
export function provinceName(code: string): string {
  return PROVINCE_NAMES[code as ProvinceCode] ?? code;
}

/**
 * The place the site can truthfully claim to cover: the province's name while every active
 * job is in one province, "Canada" once there is more than one (or none at all).
 */
export function regionName(provinces: Iterable<string>): string {
  const distinct = new Set(provinces);
  return distinct.size === 1 ? provinceName([...distinct][0]) : 'Canada';
}

/** `regionName` for pages that don't already hold every active row: two one-row reads. */
export async function loadRegion(db: SupabaseClient<Database>): Promise<string> {
  const { data: first, error } = await db
    .from('jobs').select('province').eq('is_active', true).limit(1).maybeSingle();
  if (error) throw error;
  if (!first) return 'Canada';

  const { data: other, error: otherError } = await db
    .from('jobs').select('province').eq('is_active', true).neq('province', first.province).limit(1);
  if (otherError) throw otherError;
  return other.length > 0 ? 'Canada' : provinceName(first.province);
}

/** A city's province: the most common one among its rows. */
export function provinceOfCity(rows: ReadonlyArray<{ city: string; province: string }>, city: string): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.city === city) counts.set(r.province, (counts.get(r.province) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Every active city, grouped by province, for the two-step province-then-city
 *  picker (components/ProvinceCitySelect.tsx). Only provinces with at least
 *  one active job appear as keys, and each city list is deduplicated and
 *  sorted — the same shape a flat `[...new Set(rows.map(r => r.city))].sort()`
 *  already produced, just partitioned first. */
export function groupCitiesByProvince(
  rows: ReadonlyArray<{ city: string; province: string }>,
): Partial<Record<ProvinceCode, string[]>> {
  const out: Partial<Record<ProvinceCode, string[]>> = {};
  for (const r of rows) {
    const code = r.province as ProvinceCode;
    (out[code] ??= []).push(r.city);
  }
  for (const code of Object.keys(out) as ProvinceCode[]) {
    out[code] = [...new Set(out[code])].sort();
  }
  return out;
}
