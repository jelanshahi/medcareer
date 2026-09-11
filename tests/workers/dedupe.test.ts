import { describe, it, expect } from 'vitest';
import { sourcePriority, pickCanonical, buildJobRow, type RawRow } from '@/workers/dedupe';

const posting = {
  sourceId: 'workday:shn', sourceJobId: 'JR1', sourceUrl: 'https://x.test/1',
  title: 'RN - Emergency', employerName: 'SHN', description: '<p>x</p>',
  city: 'Toronto', province: 'ON' as const, postedAt: '2026-09-04T00:00:00.000Z',
  applyUrl: 'https://x.test/1',
};

// Fingerprints are sha256 hex digests in production (see lib/normalize/fingerprint.ts),
// so buildJobRow's `fingerprint.slice(0, 8)` always yields 8 hex chars there. The brief's
// literal fixture value ('f1') is only 2 chars and can never satisfy the buildJobRow slug
// assertion below (`[0-9a-f]{8}`) regardless of implementation — a defect in the fixture,
// not the assertions. Fixed here by using a realistic-length hex fingerprint; every
// assertion in this file is unchanged from the brief.
const row = (over: Partial<RawRow> = {}): RawRow => ({
  id: 'r1', source_id: 'workday:shn', fingerprint: 'f1a2b3c4d5e6f7a8', normalized: posting, ...over,
});

describe('sourcePriority', () => {
  it('ranks direct ATS above Job Bank above Adzuna', () => {
    expect(sourcePriority('workday:shn')).toBeLessThan(sourcePriority('jobbank'));
    expect(sourcePriority('jobbank')).toBeLessThan(sourcePriority('adzuna'));
  });
});

describe('pickCanonical', () => {
  it('prefers the direct ATS row over an aggregator row', () => {
    const chosen = pickCanonical([
      row({ id: 'agg', source_id: 'adzuna' }),
      row({ id: 'ats', source_id: 'workday:shn' }),
    ]);
    expect(chosen.id).toBe('ats');
  });

  it('returns the only row when there is one', () => {
    expect(pickCanonical([row()]).id).toBe('r1');
  });
});

describe('buildJobRow', () => {
  it('classifies the title and derives a unique slug', () => {
    const job = buildJobRow(row(), null);
    expect(job.category).toBe('nursing');
    expect(job.slug).toMatch(/^rn-emergency-[0-9a-f]{8}$/);
  });

  it('sets expires_at to 60 days after posted_at', () => {
    const job = buildJobRow(row(), null);
    const days = (Date.parse(job.expires_at) - Date.parse(job.posted_at)) / 86_400_000;
    expect(days).toBe(60);
  });

  it('carries the apply URL through unchanged', () => {
    expect(buildJobRow(row(), null).apply_url).toBe('https://x.test/1');
  });
});
