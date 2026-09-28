import { describe, it, expect } from 'vitest';
import { cleanCity, isPlausibleCity, salvageCity } from '@/lib/normalize/city';

describe('isPlausibleCity', () => {
  it('accepts real place names', () => {
    for (const c of ['Toronto', '100 Mile House', 'Notre-Dame-de-Lourdes', 'Fort St. John', 'Québec']) {
      expect(isPlausibleCity(c)).toBe(true);
    }
  });

  it('rejects placeholders, sentences and artefacts', () => {
    for (const c of ['TBD', 'Various Locations', '', '  ', '123', 'Killarney service will be provided to Boissevain, Cartwright']) {
      expect(isPlausibleCity(c)).toBe(false);
    }
  });
});

describe('salvageCity', () => {
  it('takes the leading place name from a sentence', () => {
    expect(salvageCity('Killarney service will be provided to Boissevain, Cartwright, Deloraine and Glenboro')).toBe('Killarney');
  });

  it('takes the part before a comma or bracket', () => {
    expect(salvageCity('Regina (multiple sites across the south east region)')).toBe('Regina');
  });

  it('gives up on placeholders', () => {
    expect(salvageCity('TBD')).toBeNull();
    expect(salvageCity('Various Locations')).toBeNull();
  });
});

describe('cleanCity', () => {
  it('keeps a good value, only tidying whitespace', () => {
    expect(cleanCity('  Saskatoon ')).toBe('Saskatoon');
    expect(cleanCity('Prince   Albert')).toBe('Prince Albert');
  });

  it('falls back to the employer default city for a placeholder', () => {
    expect(cleanCity('TBD', 'Regina')).toBe('Regina');
  });

  it('keeps the original when nothing better exists', () => {
    expect(cleanCity('TBD')).toBe('TBD');
    expect(cleanCity('TBD', 'TBA')).toBe('TBD');
  });
});
