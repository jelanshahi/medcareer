import { describe, it, expect } from 'vitest';
import { groupCitiesByProvince, provinceName, provinceOfCity, regionName } from '@/lib/provinces';
import { categoryBlurb } from '@/lib/taxonomy/blurbs';

describe('regionName', () => {
  it('names the province while every job is in one', () => {
    expect(regionName(['ON', 'ON'])).toBe('Ontario');
  });

  it('says Canada once jobs span provinces, or when there are none', () => {
    expect(regionName(['ON', 'AB'])).toBe('Canada');
    expect(regionName([])).toBe('Canada');
  });
});

describe('provinceName', () => {
  it('maps codes and passes unknown values through', () => {
    expect(provinceName('AB')).toBe('Alberta');
    expect(provinceName('XX')).toBe('XX');
  });
});

describe('provinceOfCity', () => {
  it('returns the most common province for the city', () => {
    const rows = [
      { city: 'Edmonton', province: 'AB' },
      { city: 'Edmonton', province: 'AB' },
      { city: 'Toronto', province: 'ON' },
    ];
    expect(provinceOfCity(rows, 'Edmonton')).toBe('AB');
    expect(provinceOfCity(rows, 'Calgary')).toBeNull();
  });
});

describe('groupCitiesByProvince', () => {
  // ProvinceCitySelect (components/ProvinceCitySelect.tsx) narrows its city
  // list to whichever province key is present here, so the grouping is the
  // entire correctness of the province step.
  const rows = [
    { city: 'Toronto', province: 'ON' },
    { city: 'Hamilton', province: 'ON' },
    { city: 'Toronto', province: 'ON' }, // a repeat, from a second job posting
    { city: 'Calgary', province: 'AB' },
  ];

  it('partitions cities under their own province', () => {
    expect(groupCitiesByProvince(rows)).toEqual({
      ON: ['Hamilton', 'Toronto'],
      AB: ['Calgary'],
    });
  });

  it('deduplicates a city that appears on more than one row', () => {
    const grouped = groupCitiesByProvince(rows);
    expect(grouped.ON).toEqual(['Hamilton', 'Toronto']);
  });

  it('never produces a key for a province with no rows', () => {
    // ProvinceCitySelect lists every key as a province option — a stray
    // empty-array entry would render a province with nothing under it.
    expect(groupCitiesByProvince(rows)).not.toHaveProperty('BC');
  });

  it('returns an empty object for no rows, not a thrown error', () => {
    expect(groupCitiesByProvince([])).toEqual({});
  });
});

describe('categoryBlurb', () => {
  it('names Ontario regulators only for Ontario', () => {
    expect(categoryBlurb('nursing', 'ON')).toMatch(/College of Nurses of Ontario/);
    expect(categoryBlurb('nursing', 'AB')).not.toMatch(/Ontario/);
    expect(categoryBlurb('pharmacy', null)).not.toMatch(/Ontario/);
  });
});
