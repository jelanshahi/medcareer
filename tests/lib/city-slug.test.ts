import { describe, it, expect } from 'vitest';
import { slugifyCity, resolveCity, isCategorySlug } from '@/lib/jobs/city-slug';

const CITIES = ['Toronto', 'Markham', 'Ottawa'];

describe('slugifyCity', () => {
  it('lowercases a single-word city', () => {
    expect(slugifyCity('Toronto')).toBe('toronto');
  });

  it('hyphenates whitespace', () => {
    expect(slugifyCity('Richmond Hill')).toBe('richmond-hill');
  });

  it('strips punctuation rather than encoding it', () => {
    expect(slugifyCity("St. Catharines")).toBe('st-catharines');
  });

  it('collapses repeated separators and trims the edges', () => {
    expect(slugifyCity('  New   Tecumseth  ')).toBe('new-tecumseth');
  });
});

describe('resolveCity', () => {
  it('resolves a slug back to the stored city name', () => {
    expect(resolveCity('toronto', CITIES)).toBe('Toronto');
  });

  it('is case-insensitive about the incoming slug', () => {
    expect(resolveCity('TORONTO', CITIES)).toBe('Toronto');
  });

  it('returns null for a city we do not carry', () => {
    expect(resolveCity('hamilton', CITIES)).toBeNull();
  });

  it('returns null for an empty slug', () => {
    expect(resolveCity('', CITIES)).toBeNull();
  });

  it('round-trips every stored city', () => {
    for (const city of CITIES) {
      expect(resolveCity(slugifyCity(city), CITIES)).toBe(city);
    }
  });
});

describe('isCategorySlug', () => {
  it('accepts a real category key', () => {
    expect(isCategorySlug('nursing')).toBe(true);
  });

  it('rejects an unknown discipline', () => {
    expect(isCategorySlug('wizardry')).toBe(false);
  });

  it('rejects a label rather than a key', () => {
    expect(isCategorySlug('Nursing')).toBe(false);
  });
});
