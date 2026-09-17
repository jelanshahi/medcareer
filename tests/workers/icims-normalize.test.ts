import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  extractIcimsDetail,
  normalizeIcims,
  parseIcimsSitemap,
  resolvePostedAt,
  employmentTypeFromIcims,
  type IcimsDetail,
  type IcimsEmployer,
} from '@/workers/connectors/icims';

const fixture = (name: string) => readFileSync(`fixtures/icims/${name}`, 'utf8');

/** When the fixtures were saved. */
const SAVED_AT = new Date('2026-09-17T18:18:00Z');
/** The sitemap's last-modified date for the VCH posting in vch-sitemap.xml terms. */
const LAST_MODIFIED = new Date('2026-09-17T11:59:09-04:00');

const vch: IcimsEmployer = {
  slug: 'vancouver-coastal-health',
  name: 'Vancouver Coastal Health',
  province: 'BC',
  defaultCity: 'Vancouver',
  config: { key: 'vch', host: 'careers-vch.icims.com' },
};

const humber: IcimsEmployer = {
  slug: 'humber-river-health',
  name: 'Humber River Health',
  province: 'ON',
  defaultCity: 'Toronto',
  config: { key: 'hrrh', host: 'careersen-hrrh.icims.com', cityAliases: { 'Greater Toronto': 'Toronto' } },
};

const mackenzie: IcimsEmployer = {
  slug: 'mackenzie-health',
  name: 'Mackenzie Health',
  province: 'ON',
  defaultCity: 'Richmond Hill',
  config: { key: 'mackenzie', host: 'employment-mackenziehealth.icims.com' },
};

const detail = (name: string) => extractIcimsDetail(fixture(name), LAST_MODIFIED);

describe('parseIcimsSitemap', () => {
  it('returns one stub per posting, dated by last-modified', () => {
    const stubs = parseIcimsSitemap(fixture('vch-sitemap.xml'), vch.config.host);
    expect(stubs.length).toBeGreaterThan(5);
    expect(stubs[0].sourceJobId).toMatch(/^\d+$/);
    expect(stubs[0].externalPath).toMatch(/^\/jobs\/\d+\/.*\/job$/);
    expect(stubs[0].postedAt).toBeInstanceOf(Date);
    // /jobs/search carries no id and must not become a stub.
    expect(stubs.some((s) => s.externalPath === '/jobs/search')).toBe(false);
  });

  it('rejects a sitemap served from another employer’s host', () => {
    expect(() => parseIcimsSitemap(fixture('vch-sitemap.xml'), humber.config.host)).toThrow(/registry host/);
  });
});

describe('resolvePostedAt', () => {
  const base = detail('humber-job.html');

  it('keeps a believable datePosted', () => {
    expect(resolvePostedAt(base, SAVED_AT).toISOString()).toBe('2026-09-17T04:00:00.000Z');
  });

  it('falls back to last-modified for the two-year-old placeholder', () => {
    const placeholder: IcimsDetail = {
      ...base,
      posting: { ...base.posting, datePosted: '2024-09-17T18:18:44.412Z' },
    };
    expect(resolvePostedAt(placeholder, SAVED_AT).toISOString()).toBe(LAST_MODIFIED.toISOString());
  });

  it('falls back when a posting carries no date at all', () => {
    const posting = { ...base.posting };
    delete posting.datePosted;
    expect(resolvePostedAt({ ...base, posting }, SAVED_AT).toISOString()).toBe(LAST_MODIFIED.toISOString());
  });
});

describe('normalizeIcims', () => {
  it('maps a VCH posting, dating it from the sitemap', () => {
    const posting = normalizeIcims(detail('vch-job.html'), vch);
    expect(posting).toMatchObject({
      sourceId: 'icims:vch',
      sourceJobId: '169715',
      employerName: 'Vancouver Coastal Health',
      city: 'Sechelt',
      province: 'BC',
      facilityName: 'Sechelt Hospital',
      employmentType: 'full_time',
      salaryMin: 32.84,
      salaryMax: 41.35,
      salaryPeriod: 'hour',
    });
    // The page's own datePosted is the two-year-old placeholder.
    expect(posting.postedAt.toISOString()).toBe(LAST_MODIFIED.toISOString());
    expect(posting.closesAt).toBeUndefined();
    expect(posting.description).not.toMatch(/<(script|div|span)\b/);
    expect(posting.applyUrl).toContain('careers-vch.icims.com');
  });

  it('maps a Humber River posting and resolves its region name to a city', () => {
    const posting = normalizeIcims(detail('humber-job.html'), humber);
    expect(posting.city).toBe('Toronto');
    expect(posting.province).toBe('ON');
    expect(posting.employmentType).toBe('temporary');
    expect(posting.postedAt.toISOString()).toBe('2026-09-17T04:00:00.000Z');
  });

  it('maps a Mackenzie posting, including its shift pattern', () => {
    const posting = normalizeIcims(detail('mackenzie-job.html'), mackenzie);
    expect(posting.city).toBe('Richmond Hill');
    expect(posting.employmentType).toBe('temporary');
    expect(posting.shiftType).toBe('rotating');
    expect(posting.salaryPeriod).toBe('hour');
  });

  it('refuses a posting served from another employer’s portal', () => {
    expect(() => normalizeIcims(detail('vch-job.html'), humber)).toThrow(/registry host/);
  });
});

describe('employmentTypeFromIcims', () => {
  it('prefers the job-status label over a position type that says nothing about hours', () => {
    const base = detail('vch-job.html');
    expect(base.fields['Position Type']).toBe('Baseline');
    expect(employmentTypeFromIcims(base)).toBe('full_time');
  });

  it('falls back to the schema.org value when no label is present', () => {
    const base = detail('vch-job.html');
    expect(employmentTypeFromIcims({ ...base, fields: {} })).toBe('full_time');
    expect(employmentTypeFromIcims({ ...base, fields: {}, posting: { ...base.posting, employmentType: 'OTHER' } }))
      .toBeUndefined();
  });
});
