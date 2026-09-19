import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  normalizeOracleCloud,
  parseDescriptionFields,
  parseSalary,
  parseLocation,
  employmentTypeFromOracle,
  type OracleCloudEmployer,
} from '@/workers/connectors/oraclecloud';

const fixture = (name: string) =>
  JSON.parse(readFileSync(`fixtures/oraclecloud/${name}.json`, 'utf8')) as { items: unknown[] };

const detail = (name: string) => fixture(name).items[0];

const sha: OracleCloudEmployer = {
  slug: 'saskatchewan-health-authority',
  name: 'Saskatchewan Health Authority',
  province: 'SK',
  defaultCity: 'Saskatoon',
  config: { key: 'sha', host: 'emqk.fa.ca3.oraclecloud.com', site: 'CX_1001' },
};

describe('normalizeOracleCloud', () => {
  it('maps a posting, taking the city and facility from the posting’s own fields', () => {
    const posting = normalizeOracleCloud(detail('sha-detail-payband'), sha);
    expect(posting).toMatchObject({
      sourceId: 'oraclecloud:sha',
      employerName: 'Saskatchewan Health Authority',
      province: 'SK',
      salaryPeriod: 'hour',
    });
    expect(posting.sourceJobId).toMatch(/^\d+$/);
    expect(posting.city.length).toBeGreaterThan(0);
    expect(posting.facilityName?.length).toBeGreaterThan(0);
    expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    expect(posting.salaryMin).toBeGreaterThan(0);
    expect(posting.salaryMax).toBeGreaterThanOrEqual(posting.salaryMin!);
    expect(posting.description).not.toMatch(/<(script|div|span)\b/);
    // The apply link is the posting on the employer's own career site.
    expect(posting.applyUrl).toBe(`https://emqk.fa.ca3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${posting.sourceJobId}`);
  });

  it('reads a casual posting as casual', () => {
    expect(normalizeOracleCloud(detail('sha-detail-casual'), sha).employmentType).toBe('casual');
  });

  it('maps every saved fixture without throwing', () => {
    for (const name of ['sha-detail-payband', 'sha-detail-casual', 'sha-detail-other']) {
      const posting = normalizeOracleCloud(detail(name), sha);
      expect(posting.title.length).toBeGreaterThan(0);
      expect(posting.province).toBe('SK');
      expect(posting.description.length).toBeGreaterThan(50);
    }
  });

  it('throws on an unparseable posted date rather than inventing one', () => {
    const base = detail('sha-detail-payband') as Record<string, unknown>;
    expect(() => normalizeOracleCloud({ ...base, ExternalPostedStartDate: 'whenever' }, sha))
      .toThrow(/Unparseable posted date/);
  });
});

describe('parseLocation', () => {
  it('splits the API’s location string', () => {
    expect(parseLocation('Saskatoon, SK, Canada')).toEqual({ city: 'Saskatoon', province: 'SK' });
    expect(parseLocation('Porcupine Plain, SK, Canada')).toEqual({ city: 'Porcupine Plain', province: 'SK' });
  });

  it('returns nothing usable for an empty location', () => {
    expect(parseLocation('')).toEqual({ city: undefined, province: null });
  });
});

describe('parseDescriptionFields', () => {
  const text = 'Position # : 090377 Expected Start Date: March 13, 2026 Union: SUN '
    + 'Facility: Red Deer Nursing Home City/Town: Porcupine Plain Department: Chronic Resident Unit '
    + 'Type: Part-time regular FTE: 0.47 Shift Information : Days, Nights, Weekends '
    + 'Salary or Pay Band: Pay Band Nurse A $38.580 to $50.070 Travel Required: No';

  it('splits the labelled block a posting opens with', () => {
    const fields = parseDescriptionFields(text);
    expect(fields['Facility']).toBe('Red Deer Nursing Home');
    expect(fields['City/Town']).toBe('Porcupine Plain');
    expect(fields['Type']).toBe('Part-time regular');
    expect(fields['Shift Information']).toBe('Days, Nights, Weekends');
    expect(fields['Union']).toBe('SUN');
  });

  it('feeds the shift and pay through correctly', () => {
    const fields = parseDescriptionFields(text);
    expect(parseSalary(fields, 'Hourly')).toEqual({ salaryMin: 38.58, salaryMax: 50.07, salaryPeriod: 'hour' });
  });
});

describe('employmentTypeFromOracle', () => {
  it('prefers the posting’s own "Type" line', () => {
    expect(employmentTypeFromOracle({ Type: 'Part-time regular' }, 'Full time')).toBe('part_time');
    expect(employmentTypeFromOracle({ Type: 'Casual' }, null)).toBe('casual');
    expect(employmentTypeFromOracle({ Type: 'Full-time temporary' }, null)).toBe('temporary');
  });

  it('falls back to the API’s schedule when the posting says nothing', () => {
    expect(employmentTypeFromOracle({}, 'Part time')).toBe('part_time');
    expect(employmentTypeFromOracle({}, null)).toBeUndefined();
  });
});

describe('parseSalary', () => {
  it('reads a pay band whose name sits between the label and the figures', () => {
    expect(parseSalary({ 'Salary or Pay Band': 'Pay Band Emergency Medical Technician $29.909 to $36.572' }, 'Hourly'))
      .toEqual({ salaryMin: 29.909, salaryMax: 36.572, salaryPeriod: 'hour' });
  });

  it('returns nothing when no band is quoted', () => {
    expect(parseSalary({}, 'Hourly')).toEqual({});
    expect(parseSalary({ 'Salary or Pay Band': 'As per collective agreement' }, 'Hourly')).toEqual({});
  });
});
