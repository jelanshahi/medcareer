import { z } from 'zod';
import { SITE } from '@/lib/site';
import { provinceCodeFromName } from '@/lib/provinces';
import type { GeocodedLocation } from '@/lib/geo/match-city';

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 5000;

const NominatimResponseSchema = z.object({
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      municipality: z.string().optional(),
      state: z.string().optional(),
    })
    .optional(),
});

/**
 * Reverse-geocodes a coordinate pair to a city + province via OpenStreetMap
 * Nominatim. Called server-side only (never from the browser) — Nominatim's
 * usage policy asks for a descriptive User-Agent identifying the caller,
 * which a browser fetch cannot set.
 *
 * zoom=10 asks Nominatim for city-level granularity rather than its default
 * street-address level, where the response frequently has no city/town
 * field to read at all.
 *
 * Every failure (network, timeout, bad status, unparseable body, missing
 * locality or unrecognized province) returns null rather than throwing —
 * this is a best-effort lookup for a "near me" convenience feature, not a
 * critical path, and the caller only needs "resolved" vs. "didn't."
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation | null> {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SITE.userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const parsed = NominatimResponseSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.address) return null;

    const { city, town, village, municipality, state } = parsed.data.address;
    const locality = city ?? town ?? village ?? municipality;
    const provinceCode = state ? provinceCodeFromName(state) : null;
    if (!locality || !provinceCode) return null;

    return { city: locality, provinceCode };
  } catch {
    return null;
  }
}
