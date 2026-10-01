import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse } from 'node-html-parser';
import {
  extractJsonLd,
  fieldByLabel,
  parseLabelLocation,
  parseSilkRoadLabelDate,
  parseSilkRoadListing,
  provinceFromIsoRegion,
} from '@/workers/connectors/silkroad';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'fixtures/silkroad', name), 'utf8');

describe('parseSilkRoadListing', () => {
  it('extracts every unique job id from a full listing page', () => {
    const stubs = parseSilkRoadListing(fixture('mahc-listing-page1.html'), 'MAHC', 'MAHCCareers');
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.sourceJobId).toMatch(/^\d+$/);
      expect(stub.externalPath).toBe(`/MAHC/MAHCCareers/jobs/${stub.sourceJobId}`);
    }
    // No duplicates: each job's link and id-attribute both contain the href, but each job id
    // must appear exactly once in the result.
    expect(new Set(stubs.map((s) => s.sourceJobId)).size).toBe(stubs.length);
  });

  it('returns fewer ids for the short/last page than the full first page', () => {
    const page1 = parseSilkRoadListing(fixture('mahc-listing-page1.html'), 'MAHC', 'MAHCCareers');
    const lastPage = parseSilkRoadListing(fixture('mahc-listing-page3.html'), 'MAHC', 'MAHCCareers');
    expect(lastPage.length).toBeLessThan(page1.length);
  });

  it('ignores links for a different tenant or board code', () => {
    const stubs = parseSilkRoadListing(fixture('mahc-listing-page1.html'), 'SomeOtherTenant', 'SomeOtherBoard');
    expect(stubs).toHaveLength(0);
  });
});

describe('extractJsonLd', () => {
  it('parses the JSON-LD block from the Baycrest fixture', () => {
    const json = extractJsonLd(fixture('baycrest-job-detail.html')) as { '@type'?: string } | undefined;
    expect(json).toBeDefined();
    expect(json?.['@type']).toBe('JobPosting');
  });

  it('returns undefined when there is no JSON-LD block', () => {
    expect(extractJsonLd(fixture('mahc-job-detail.html'))).toBeUndefined();
  });

  it('returns undefined for malformed JSON rather than throwing', () => {
    const html = '<script type="application/ld+json">{not valid json</script>';
    expect(extractJsonLd(html)).toBeUndefined();
  });
});

describe('provinceFromIsoRegion', () => {
  it('strips the "CA-" prefix', () => {
    expect(provinceFromIsoRegion('CA-ON')).toBe('ON');
  });

  it('accepts a bare province code too', () => {
    expect(provinceFromIsoRegion('ON')).toBe('ON');
  });

  it('returns null for an unrecognized region', () => {
    expect(provinceFromIsoRegion('CA-ZZ')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(provinceFromIsoRegion(undefined)).toBeNull();
  });
});

describe('fieldByLabel', () => {
  it('finds "Job Location" on the MAHC fixture', () => {
    const root = parse(fixture('mahc-job-detail.html'));
    const value = fieldByLabel(root, 'Job Location');
    expect(value).toContain('Huntsville');
  });

  it('finds "Posted Date" on the MAHC fixture', () => {
    const root = parse(fixture('mahc-job-detail.html'));
    expect(fieldByLabel(root, 'Posted Date')).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });

  it('does not find a label that is not present', () => {
    const root = parse(fixture('mahc-job-detail.html'));
    expect(fieldByLabel(root, 'Not A Real Label')).toBeUndefined();
  });

  it('returns undefined on a page with none of these containers at all', () => {
    const root = parse(fixture('baycrest-job-detail.html'));
    expect(fieldByLabel(root, 'Job Location')).toBeUndefined();
  });
});

describe('parseLabelLocation', () => {
  it('reads city and province from the end of a variable-length address', () => {
    const result = parseLabelLocation('100 Frank Miller Dr, Huntsville, Ontario, Canada');
    expect(result.city).toBe('Huntsville');
    expect(result.province).toBe('ON');
  });

  it('handles an address with no street-address prefix', () => {
    const result = parseLabelLocation('Huntsville, Ontario, Canada');
    expect(result.city).toBe('Huntsville');
    expect(result.province).toBe('ON');
  });

  it('returns an undefined city and null province for an unparseable string', () => {
    const result = parseLabelLocation('');
    expect(result.city).toBeUndefined();
    expect(result.province).toBeNull();
  });
});

describe('parseSilkRoadLabelDate', () => {
  it('parses M/D/YYYY', () => {
    expect(parseSilkRoadLabelDate('9/3/2026')).toEqual(new Date('2026-09-03T00:00:00Z'));
  });

  it('parses single-digit month and day with no leading zero required', () => {
    expect(parseSilkRoadLabelDate('1/5/2026')).toEqual(new Date('2026-01-05T00:00:00Z'));
  });

  it('throws on an unparseable value', () => {
    expect(() => parseSilkRoadLabelDate('not a date')).toThrow();
  });

  it('throws on an ISO-format value (this parser is for the label format only)', () => {
    expect(() => parseSilkRoadLabelDate('2026-09-03')).toThrow();
  });
});
