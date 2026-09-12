import { describe, it, expect } from 'vitest';
import { buildGlance, type GlanceJob } from '@/lib/jobs/glance';

const base: GlanceJob = {
  employer_name: 'CHEO',
  employment_type: 'full_time',
  salary_min: null,
  salary_max: null,
  salary_period: null,
  posted_at: new Date().toISOString(),
};

const labelled = (rows: { label: string; value: string }[]) =>
  Object.fromEntries(rows.map((r) => [r.label, r.value]));

describe('buildGlance', () => {
  it('returns no rows for an empty set', () => {
    expect(buildGlance([])).toEqual([]);
  });

  it('counts listings', () => {
    const rows = labelled(buildGlance([base, base, base]));
    expect(rows['Active listings']).toBe('3');
  });

  it('lists distinct employers', () => {
    const rows = labelled(
      buildGlance([base, { ...base, employer_name: 'Oak Valley Health' }, base]),
    );
    expect(rows['Hiring here']).toBe('CHEO, Oak Valley Health');
  });

  it('lists employment types by their user-facing labels', () => {
    const rows = labelled(buildGlance([base, { ...base, employment_type: 'casual' }]));
    expect(rows['Employment']).toBe('Full time, Casual');
  });

  it('omits employment entirely when no listing declares a type', () => {
    const rows = labelled(buildGlance([{ ...base, employment_type: null }]));
    expect(rows['Employment']).toBeUndefined();
  });

  // The Markham and Ottawa case: 88 of 153 active rows publish no band at all.
  // A placeholder here would be worse than silence.
  it('omits the pay row entirely when no listing publishes a band', () => {
    const rows = labelled(buildGlance([base, base]));
    expect(rows['Published pay']).toBeUndefined();
  });

  it('reports pay coverage and the outer bounds when some listings publish a band', () => {
    const rows = labelled(
      buildGlance([
        { ...base, salary_min: 39.07, salary_max: 56, salary_period: 'hour' },
        { ...base, salary_min: 32.14, salary_max: 48.8, salary_period: 'hour' },
        base,
      ]),
    );
    expect(rows['Published pay']).toBe('2 of 3 listings, from $32.14 to $56.00/hr');
  });

  it('describes a single listing in the singular', () => {
    const rows = labelled(
      buildGlance([{ ...base, salary_min: 30, salary_max: 40, salary_period: 'hour' }]),
    );
    expect(rows['Active listings']).toBe('1');
    expect(rows['Published pay']).toBe('1 of 1 listing, from $30.00 to $40.00/hr');
  });

  it('reports the most recent posting', () => {
    const rows = labelled(buildGlance([{ ...base, posted_at: new Date().toISOString() }]));
    expect(rows['Most recent']).toBe('Posted today');
  });

  it('always states the refresh cadence', () => {
    const rows = labelled(buildGlance([base]));
    expect(rows['Refreshed']).toBe('Every 6 hours');
  });
});
