import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  extractTaleoDetail,
  normalizeTaleo,
  parsePostDate,
  parseTaleoList,
  shiftTypeFromPattern,
  employmentTypeFromClass,
  type TaleoEmployer,
} from '@/workers/connectors/taleo';

const fixture = (name: string) => readFileSync(`fixtures/taleo/${name}`, 'utf8');

/** When the fixtures were saved; relative post dates ("20 hours ago") resolve against it. */
const SAVED_AT = new Date('2026-09-17T02:30:00Z');

const ahs: TaleoEmployer = {
  slug: 'alberta-health-services',
  name: 'Alberta Health Services',
  province: 'AB',
  defaultCity: 'Edmonton',
  config: { key: 'ahs', host: 'careers.albertahealthservices.ca' },
};

const covenant: TaleoEmployer = {
  slug: 'covenant-health',
  name: 'Covenant Health',
  province: 'AB',
  defaultCity: 'Edmonton',
  config: { key: 'covenant', host: 'careers.covenanthealth.ca' },
};

const normalized = (name: string, employer: TaleoEmployer) =>
  normalizeTaleo(extractTaleoDetail(fixture(name), SAVED_AT), employer);

describe('parseTaleoList', () => {
  it('reads the result count and one stub per row', () => {
    const { total, stubs } = parseTaleoList(fixture('ahs-list.html'), ahs.config.host);
    expect(total).toBe(1054);
    expect(stubs).toHaveLength(10);
    expect(stubs[0]).toEqual({
      sourceJobId: '593610',
      externalPath: '/jobs/occupational-therapist-ii-rehabilitation-oncology-593610',
      title: 'Occupational Therapist II - Rehabilitation Oncology',
      locationsText: 'North Zone, Grande Prairie, Grande Prairie Cancer Centre',
    });
  });

  it('rejects links to a host other than the registry host', () => {
    expect(() => parseTaleoList(fixture('ahs-list.html'), covenant.config.host)).toThrow(/registry host/);
  });
});

describe('parsePostDate', () => {
  it('handles absolute and relative dates', () => {
    expect(parsePostDate('Aug 29, 2026', SAVED_AT)).toBe('2026-08-29');
    expect(parsePostDate('Sep 03, 2026', SAVED_AT)).toBe('2026-09-03');
    expect(parsePostDate('20 hours ago', SAVED_AT)).toBe('2026-09-16');
    expect(parsePostDate('6 days ago', SAVED_AT)).toBe('2026-09-11');
    expect(parsePostDate('1 day ago', SAVED_AT)).toBe('2026-09-16');
    expect(parsePostDate('Today', SAVED_AT)).toBe('2026-09-17');
  });

  it('throws rather than guessing', () => {
    expect(() => parsePostDate('sometime soon', SAVED_AT)).toThrow(/Unparseable/);
  });
});

describe('normalizeTaleo', () => {
  it('maps a regular AHS posting', () => {
    const posting = normalized('ahs-detail-casual.html', ahs);
    expect(posting).toMatchObject({
      sourceId: 'taleo:ahs',
      sourceJobId: '581640',
      sourceUrl: 'https://careers.albertahealthservices.ca/jobs/registered-nurse-581640',
      applyUrl: 'https://careers.albertahealthservices.ca/jobs/registered-nurse-581640',
      title: 'Registered Nurse',
      employerName: 'Alberta Health Services',
      city: 'Provost',
      province: 'AB',
      facilityName: 'Provost Prov Bldg',
      employmentType: 'casual',
      salaryPeriod: 'hour',
      salaryMin: 44.56,
    });
    expect(posting.postedAt.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(posting.closesAt).toBeInstanceOf(Date);
    expect(posting.description).not.toMatch(/<(font|b|div)\b/);
    expect(posting.description).toContain('<li><strong>Union:</strong> United Nurses of Alberta</li>');
    expect(posting.description).toContain('<h4>Required Qualifications: </h4>');
    expect(posting.description.length).toBeGreaterThan(100);
  });

  it('falls back to the registry city for a province-wide posting', () => {
    const posting = normalized('ahs-detail-provincial.html', ahs);
    expect(posting.city).toBe('Edmonton');
    expect(posting.facilityName).toBeUndefined();
    expect(posting.postedAt.toISOString()).toBe('2026-09-16T00:00:00.000Z');
    expect(posting.closesAt?.toISOString()).toBe('2026-09-26T06:59:59.000Z');
    expect(posting.shiftType).toBe('day');
    expect(posting.employmentType).toBe('full_time');
  });

  it('handles a two-part location and a temporary employee class', () => {
    const posting = normalized('ahs-detail-temp.html', ahs);
    expect(posting.city).toBe('Edmonton');
    expect(posting.facilityName).toBeUndefined();
    expect(posting.employmentType).toBe('temporary');
  });

  it('maps a Covenant Health posting under its own source', () => {
    const posting = normalized('covenant-detail.html', covenant);
    expect(posting.sourceId).toBe('taleo:covenant');
    expect(posting.city).toBe('Edmonton');
    expect(posting.facilityName).toBe('Misericordia Community Hosp');
    expect(posting.title).toBe('Registered Nurse - Ortho 6E');
  });

  it('refuses a detail page from another employer’s portal', () => {
    expect(() => normalized('covenant-detail.html', ahs)).toThrow(/registry host/);
  });
});

describe('field mappers', () => {
  it('maps shift patterns', () => {
    expect(shiftTypeFromPattern('Days')).toBe('day');
    expect(shiftTypeFromPattern('Days, Weekends')).toBe('day');
    expect(shiftTypeFromPattern('Evenings, Weekends')).toBe('evening');
    expect(shiftTypeFromPattern('Days, Evenings, Nights, Weekends, On Call')).toBe('rotating');
    expect(shiftTypeFromPattern(undefined)).toBeUndefined();
  });

  it('maps employee classes', () => {
    expect(employmentTypeFromClass({ 'Employee Class': 'Regular Part Time' })).toBe('part_time');
    expect(employmentTypeFromClass({ 'Employee Class': 'Casual/Relief' })).toBe('casual');
    expect(employmentTypeFromClass({ 'Employee Class': '', 'Temporary Employee Class': 'Temp P/T Benefits' })).toBe('temporary');
    expect(employmentTypeFromClass({})).toBeUndefined();
  });
});
