import { describe, it, expect } from 'vitest';
import { groupCitiesByProvince, PROVINCE_NAMES, provinceCodeFromName, provinceName, provinceOfCity, regionName } from '@/lib/provinces';
import { PROVINCE_CODES } from '@/lib/types';
import { categoryBlurb } from '@/lib/taxonomy/blurbs';

describe('regionName', () => {
  it('names the province while every job is in one', () => {
    expect(regionName(['ON', 'ON'])).toBe('Ontario');
  });

  it('says Canada once jobs span provinces, or when there are none', () => {
    expect(regionName(['ON', 'AB'])).toBe('Canada');
    expect(regionName([])).toBe('Canada');
  });

  it('keeps saying Canada as a fourth, fifth province joins — not written against a count of two', () => {
    expect(regionName(['ON', 'AB', 'BC', 'MB'])).toBe('Canada');
  });
});

describe('provinceCodeFromName', () => {
  it('matches an unaccented name', () => {
    expect(provinceCodeFromName('Quebec')).toBe('QC');
  });

  it('matches the accented French name', () => {
    expect(provinceCodeFromName('Québec')).toBe('QC');
  });

  it('is case-insensitive', () => {
    expect(provinceCodeFromName('QUÉBEC')).toBe('QC');
    expect(provinceCodeFromName('ontario')).toBe('ON');
  });

  it('accepts a province code directly', () => {
    expect(provinceCodeFromName('ON')).toBe('ON');
    expect(provinceCodeFromName('on')).toBe('ON');
  });

  it('returns null for an unrecognized value', () => {
    expect(provinceCodeFromName('New York')).toBeNull();
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

  // The guarantee behind "add a province and the site just picks it up":
  // ON/AB/BC are the only ones live today, but nothing here is written
  // against that list — grouping, naming and sorting all key off whatever
  // provinces actually show up in the row set. Proven here with one that has
  // never shipped a single job, rather than merely asserted.
  it('handles a province that has never appeared in the data before, with no code change', () => {
    const withNewProvince = [...rows, { city: 'Winnipeg', province: 'MB' }, { city: 'Brandon', province: 'MB' }];
    const grouped = groupCitiesByProvince(withNewProvince);
    expect(grouped.MB).toEqual(['Brandon', 'Winnipeg']);
    // Every existing group is unaffected by the new one appearing.
    expect(grouped.ON).toEqual(['Hamilton', 'Toronto']);
  });

  it('every code PROVINCE_CODES can produce already has a display name', () => {
    // ProvinceCitySelect looks up PROVINCE_NAMES[code] for every key
    // groupCitiesByProvince can hand it — a code missing here would render
    // as literally "undefined" in the province <select> the day a job from
    // that province is first ingested, rather than at the moment it matters.
    for (const code of PROVINCE_CODES) {
      expect(PROVINCE_NAMES[code], `no display name for ${code}`).toBeTruthy();
    }
  });
});

describe('categoryBlurb', () => {
  it('names Ontario regulators only for Ontario', () => {
    expect(categoryBlurb('nursing', 'ON')).toMatch(/College of Nurses of Ontario/);
    expect(categoryBlurb('nursing', 'AB')).not.toMatch(/Ontario/);
    expect(categoryBlurb('pharmacy', null)).not.toMatch(/Ontario/);
  });

  it('falls back to the generic blurb for a province with no dedicated copy yet, rather than throwing', () => {
    // AB and BC already exercise this path for a live province; MB never has
    // ingested a job, and this is what a first one would render before
    // anyone writes it a dedicated blurb.
    expect(categoryBlurb('nursing', 'MB')).not.toMatch(/Ontario/);
    expect(categoryBlurb('nursing', 'MB')).toBeTruthy();
  });
});
