import { describe, it, expect } from 'vitest';
import { postedAgo, formatSalary } from '@/lib/format';

describe('postedAgo', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  it('reads as today for the same day', () => {
    expect(postedAgo('2026-09-08T09:00:00Z', now)).toBe('Posted today');
  });
  it('reads in days', () => {
    expect(postedAgo('2026-09-04T09:00:00Z', now)).toBe('Posted 4 days ago');
  });
  it('uses the singular for one day', () => {
    expect(postedAgo('2026-09-07T09:00:00Z', now)).toBe('Posted 1 day ago');
  });
});

describe('formatSalary', () => {
  it('formats an hourly range the way a job seeker reads it', () => {
    expect(formatSalary(38.84, 54.77, 'hour')).toBe('$38.84–$54.77/hr');
  });
  it('formats an annual range', () => {
    expect(formatSalary(80000, 95000, 'year')).toBe('$80,000–$95,000/yr');
  });
  it('returns null when no salary is known', () => {
    expect(formatSalary(null, null, null)).toBeNull();
  });
});
