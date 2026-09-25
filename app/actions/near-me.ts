'use server';

import { createServerClient } from '@/lib/db/server';
import { reverseGeocode } from '@/lib/geo/nominatim';
import { matchCity } from '@/lib/geo/match-city';
import type { ProvinceCode } from '@/lib/types';

/**
 * Resolves a visitor's coordinates to the nearest active job city, or null
 * if nothing could be matched (bad input, geocoding failure, or no active
 * postings in the resolved province/city). Coordinates are never stored —
 * they're passed through to Nominatim and discarded once resolved.
 */
export async function resolveNearestCity(lat: number, lng: number): Promise<string | null> {
  // Server Actions are reachable by direct POST, not only through
  // NearMeButton, so the input is validated here rather than trusted.
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < -90 || lat > 90 || lng < -180 || lng > 180
  ) {
    return null;
  }

  const geocoded = await reverseGeocode(lat, lng);

  return matchCity(geocoded, async (provinceCode: ProvinceCode) => {
    const db = createServerClient();
    const { data, error } = await db
      .from('jobs')
      .select('city')
      .eq('is_active', true)
      .eq('province', provinceCode);
    if (error) throw error;
    return [...new Set((data ?? []).map((row) => row.city))];
  });
}
