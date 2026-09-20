import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  extractSuccessFactorsMbDetail,
  normalizeSuccessFactorsMb,
  parseManitobaSearchPage,
  parseDescriptionFields,
  parseSalary,
  employmentTypeFromManitoba,
  type SuccessFactorsMbEmployer,
} from '@/workers/connectors/successfactors-mb';
import type { JobStub } from '@/lib/types';

const HOST = 'careers.wrha.mb.ca';
const fixture = (name: string) => readFileSync(`fixtures/successfactors-mb/${name}.html`, 'utf8');

const registry: SuccessFactorsMbEmployer = {
  slug: 'manitoba-health-care-careers',
  name: 'Shared Health Manitoba',
  province: 'MB',
  defaultCity: 'Winnipeg',
  config: { key: 'mb', host: HOST },
};

const detail = (name: string, stub?: JobStub) =>
  extractSuccessFactorsMbDetail(fixture(name), stub);

/** A search row as `fetchPage` would have produced it, for the fields only it carries. */
const listRow = (employer: string, status: string): JobStub => ({
  sourceJobId: '605149717',
  externalPath: '/job/x/605149717/',
  title: 'Irrelevant here',
  locationsText: 'Winnipeg, MB, CA',
  listFields: { employer, status },
});

describe('parseManitobaSearchPage', () => {
  const stubs = parseManitobaSearchPage(fixture('search'), HOST);

  it('reads a full page of rows with their dates', () => {
    expect(stubs).toHaveLength(25);
    for (const stub of stubs) {
      expect(stub.sourceJobId).toMatch(/^\d+$/);
      expect(stub.title.length).toBeGreaterThan(0);
      expect(stub.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(stub.postedAt!.getTime())).toBe(false);
    }
  });

  it('carries the employer and employment status the postings do not state', () => {
    for (const stub of stubs) {
      expect(stub.listFields?.employer?.length).toBeGreaterThan(0);
      expect(['Permanent', 'Temporary', 'Casual']).toContain(stub.listFields?.status);
    }
  });

  it('takes the wide-screen copy of each cell, not the phone copy', () => {
    // Both are in the row; the phone one carries a class modifier. Picking the wrong one
    // still yields a plausible string, so this asserts the value, not just its presence.
    const first = stubs[0];
    expect(first.listFields?.employer).not.toMatch(/visible-phone|hidden-phone/);
    expect(first.locationsText).toMatch(/, MB, CA$|, CA$/);
  });

  it('resolves HTML entities in the title rather than showing them raw', () => {
    const row = fixture('search').replace(
      /(<a[^>]*jobTitle-link[^>]*>)[^<]*(<\/a>)/,
      '$1Labour &amp; Delivery &#8212; Nurse$2',
    );
    expect(parseManitobaSearchPage(row, HOST)[0].title).toBe('Labour & Delivery — Nurse');
  });

  it('rejects a row whose link leaves the registry host', () => {
    const tampered = fixture('search').replace(/href="\/job\//, 'href="https://evil.example/job/');
    expect(() => parseManitobaSearchPage(tampered, HOST)).toThrow(/not on registry host/);
  });
});

describe('normalizeSuccessFactorsMb', () => {
  it('names the employer the posting states, not the site owner', () => {
    // Every posting on this site claims hiringOrganization "Winnipeg Regional Health
    // Authority"; this one is Southern Health's, 90km away.
    const posting = normalizeSuccessFactorsMb(detail('southern-health-job'), registry);
    expect(posting.employerName).toBe('Southern Health-Santé Sud');
    expect(posting.facilityName).toBe('Carman Memorial Hospital');
    expect(posting.city).toBe('Carman');
    expect(posting.province).toBe('MB');
    expect(posting.sourceId).toBe('successfactors_mb:mb');
  });

  it('tells the employer apart from the site it staffs', () => {
    // The search results file this one under "Health Sciences Centre"; the employer is
    // Shared Health, which runs it.
    const posting = normalizeSuccessFactorsMb(detail('shared-health-hsc-job'), registry);
    expect(posting.employerName).toBe('Shared Health');
    expect(posting.facilityName).toMatch(/Health Sciences Centre/);
  });

  it('falls back to the search row when a posting names no employer', () => {
    // CancerCare Manitoba's template opens with prose instead of an "Employer:" line.
    const stub = listRow('CancerCare Manitoba', 'Temporary');
    const posting = normalizeSuccessFactorsMb(detail('cancercare-job', stub), registry);
    expect(posting.employerName).toBe('CancerCare Manitoba');
  });

  it('maps every saved fixture without throwing', () => {
    for (const name of ['southern-health-job', 'st-boniface-job', 'shared-health-hsc-job', 'cancercare-job']) {
      const posting = normalizeSuccessFactorsMb(detail(name), registry);
      expect(posting.title.length).toBeGreaterThan(0);
      expect(posting.province).toBe('MB');
      expect(posting.city.length).toBeGreaterThan(0);
      expect(posting.description.length).toBeGreaterThan(50);
      expect(posting.description).not.toMatch(/<(script|style)\b/);
      expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
      expect(posting.applyUrl).toMatch(new RegExp(`^https://${HOST}/job/`));
    }
  });

  it('refuses a posting whose canonical URL points off the registry host', () => {
    const raw = { ...detail('st-boniface-job'), url: 'https://evil.example/job/123/' };
    expect(() => normalizeSuccessFactorsMb(raw, registry)).toThrow(/not on registry host/);
  });

  it('throws rather than inventing a posting with no date or description', () => {
    expect(() => extractSuccessFactorsMbDetail('<html><body>nothing</body></html>'))
      .toThrow(/missing url, title, posted date or description/);
  });
});

describe('parseDescriptionFields', () => {
  it('reads labels however an employer spaces and capitalises them', () => {
    // "Department/Unit" here, "Department / Unit" at St. Boniface; "Anticipated shift"
    // here, "Anticipated Shift" there.
    const southern = parseDescriptionFields(detail('southern-health-job').descriptionHtml);
    expect(southern['Anticipated Shift']).toBe('Days; Nights; Weekends');
    expect(southern['Hiring Status']).toBe('Permanent');
    expect(southern['FTE']).toBe('0.70');

    const boniface = parseDescriptionFields(detail('st-boniface-job').descriptionHtml);
    expect(boniface['Anticipated Shift']).toBe('Days;Evenings;Weekends');
    expect(boniface['Employer']).toBe('St. Boniface Hospital');
  });

  it('keeps a posting’s prose headings out of the fields', () => {
    const fields = parseDescriptionFields(detail('cancercare-job').descriptionHtml);
    expect(fields).not.toHaveProperty('Qualifications');
    expect(fields).not.toHaveProperty('Job Summary');
    expect(fields['FTE']).toBe('1.0');
  });
});

describe('employmentTypeFromManitoba', () => {
  it('reads full against part time from the FTE', () => {
    expect(employmentTypeFromManitoba({ FTE: '0.70' }, 'Permanent')).toBe('part_time');
    expect(employmentTypeFromManitoba({ FTE: '1.0' }, 'Permanent')).toBe('full_time');
  });

  it('lets a term position outrank its hours', () => {
    expect(employmentTypeFromManitoba({ FTE: '1.0' }, 'Temporary')).toBe('temporary');
    expect(employmentTypeFromManitoba({ FTE: '1.0', 'Reason for Term': 'Maternity Leave' }, 'Permanent'))
      .toBe('temporary');
    expect(employmentTypeFromManitoba({ FTE: '1.0' }, 'Casual')).toBe('casual');
  });

  it('falls back to the status when a posting states no FTE', () => {
    expect(employmentTypeFromManitoba({}, 'Permanent')).toBe('full_time');
    expect(employmentTypeFromManitoba({}, '')).toBeUndefined();
  });

  it('reads the real fixtures', () => {
    const stub = listRow('St. Boniface Hospital', 'Temporary');
    expect(normalizeSuccessFactorsMb(detail('st-boniface-job', stub), registry).employmentType)
      .toBe('temporary');
  });
});

describe('parseSalary', () => {
  it('reads a union pay grid as a floor and a ceiling', () => {
    expect(parseSalary({ Salary: '$22.002, $22.645, $23.307, $23.993, $24.697' }))
      .toEqual({ salaryMin: 22.002, salaryMax: 24.697, salaryPeriod: 'hour' });
    // The first two steps are separated by a space rather than a comma on some postings.
    expect(parseSalary({ Salary: '$60.744 $62.625, $64.584, $66.615, $68.745, $70.963' }))
      .toEqual({ salaryMin: 60.744, salaryMax: 70.963, salaryPeriod: 'hour' });
  });

  it('quotes nothing when the posting defers to a collective agreement', () => {
    expect(parseSalary({ Salary: 'As per MNU Collective Agreement' })).toEqual({});
    expect(parseSalary({})).toEqual({});
  });

  it('ignores a grid with no figures in it', () => {
    // Seen live: a posting whose pay steps rendered as empty dollar signs.
    expect(parseSalary({ Salary: '$, $, $, $, $, $' })).toEqual({});
  });

  it('refuses a line that mixes pay periods rather than guessing', () => {
    expect(parseSalary({ Salary: '3 hours per week at $49.2 per week ($16.40/hour)' })).toEqual({});
  });

  it('reads an annual figure as annual', () => {
    expect(parseSalary({ Salary: '$78,000 - $92,500' }))
      .toEqual({ salaryMin: 78000, salaryMax: 92500, salaryPeriod: 'year' });
  });
});
