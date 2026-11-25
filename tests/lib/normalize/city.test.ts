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

// Values seen in the live data on 2026-11-25.
const FEED_PLACEHOLDERS = [
  'To Be Determined',
  'To be determined',
  'To be determined based on location of successful applicant',
  'UNAVAILABLE',
  'Travel',
  'Within the region',
  'Reside within Northern Health Region',
  'West Zone',
];

describe('feed placeholders', () => {
  it('are not places', () => {
    for (const c of FEED_PLACEHOLDERS) expect(isPlausibleCity(c), c).toBe(false);
  });

  it('are not mined for a leading word that looks like a place', () => {
    // The sentence form was stored as the city "To".
    for (const c of FEED_PLACEHOLDERS) expect(salvageCity(c), c).toBeNull();
  });

  it('are stored as the feed wrote them, not moved to the employer default city', () => {
    // A travel role or an undecided site is not in the head-office city.
    for (const c of FEED_PLACEHOLDERS) expect(cleanCity(c, 'Regina'), c).toBe(c);
  });

  it('do not catch real places that start the same way', () => {
    for (const c of ['Tofield', 'Tobermory', 'West St. Paul', 'Travers']) {
      expect(isPlausibleCity(c), c).toBe(true);
    }
  });
});

// Also seen in the live data on 2026-11-25: one place listed as two or more entries.
describe('city variants', () => {
  const expectCleaned = (pairs: [string, string][]) => {
    for (const [raw, city] of pairs) expect(cleanCity(raw, 'Markham'), raw).toBe(city);
  };

  it('drops a province code repeated after the city', () => {
    expectCleaned([['Prince Albert, SK', 'Prince Albert']]);
  });

  it('writes apostrophes one way', () => {
    expectCleaned([['Fort Qu’Appelle', "Fort Qu'Appelle"], ["Fort Qu'Appelle", "Fort Qu'Appelle"]]);
  });

  it('merges confirmed capitalisation and spelling variants', () => {
    expectCleaned([
      ['Moose jaw', 'Moose Jaw'],
      ['Meadow lake', 'Meadow Lake'],
      ['St Catherines', 'St. Catharines'],
      ['St. Catherines', 'St. Catharines'],
      ['St Catharines', 'St. Catharines'],
      ['Elliott Lake', 'Elliot Lake'],
    ]);
  });

  it('lists a facility under the town it is in', () => {
    expectCleaned([['Selkirk Regional Health Centre', 'Selkirk']]);
  });

  it('takes the first town when a posting names more than one', () => {
    expectCleaned([
      ['Regina or Saskatoon', 'Regina'],
      ['Saskatoon or Regina', 'Saskatoon'],
      ['Beauval or Buffalo Narrows', 'Beauval'],
      ['Minnedosa and Neepawa', 'Minnedosa'],
      ['Winkler / Morden', 'Winkler'],
      ['Winkler or area', 'Winkler'],
      ['Steinbach/Ste-Anne', 'Steinbach'],
      ['Geraldton Longlac', 'Geraldton'],
    ]);
  });

  it('lists the Toronto region under one name', () => {
    expectCleaned([
      ['GTA', 'Greater Toronto Area'],
      ['Greater Toronto', 'Greater Toronto Area'],
      ['Greater Toronto Area', 'Greater Toronto Area'],
    ]);
  });

  it('keeps a region as its own listable entry', () => {
    for (const c of ['Greater Toronto Area', 'Niagara Region', 'Simcoe County', 'Timiskaming']) {
      expect(cleanCity(c, 'Markham'), c).toBe(c);
      expect(isPlausibleCity(c), c).toBe(true);
    }
  });

  it('also applies to a place salvaged from a longer value', () => {
    expectCleaned([['Moose jaw (various sites across the region)', 'Moose Jaw']]);
  });

  it('leaves a placeholder as written, whatever follows it', () => {
    expectCleaned([['Remote, SK', 'Remote, SK'], ['Remote / Hybrid', 'Remote / Hybrid']]);
  });

  it('leaves real places that look similar alone', () => {
    for (const c of [
      'Grand Forks', 'Portage la Prairie', 'Sault Ste. Marie', "Burk's Falls", 'Orillia',
      'Niagara-on-the-Lake', 'Prince Edward County', 'West Kelowna', 'Anderson', 'Sandy Bay',
    ]) {
      expect(cleanCity(c), c).toBe(c);
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

  it('keeps a placeholder rather than guessing a city', () => {
    for (const c of ['TBD', 'Various Locations', 'Remote', 'Remote, Saskatchewan']) {
      expect(cleanCity(c, 'Regina'), c).toBe(c);
    }
  });

  it('falls back to the employer default city for a feed artefact', () => {
    expect(cleanCity('123', 'Regina')).toBe('Regina');
  });

  it('keeps the original when nothing better exists', () => {
    expect(cleanCity('123')).toBe('123');
    expect(cleanCity('123', 'TBA')).toBe('123');
  });
});
