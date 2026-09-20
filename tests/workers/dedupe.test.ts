import { describe, it, expect } from 'vitest';
import { sourcePriority, pickCanonical, buildJobRow, groupIntoJobs, type RawRow } from '@/workers/dedupe';

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

  it('ranks every direct ATS platform above the aggregators, not just the ones once listed', () => {
    // A hand-maintained list of platforms had already missed successfactors_mb, dropping all
    // 853 Manitoba postings below Adzuna. Any platform we have not named as an aggregator is
    // a direct feed.
    for (const sourceId of [
      'workday:shn', 'taleo:ahs', 'icims:vch', 'jibe:fraser',
      'successfactors:nsh', 'successfactors_mb:mb', 'bchealthjobs:interior', 'oraclecloud:sk',
      'somethingwehavenotbuiltyet:x',
    ]) {
      expect(sourcePriority(sourceId)).toBeLessThan(sourcePriority('jobbank'));
    }
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

// dedupe_key is threaded in by the caller (grouping logic), never reconstructed
// from globals inside buildJobRow. `${fingerprint}:${sourceJobId}` mirrors the
// production formula from workers/dedupe.ts.
const dedupeKeyFor = (r: RawRow): string => `${r.fingerprint}:${r.normalized.sourceJobId}`;

describe('buildJobRow', () => {
  it('classifies the title and derives a unique slug', () => {
    const job = buildJobRow(row(), null, dedupeKeyFor(row()));
    expect(job.category).toBe('nursing');
    expect(job.slug).toMatch(/^rn-emergency-[0-9a-f]{8}$/);
  });

  it('sets expires_at to 60 days after posted_at', () => {
    const job = buildJobRow(row(), null, dedupeKeyFor(row()));
    const days = (Date.parse(job.expires_at) - Date.parse(job.posted_at)) / 86_400_000;
    expect(days).toBe(60);
  });

  it('carries the apply URL through unchanged', () => {
    expect(buildJobRow(row(), null, dedupeKeyFor(row())).apply_url).toBe('https://x.test/1');
  });

  it('sets dedupe_key to the value passed in', () => {
    const key = dedupeKeyFor(row());
    expect(buildJobRow(row(), null, key).dedupe_key).toBe(key);
  });
});

// Regression tests for the Task 10 fix-round-1 decision: fingerprint alone is
// too coarse. Two concurrent requisitions for the same role, at the same
// employer, from the same source are two distinct jobs -- only a genuine
// cross-source match (same fingerprint, different source_id) should merge.
describe('groupIntoJobs', () => {
  it('keeps two same-source rows with different requisition IDs as two separate jobs', () => {
    const rowA = row({ id: 'a', normalized: { ...posting, sourceJobId: 'JR106052' } });
    const rowB = row({ id: 'b', normalized: { ...posting, sourceJobId: 'JR106062' } });

    const groups = groupIntoJobs([rowA, rowB]);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.length === 1)).toBe(true);

    const jobA = buildJobRow(rowA, null, dedupeKeyFor(rowA));
    const jobB = buildJobRow(rowB, null, dedupeKeyFor(rowB));

    expect(jobA.dedupe_key).not.toBe(jobB.dedupe_key);
    expect(jobA.slug).not.toBe(jobB.slug);
  });

  it('merges two rows sharing a fingerprint across different sources into one job, canonical is the workday row', () => {
    const workdayRow = row({ id: 'w', source_id: 'workday:shn' });
    const adzunaRow = row({ id: 'ad', source_id: 'adzuna' });

    const groups = groupIntoJobs([adzunaRow, workdayRow]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
    expect(pickCanonical(groups[0]).id).toBe('w');
  });
});
