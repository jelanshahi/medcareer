import { describe, it, expect } from 'vitest';
import { MAX_AGE_DAYS, isTooOld } from '@/workers/run';

const daysAgo = (days: number, from = new Date('2026-09-17T12:00:00Z')) =>
  new Date(from.getTime() - days * 86_400_000);

describe('isTooOld', () => {
  const now = new Date('2026-09-17T12:00:00Z');

  it('keeps a posting inside the window', () => {
    expect(isTooOld(daysAgo(0), now)).toBe(false);
    expect(isTooOld(daysAgo(MAX_AGE_DAYS - 1), now)).toBe(false);
  });

  it('keeps one exactly at the cutoff', () => {
    // Workday reports anything past a month as "Posted 30+ Days Ago", so the boundary itself
    // has to fall on the keep side or those postings would be dropped a day early.
    expect(isTooOld(daysAgo(MAX_AGE_DAYS), now)).toBe(false);
  });

  it('turns one away past the cutoff', () => {
    expect(isTooOld(daysAgo(MAX_AGE_DAYS + 1), now)).toBe(true);
    expect(isTooOld(daysAgo(180), now)).toBe(true);
  });

  it('treats a future date as fresh rather than stale', () => {
    expect(isTooOld(new Date(now.getTime() + 86_400_000), now)).toBe(false);
  });

  it('is well inside the 60-day deletion mark, so a purged job cannot be re-ingested', () => {
    expect(MAX_AGE_DAYS).toBeLessThan(60);
  });
});
