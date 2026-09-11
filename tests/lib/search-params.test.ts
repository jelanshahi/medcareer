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

  // Task 15: `category` became a multi-select facet (real <input type="checkbox">
  // controls of the same name in a GET form submit repeated keys), so a single
  // value now parses to a one-element array rather than a bare string. Updated
  // deliberately alongside the search-page redesign; see task-15-report.md.
  it('accepts a known category', () => {
    expect(parseSearchParams({ category: 'nursing' }).category).toEqual(['nursing']);
  });

  it('accepts multiple categories from repeated checkbox values', () => {
    expect(parseSearchParams({ category: ['nursing', 'pharmacy'] }).category).toEqual([
      'nursing',
      'pharmacy',
    ]);
  });

  it('drops only the invalid category, keeping the valid ones', () => {
    expect(parseSearchParams({ category: ['nursing', 'wizardry'] }).category).toEqual([
      'nursing',
    ]);
  });

  it('accepts multiple cities and de-duplicates them', () => {
    expect(parseSearchParams({ city: ['Ottawa', 'Toronto', 'Ottawa'] }).city).toEqual([
      'Ottawa',
      'Toronto',
    ]);
  });

  it('accepts a known employment type', () => {
    expect(parseSearchParams({ employment_type: 'full_time' }).employment_type).toEqual([
      'full_time',
    ]);
  });

  it('rejects an unknown employment type', () => {
    expect(parseSearchParams({ employment_type: 'volunteer' }).employment_type).toBeUndefined();
  });

  it('defaults sort to newest', () => {
    expect(parseSearchParams({}).sort).toBe('newest');
  });

  it('accepts the salary sort', () => {
    expect(parseSearchParams({ sort: 'salary' }).sort).toBe('salary');
  });

  it('falls back to newest for an unknown sort (omits the design\'s "closing" option: no job has a closing date)', () => {
    expect(parseSearchParams({ sort: 'closing' }).sort).toBe('newest');
  });

  it('clamps a hostile page number', () => {
    expect(parseSearchParams({ page: '-5' }).page).toBe(1);
    expect(parseSearchParams({ page: '999999' }).page).toBe(1);
  });

  it('truncates an overlong keyword', () => {
    expect(parseSearchParams({ q: 'x'.repeat(500) }).q).toBeUndefined();
  });
});
