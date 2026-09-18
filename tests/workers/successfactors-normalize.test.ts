import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  extractSuccessFactorsDetail,
  normalizeSuccessFactors,
  parseSearchPage,
  parseListDate,
  parseDescriptionFields,
  employmentTypeFromSuccessFactors,
  parseSalary,
  type SuccessFactorsEmployer,
} from '@/workers/connectors/successfactors';

const fixture = (name: string) => readFileSync(`fixtures/successfactors/${name}`, 'utf8');

const nsh: SuccessFactorsEmployer = {
  slug: 'nova-scotia-health',
  name: 'Nova Scotia Health',
  province: 'NS',
  defaultCity: 'Halifax',
  config: { key: 'nsha', host: 'jobs.nshealth.ca', sites: ['nsha', 'physicians'] },
};

const iwk: SuccessFactorsEmployer = {
  slug: 'iwk-health',
  name: 'IWK Health',
  province: 'NS',
  defaultCity: 'Halifax',
  config: { key: 'iwk', host: 'jobs.nshealth.ca', sites: ['iwk'] },
};

const detail = (name: string) => extractSuccessFactorsDetail(fixture(name));

describe('parseSearchPage', () => {
  const stubs = parseSearchPage(fixture('nsha-search.html'), nsh.config.host, 'nsha');

  it('returns one stub per row, with the posted date the list shows', () => {
    expect(stubs).toHaveLength(25);
    for (const stub of stubs) {
      expect(stub.sourceJobId).toMatch(/^\d+$/);
      expect(stub.externalPath).toMatch(/^\/[a-z]+\/job\//);
      expect(stub.title.length).toBeGreaterThan(0);
      // Without a date the runner would have to fetch every posting to learn its age.
      expect(stub.postedAt).toBeInstanceOf(Date);
    }
  });

  it('rejects a row whose link points off the registry host', () => {
    // The real rows link relatively, so this is the shape that could smuggle in another host.
    const doctored = '<tr class="data-row"><a href="https://jobs.example.com/nsha/job/Some-Role/12345/">'
      + 'Some Role</a><td>Sep 18, 2026</td></tr>';
    expect(() => parseSearchPage(doctored, nsh.config.host, 'nsha')).toThrow(/registry host/);
  });
});

describe('parseListDate', () => {
  it('reads the list format', () => {
    expect(parseListDate('Sep 18, 2026')?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });

  it('returns nothing rather than an invalid date', () => {
    expect(parseListDate('whenever')).toBeUndefined();
  });
});

describe('normalizeSuccessFactors', () => {
  it('maps a Nova Scotia Health posting', () => {
    const posting = normalizeSuccessFactors(detail('nsha-job.html'), nsh);
    expect(posting).toMatchObject({
      sourceId: 'successfactors:nsha',
      sourceJobId: '576720017',
      employerName: 'Nova Scotia Health',
      city: 'Springhill',
      province: 'NS',
      employmentType: 'full_time',
      salaryMin: 38.43,
      salaryMax: 50.99,
      salaryPeriod: 'hour',
    });
    expect(posting.title).toContain('Physiotherapist');
    expect(posting.facilityName).toBe('All Saints Springhill Hospital');
    expect(posting.postedAt.toISOString()).toBe('2026-09-18T02:00:00.000Z');
    expect(posting.closesAt?.toISOString()).toBe('2026-09-26T03:00:00.000Z');
    expect(posting.description).not.toMatch(/<(script|div|span|meta)\b/);
  });

  it('maps an IWK posting under its own source and employer', () => {
    const posting = normalizeSuccessFactors(detail('iwk-job.html'), iwk);
    expect(posting.sourceId).toBe('successfactors:iwk');
    // Every posting on this host claims "Nova Scotia Health and IWK Health" as the
    // hiring organization, so the employer has to come from the registry row.
    expect(posting.employerName).toBe('IWK Health');
    expect(posting.city).toBe('Halifax');
    expect(posting.province).toBe('NS');
  });

  it('maps a physician posting, whose pay is quoted annually', () => {
    const posting = normalizeSuccessFactors(detail('physician-job.html'), nsh);
    expect(posting.city).toBe('Fall River');
    expect(posting.salaryPeriod).toBe('year');
    expect(posting.salaryMin).toBe(100000);
    expect(posting.salaryMax).toBe(150000);
  });

  it('refuses a posting from another host', () => {
    const base = detail('nsha-job.html');
    const moved = { ...base, url: base.url.replace('jobs.nshealth.ca', 'jobs.example.com') };
    expect(() => normalizeSuccessFactors(moved, nsh)).toThrow(/registry host/);
  });

  it('falls back to the registry city for a province-wide posting', () => {
    const base = detail('nsha-job.html');
    expect(normalizeSuccessFactors({ ...base, locality: 'All Locations' }, nsh).city).toBe('Halifax');
    expect(normalizeSuccessFactors({ ...base, locality: '' }, nsh).city).toBe('Halifax');
  });
});

describe('parseDescriptionFields', () => {
  it('splits the labelled block postings open with', () => {
    const fields = parseDescriptionFields(
      'Req ID: 170771 Location: Northern Zone, All Saints Springhill Hospital '
      + 'Department: OPNZ Physiotherapy ASSH Type of Employment: Permanent Hourly FT (100%) x 1 '
      + 'Posting Closing Date: 25-Sep-26',
    );
    expect(fields['Req ID']).toBe('170771');
    expect(fields['Location']).toBe('Northern Zone, All Saints Springhill Hospital');
    expect(fields['Type of Employment']).toBe('Permanent Hourly FT (100%) x 1');
    expect(fields['Posting Closing Date']).toBe('25-Sep-26');
  });
});

describe('employmentTypeFromSuccessFactors', () => {
  it('reads the employer’s own wording', () => {
    const type = (value: string) => employmentTypeFromSuccessFactors({ 'Type of Employment': value });
    expect(type('Permanent Hourly FT ( 100% ) x 1')).toBe('full_time');
    expect(type('Permanent Hourly PT (60%)')).toBe('part_time');
    expect(type('Casual Relief')).toBe('casual');
    // A temporary post is temporary even when its hours are full-time.
    expect(type('Temporary Hourly FT (100%) until March 2027')).toBe('temporary');
    expect(employmentTypeFromSuccessFactors({})).toBeUndefined();
  });
});

describe('parseSalary', () => {
  it('reads the rate stated in prose', () => {
    expect(parseSalary('Compensation and Benefits $38.43 - $50.99 hourly', {}))
      .toEqual({ salaryMin: 38.43, salaryMax: 50.99, salaryPeriod: 'hour' });
  });

  it('reads a physician annual range from its field', () => {
    expect(parseSalary('no rate in the prose', { 'Estimated Annual Salary': '100,000 - 150,000' }))
      .toEqual({ salaryMin: 100000, salaryMax: 150000, salaryPeriod: 'year' });
  });

  it('returns nothing when no rate is stated', () => {
    expect(parseSalary('Come work with us.', {})).toEqual({});
  });
});
