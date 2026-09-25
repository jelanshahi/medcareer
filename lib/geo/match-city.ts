import type { ProvinceCode } from '@/lib/types';

export type GeocodedLocation = { city: string; provinceCode: ProvinceCode };
export type CityLookup = (provinceCode: ProvinceCode) => Promise<string[]>;

/**
 * Matches a reverse-geocoded city against the distinct active job cities in
 * its province, case-insensitively. Returns the matching city exactly as
 * `lookupCitiesForProvince` returned it (the database's own casing), never
 * the geocoded input's — `/jobs?city=` matches case-sensitively against
 * stored values, so the redirect must carry the stored string.
 */
export async function matchCity(
  geocoded: GeocodedLocation | null,
  lookupCitiesForProvince: CityLookup,
): Promise<string | null> {
  if (!geocoded) return null;

  const target = geocoded.city.trim().toLowerCase();
  const cities = await lookupCitiesForProvince(geocoded.provinceCode);
  return cities.find((c) => c.trim().toLowerCase() === target) ?? null;
}
