import { describe, it, expect } from 'vitest';
import { breadcrumbLd, faqLd, isIndexableCity, isIndexableLanding, jobListLd, jsonLdString, pageMeta, INDEX_THRESHOLD } from '@/lib/seo';

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

describe('JSON-LD helpers', () => {
  it('escapes "<" so a value cannot close the script tag', () => {
    const out = jsonLdString({ title: '</script><b>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).title).toBe('</script><b>');
  });

  it('numbers breadcrumbs and leaves the current page without an item', () => {
    const ld = breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'PSW jobs in Canada' }]);
    expect(ld.itemListElement.map((c) => c.position)).toEqual([1, 2]);
    expect(ld.itemListElement[0]).toHaveProperty('item');
    expect(ld.itemListElement[1]).not.toHaveProperty('item');
  });

  it('lists job URLs and FAQ answers', () => {
    expect(jobListLd('x', [{ slug: 'a' }, { slug: 'b' }]).itemListElement[1]).toMatchObject({ position: 2, url: expect.stringMatching(/\/jobs\/b$/) });
    expect(faqLd([{ question: 'Q?', answer: 'A.' }]).mainEntity[0]).toMatchObject({ name: 'Q?', acceptedAnswer: { text: 'A.' } });
  });
});
