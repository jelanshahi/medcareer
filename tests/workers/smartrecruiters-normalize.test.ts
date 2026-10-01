import { describe, it, expect } from 'vitest';
import uhnList from '@/fixtures/smartrecruiters/uhn-list.json';
import { parseSmartRecruitersList } from '@/workers/connectors/smartrecruiters';
import oslerDetail from '@/fixtures/smartrecruiters/osler-detail.json';
import uhnDetail from '@/fixtures/smartrecruiters/uhn-detail.json';
import {
  normalizeSmartRecruiters,
  employmentTypeFromSmartRecruiters,
  combineJobAdSections,
} from '@/workers/connectors/smartrecruiters';
import type { SmartRecruitersEmployer } from '@/workers/connectors/smartrecruiters';

describe('parseSmartRecruitersList', () => {
  it('extracts stubs with source job ids, titles, and posted dates', () => {
    const stubs = parseSmartRecruitersList(uhnList);
    expect(stubs).toHaveLength(2);
    expect(stubs[0].sourceJobId).toBe('743999752619427');
    expect(stubs[0].title).toBe('Registered Nurse - Medicine');
    expect(stubs[0].externalPath).toBe('/postings/743999752619427');
    expect(stubs[0].postedAt).toEqual(new Date('2026-09-15T13:22:00.000Z'));
  });

  it('builds locationsText from city and region', () => {
    const stubs = parseSmartRecruitersList(uhnList);
    expect(stubs[0].locationsText).toBe('Toronto, Ontario');
  });
});

const uhn: SmartRecruitersEmployer = {
  slug: 'university-health-network',
  name: 'University Health Network',
  province: 'ON',
  defaultCity: 'Toronto',
  config: { key: 'UniversityHealthNetwork', host: 'api.smartrecruiters.com' },
};

const osler: SmartRecruitersEmployer = {
  slug: 'william-osler-health-system',
  name: 'William Osler Health System',
  province: 'ON',
  defaultCity: 'Brampton',
  config: { key: 'williamoslerhealthsystem1', host: 'api.smartrecruiters.com', cityAliases: { GTA: 'Brampton' } },
};

describe('employmentTypeFromSmartRecruiters', () => {
  it.each([
    ['Full-time', 'full_time'],
    ['Part-time', 'part_time'],
    ['Temporary', 'temporary'],
    ['Casual', 'casual'],
    ['Contract', 'contract'],
    ['Student', undefined],
    [undefined, undefined],
  ] as const)('maps %s to %s', (label, expected) => {
    expect(employmentTypeFromSmartRecruiters(label)).toBe(expected);
  });
});

describe('combineJobAdSections', () => {
  it('concatenates every present section in a fixed order', () => {
    const html = combineJobAdSections(uhnDetail.jobAd);
    expect(html.indexOf('Company Description')).toBeLessThan(html.indexOf('Job Description'));
    expect(html.indexOf('Job Description')).toBeLessThan(html.indexOf('Qualifications'));
    expect(html.indexOf('Qualifications')).toBeLessThan(html.indexOf('Additional Information'));
  });

  it('skips missing sections instead of inserting empty headings', () => {
    const html = combineJobAdSections(oslerDetail.jobAd);
    expect(html).not.toContain('Qualifications');
    expect(html).not.toContain('Additional Information');
    expect(html).toContain('Job Description');
  });

  it('returns an empty string when jobAd is absent', () => {
    expect(combineJobAdSections(undefined)).toBe('');
  });
});

describe('normalizeSmartRecruiters', () => {
  it('maps the detail payload onto NormalizedPosting', () => {
    const posting = normalizeSmartRecruiters(uhnDetail, uhn);
    expect(posting.sourceId).toBe('smartrecruiters:UniversityHealthNetwork');
    expect(posting.sourceJobId).toBe('743999752619427');
    expect(posting.title).toBe('Registered Nurse - Medicine');
    expect(posting.employerName).toBe('University Health Network');
    expect(posting.city).toBe('Toronto');
    expect(posting.province).toBe('ON');
    expect(posting.employmentType).toBe('full_time');
    expect(posting.postedAt).toEqual(new Date('2026-09-15T13:22:00.000Z'));
    expect(posting.applyUrl).toMatch(/^https:\/\/jobs\.smartrecruiters\.com\//);
  });

  it('sanitizes and combines the description sections', () => {
    const posting = normalizeSmartRecruiters(uhnDetail, uhn);
    expect(posting.description).toContain('Registered Nurse provides direct patient care');
    expect(posting.description).not.toContain('<script');
  });

  it('applies cityAliases for a grouped location name', () => {
    expect(normalizeSmartRecruiters(oslerDetail, osler).city).toBe('Brampton');
  });

  it('falls back to the employer registry province when location.region is empty', () => {
    expect(normalizeSmartRecruiters(oslerDetail, osler).province).toBe('ON');
  });

  it('maps an employment type outside EMPLOYMENT_TYPES to undefined', () => {
    expect(normalizeSmartRecruiters(oslerDetail, osler).employmentType).toBeUndefined();
  });

  it('leaves salary and shift type undefined (no reliable structured field)', () => {
    const posting = normalizeSmartRecruiters(uhnDetail, uhn);
    expect(posting.salaryMin).toBeUndefined();
    expect(posting.salaryMax).toBeUndefined();
    expect(posting.shiftType).toBeUndefined();
  });

  it('rejects a payload missing required fields', () => {
    expect(() => normalizeSmartRecruiters({ id: '1' }, uhn)).toThrow();
  });

  it('rejects a non-https applyUrl', () => {
    const malicious = JSON.parse(JSON.stringify(uhnDetail));
    malicious.applyUrl = 'http://jobs.smartrecruiters.com/x';
    expect(() => normalizeSmartRecruiters(malicious, uhn)).toThrow();
  });

  it('rejects an applyUrl on a domain outside the SmartRecruiters allow-list', () => {
    const foreign = JSON.parse(JSON.stringify(uhnDetail));
    foreign.applyUrl = 'https://evil.example.com/743999752619427';
    expect(() => normalizeSmartRecruiters(foreign, uhn)).toThrow(/evil\.example\.com/);
  });

  it('accepts the real fixture apply URLs', () => {
    expect(() => normalizeSmartRecruiters(uhnDetail, uhn)).not.toThrow();
    expect(() => normalizeSmartRecruiters(oslerDetail, osler)).not.toThrow();
  });
});
