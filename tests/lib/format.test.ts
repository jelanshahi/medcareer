import { describe, it, expect } from 'vitest';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';

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

describe('employerLine', () => {
  it('returns the employer alone when there is no facility', () => {
    expect(employerLine('CHEO', null, 'Ottawa')).toBe('CHEO');
  });

  it('drops an empty-string facility rather than leaving a dangling separator', () => {
    expect(employerLine('CHEO', '   ', 'Ottawa')).toBe('CHEO');
  });

  it('keeps a real facility name', () => {
    expect(employerLine('Scarborough Health Network', 'Centenary Hospital', 'Toronto')).toBe(
      'Scarborough Health Network · Centenary Hospital',
    );
  });

  // The live data's dominant case: facility_name repeats the city.
  it('drops a facility that merely repeats the city', () => {
    expect(employerLine('CHEO', 'Ottawa, ON', 'Ottawa')).toBe('CHEO');
    expect(employerLine('Oak Valley Health', 'Markham, Ontario', 'Markham')).toBe(
      'Oak Valley Health',
    );
  });

  it('ignores case when comparing the facility to the city', () => {
    expect(employerLine('CHEO', 'ottawa, on', 'Ottawa')).toBe('CHEO');
  });

  it('keeps a facility naming a genuinely different place', () => {
    expect(employerLine('Oak Valley Health', 'Uxbridge, Ontario', 'Markham')).toBe(
      'Oak Valley Health · Uxbridge, Ontario',
    );
  });
});
