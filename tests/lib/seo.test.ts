import { describe, it, expect } from 'vitest';
import { isIndexableCity, isIndexableLanding, pageMeta, INDEX_THRESHOLD } from '@/lib/seo';

describe('isIndexableCity', () => {
  it('accepts ordinary city names', () => {
    expect(isIndexableCity('Toronto')).toBe(true);
    expect(isIndexableCity('100 Mile House')).toBe(true);
    expect(isIndexableCity('Notre-Dame-de-Lourdes')).toBe(true);
  });

  it('rejects placeholder values from employer feeds', () => {
    expect(isIndexableCity('TBD')).toBe(false);
    expect(isIndexableCity(' Various Locations ')).toBe(false);
    expect(isIndexableCity('')).toBe(false);
  });

  it('rejects sentences masquerading as cities', () => {
    expect(
      isIndexableCity('Killarney service will be provided to Boissevain, Cartwright, Deloraine and Glenboro'),
    ).toBe(false);
  });
});

describe('isIndexableLanding', () => {
  it('needs both a real city and enough listings', () => {
    expect(isIndexableLanding('Toronto', INDEX_THRESHOLD)).toBe(true);
    expect(isIndexableLanding('Toronto', INDEX_THRESHOLD - 1)).toBe(false);
    expect(isIndexableLanding('TBD', 500)).toBe(false);
  });
});

describe('pageMeta', () => {
  it('sets canonical and matching Open Graph tags', () => {
    const meta = pageMeta({ title: 'T', description: 'D', path: '/browse/toronto' });
    expect(meta.alternates?.canonical).toBe('/browse/toronto');
    expect(meta.openGraph).toMatchObject({ title: 'T', description: 'D', url: '/browse/toronto' });
    expect(meta.robots).toBeUndefined();
  });

  it('noindexes but still follows when asked', () => {
    const meta = pageMeta({ title: 'T', description: 'D', path: '/x', noindex: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });
});
