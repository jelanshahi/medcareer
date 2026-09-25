import { describe, it, expect, vi, afterEach } from 'vitest';
import { reverseGeocode } from '@/lib/geo/nominatim';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('reverseGeocode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves city + province from a full address response', async () => {
    const stub = vi.fn(async () => jsonResponse({
      address: { city: 'Kitchener', state: 'Ontario' },
    }));
    vi.stubGlobal('fetch', stub);

    const result = await reverseGeocode(43.45, -80.49);
    expect(result).toEqual({ city: 'Kitchener', provinceCode: 'ON' });

    const [url, init] = stub.mock.calls[0] as unknown as [string | URL | Request, RequestInit | undefined];
    expect(String(url)).toContain('zoom=10');
    expect(init?.headers).toMatchObject({ 'User-Agent': expect.any(String) });
  });

  it('falls back through town, village, then municipality when city is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      address: { town: 'Markham', state: 'Ontario' },
    })));
    expect(await reverseGeocode(43.86, -79.26)).toEqual({ city: 'Markham', provinceCode: 'ON' });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      address: { village: 'Arnprior', state: 'Ontario' },
    })));
    expect(await reverseGeocode(45.43, -76.35)).toEqual({ city: 'Arnprior', provinceCode: 'ON' });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      address: { municipality: 'Kapuskasing', state: 'Ontario' },
    })));
    expect(await reverseGeocode(49.42, -82.43)).toEqual({ city: 'Kapuskasing', provinceCode: 'ON' });
  });

  it('returns null when the address has no locality field at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ address: { state: 'Ontario' } })));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it('returns null when the province name does not resolve to a known code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      address: { city: 'Buffalo', state: 'New York' },
    })));
    expect(await reverseGeocode(42.88, -78.87)).toBeNull();
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await reverseGeocode(43.45, -80.49)).toBeNull();
  });

  it('returns null when fetch throws (network error or timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect(await reverseGeocode(43.45, -80.49)).toBeNull();
  });

  it('returns null on an unparseable JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect(await reverseGeocode(43.45, -80.49)).toBeNull();
  });
});
