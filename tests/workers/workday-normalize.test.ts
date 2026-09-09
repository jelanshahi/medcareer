import { describe, it, expect } from 'vitest';
import shnList from '@/fixtures/workday/shn-list.json';
import shnDetail from '@/fixtures/workday/shn-detail.json';
import cheoDetail from '@/fixtures/workday/cheo-detail.json';
import { parseWorkdayList, normalizeWorkday, parseDescriptionHeader } from '@/workers/connectors/workday';
import type { WorkdayEmployer } from '@/workers/connectors/workday';

const shn: WorkdayEmployer = {
  slug: 'scarborough-health-network',
  name: 'Scarborough Health Network',
  province: 'ON',
  defaultCity: 'Toronto',
  config: { tenant: 'shn', site: 'SHN_External_Career_Site', host: 'shn.wd10.myworkdayjobs.com', parseDescriptionHeader: true },
};

const cheo: WorkdayEmployer = {
  slug: 'cheo',
  name: 'Children’s Hospital of Eastern Ontario',
  province: 'ON',
  defaultCity: 'Ottawa',
  config: { tenant: 'cheo', site: 'External_Site', host: 'cheo.wd10.myworkdayjobs.com', parseDescriptionHeader: false },
};

describe('parseWorkdayList', () => {
  it('extracts stubs with a source job id from bulletFields', () => {
    const { total, stubs } = parseWorkdayList(shnList);
    expect(total).toBeGreaterThan(0);
    expect(stubs.length).toBeGreaterThan(0);
    expect(stubs[0].externalPath).toMatch(/^\/job\//);
    expect(stubs[0].sourceJobId).toMatch(/^JR\d+/);
  });
});

describe('normalizeWorkday', () => {
  it('maps the detail payload onto NormalizedPosting', () => {
    const posting = normalizeWorkday(shnDetail, shn);
    expect(posting.sourceId).toBe('workday:shn');
    expect(posting.title.length).toBeGreaterThan(0);
    expect(posting.employerName).toBe('Scarborough Health Network');
    expect(posting.province).toBe('ON');
    expect(posting.postedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    expect(posting.applyUrl).toMatch(/^https:\/\//);
  });

  it('takes city from the employer registry, not the payload', () => {
    expect(normalizeWorkday(shnDetail, shn).city).toBe('Toronto');
    expect(normalizeWorkday(cheoDetail, cheo).city).toBe('Ottawa');
  });

  it('stores the payload location string as the facility name', () => {
    expect(normalizeWorkday(shnDetail, shn).facilityName).toBeTruthy();
  });

  it('sanitizes the description', () => {
    const posting = normalizeWorkday(shnDetail, shn);
    expect(posting.description).not.toContain('<script');
    expect(posting.description).not.toContain('#xa;');
  });

  it('rejects a payload missing required fields', () => {
    expect(() => normalizeWorkday({ jobPostingInfo: {} }, shn)).toThrow();
  });
});

describe('parseDescriptionHeader', () => {
  const header = [
    'Job Number: JR106772',
    'Union: OPSEU',
    'Job Type: Permanent, Full time',
    'Minimum - Maximum Hourly Rate: $38.84 - $54.77',
    'Hours: Days, Weekends',
  ].join('&amp;#xa;');

  it('extracts salary range and period', () => {
    const fields = parseDescriptionHeader(header);
    expect(fields.salaryMin).toBe(38.84);
    expect(fields.salaryMax).toBe(54.77);
    expect(fields.salaryPeriod).toBe('hour');
  });

  it('extracts shift type', () => {
    expect(parseDescriptionHeader(header).shiftType).toBe('day');
  });

  it('extracts employment type', () => {
    expect(parseDescriptionHeader(header).employmentType).toBe('full_time');
  });

  it('returns empty fields rather than throwing when no header is present', () => {
    expect(parseDescriptionHeader('<p>Just prose.</p>')).toEqual({});
  });
});
