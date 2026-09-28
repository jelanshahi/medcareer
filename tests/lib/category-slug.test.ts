import { describe, it, expect } from 'vitest';
import { CATEGORIES, categoryFromSlug, categorySlug } from '@/lib/taxonomy/categories';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { parseSearchParams } from '@/lib/schemas/search-params';
import { provinceFromSlug, provinceSlug } from '@/lib/provinces';
import { sourceJobIdFromDedupeKey } from '@/lib/jobs/identifier';

describe('category slugs', () => {
  it('hyphenates in URLs and round-trips every category', () => {
    expect(categorySlug('allied_health')).toBe('allied-health');
    for (const c of CATEGORIES) expect(categoryFromSlug(categorySlug(c))).toBe(c);
  });

  it('still accepts the legacy underscore form', () => {
    expect(categoryFromSlug('allied_health')).toBe('allied_health');
    expect(categoryFromSlug('wizardry')).toBeNull();
  });

  it('builds /jobs links with hyphens and parses both forms back', () => {
    expect(buildJobsQuery({ category: ['support_care'] })).toBe('/jobs?category=support-care');
    expect(parseSearchParams({ category: 'support-care' }).category).toEqual(['support_care']);
    expect(parseSearchParams({ category: 'support_care' }).category).toEqual(['support_care']);
  });
});

describe('province slugs', () => {
  it('round-trips every province', () => {
    expect(provinceSlug('BC')).toBe('british-columbia');
    expect(provinceSlug('QC')).toBe('quebec');
    for (const code of ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']) {
      expect(provinceFromSlug(provinceSlug(code))).toBe(code);
    }
    expect(provinceFromSlug('atlantis')).toBeNull();
  });
});

describe('sourceJobIdFromDedupeKey', () => {
  it('returns the part after the fingerprint', () => {
    expect(sourceJobIdFromDedupeKey('ab12cd:163570')).toBe('163570');
    expect(sourceJobIdFromDedupeKey('ab12cd:JR:106052')).toBe('JR:106052');
  });

  it('is null for keys without an id', () => {
    expect(sourceJobIdFromDedupeKey('ab12cd')).toBeNull();
    expect(sourceJobIdFromDedupeKey('ab12cd:')).toBeNull();
    expect(sourceJobIdFromDedupeKey(':123')).toBeNull();
  });
});
