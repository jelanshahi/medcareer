import { describe, it, expect } from 'vitest';
import { provinceName, provinceOfCity, regionName } from '@/lib/provinces';
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

describe('categoryBlurb', () => {
  it('names Ontario regulators only for Ontario', () => {
    expect(categoryBlurb('nursing', 'ON')).toMatch(/College of Nurses of Ontario/);
    expect(categoryBlurb('nursing', 'AB')).not.toMatch(/Ontario/);
    expect(categoryBlurb('pharmacy', null)).not.toMatch(/Ontario/);
  });
});
