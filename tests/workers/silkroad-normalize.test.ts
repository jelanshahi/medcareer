import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseSilkRoadListing } from '@/workers/connectors/silkroad';

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
