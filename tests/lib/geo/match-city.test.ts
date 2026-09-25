import { describe, it, expect, vi } from 'vitest';
import { matchCity } from '@/lib/geo/match-city';

describe('matchCity', () => {
  it('returns null without calling the lookup when geocoding produced nothing', async () => {
    const lookup = vi.fn();
    const result = await matchCity(null, lookup);
    expect(result).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('matches a city case-insensitively and returns the lookup\'s own casing', async () => {
    const lookup = vi.fn(async () => ['Kitchener', 'Markham']);
    const result = await matchCity({ city: 'kitchener', provinceCode: 'ON' }, lookup);
    expect(result).toBe('Kitchener');
    expect(lookup).toHaveBeenCalledWith('ON');
  });

  it('trims surrounding whitespace before comparing', async () => {
    const lookup = vi.fn(async () => ['Markham']);
    const result = await matchCity({ city: '  Markham  ', provinceCode: 'ON' }, lookup);
    expect(result).toBe('Markham');
  });

  it('returns null when no city in the province matches', async () => {
    const lookup = vi.fn(async () => ['Kitchener', 'Markham']);
    const result = await matchCity({ city: 'Ottawa', provinceCode: 'ON' }, lookup);
    expect(result).toBeNull();
  });

  it('returns null when the province has no active cities at all', async () => {
    const lookup = vi.fn(async () => []);
    const result = await matchCity({ city: 'Kitchener', provinceCode: 'ON' }, lookup);
    expect(result).toBeNull();
  });
});
