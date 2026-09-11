import { describe, it, expect } from 'vitest';
import { parseSearchParams, PAGE_SIZE, MAX_LIMIT } from '@/lib/schemas/search-params';

describe('parseSearchParams', () => {
  it('caps the page size below the hard limit', () => {
    expect(PAGE_SIZE).toBeLessThanOrEqual(MAX_LIMIT);
    expect(MAX_LIMIT).toBe(50);
  });

  it('defaults page to 1', () => {
    expect(parseSearchParams({}).page).toBe(1);
  });

  it('rejects an unknown category rather than passing it to the query', () => {
    expect(parseSearchParams({ category: 'wizardry' }).category).toBeUndefined();
  });

  it('accepts a known category', () => {
    expect(parseSearchParams({ category: 'nursing' }).category).toBe('nursing');
  });

  it('clamps a hostile page number', () => {
    expect(parseSearchParams({ page: '-5' }).page).toBe(1);
    expect(parseSearchParams({ page: '999999' }).page).toBe(1);
  });

  it('truncates an overlong keyword', () => {
    expect(parseSearchParams({ q: 'x'.repeat(500) }).q).toBeUndefined();
  });
});
