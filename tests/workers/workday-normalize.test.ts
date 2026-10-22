import { describe, it, expect } from 'vitest';
import shnList from '@/fixtures/workday/shn-list.json';
import shnDetail from '@/fixtures/workday/shn-detail.json';
import cheoDetail from '@/fixtures/workday/cheo-detail.json';
import oakvalleyDetail from '@/fixtures/workday/oakvalley-detail.json';
import paramedDetail from '@/fixtures/workday/paramed-detail.json';
import extendicareAliasDetail from '@/fixtures/workday/extendicare-detail-alias.json';
import extendicareStreetDetail from '@/fixtures/workday/extendicare-detail-street.json';
import extendicareList from '@/fixtures/workday/extendicare-list.json';
import {
  parseWorkdayList,
  normalizeWorkday,
  parseDescriptionHeader,
  stripDescriptionHeader,
  resolveWorkdayLocation,
  postedAtFromPostedOn,
  nextWorkdayPage,
  type WorkdayCrawlState,
} from '@/workers/connectors/workday';
import { isTooOld } from '@/workers/run';
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

const oakvalley: WorkdayEmployer = {
  slug: 'oak-valley-health',
  name: 'Oak Valley Health',
  province: 'ON',
  defaultCity: 'Markham',
  // 'oakvalleyhealth' matches supabase/migrations/0003_seed_employers.sql. It was
  // 'oakvalley' here, so the suite exercised a tenant production will never see --
  // and sourceId is `workday:${tenant}`, so the real id went untested.
  config: { tenant: 'oakvalleyhealth', site: 'OakValleyHealth', host: 'oakvalleyhealth.wd10.myworkdayjobs.com', parseDescriptionHeader: false },
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

  it('produces the exact expected fields for the real SHN fixture', () => {
    const posting = normalizeWorkday(shnDetail, shn);
    expect(posting.sourceJobId).toBe('JR106932');
    expect(posting.facilityName).toBe('General Hospital');
    expect(posting.postedAt).toEqual(new Date('2026-09-08T00:00:00Z'));
    expect(posting.salaryMin).toBe(35.753);
    expect(posting.salaryMax).toBe(39.019);
    expect(posting.salaryPeriod).toBe('hour');
    expect(posting.employmentType).toBe('temporary');
    // "Hours: All Shifts" matches none of the shiftType branches; must not be misclassified as 'day'.
    expect(posting.shiftType).toBeUndefined();
  });

  it('does not leak the ATS header block into the seeker-facing description', () => {
    const posting = normalizeWorkday(shnDetail, shn);
    expect(posting.description).not.toContain('Job Number:');
    expect(posting.description).not.toContain('Union: CUPE');
    expect(posting.description).not.toContain('Hours: All Shifts');
  });

  it('produces no header-derived fields for Oak Valley, which has no header block', () => {
    const posting = normalizeWorkday(oakvalleyDetail, oakvalley);
    expect(posting.shiftType).toBeUndefined();
    expect(posting.salaryMin).toBeUndefined();
    expect(posting.salaryMax).toBeUndefined();
    expect(posting.salaryPeriod).toBeUndefined();
  });

  it('rejects a non-https externalUrl (scheme-based XSS / open redirect)', () => {
    const malicious = JSON.parse(JSON.stringify(shnDetail));
    malicious.jobPostingInfo.externalUrl = 'javascript:alert(1)';
    expect(() => normalizeWorkday(malicious, shn)).toThrow();

    const insecure = JSON.parse(JSON.stringify(shnDetail));
    insecure.jobPostingInfo.externalUrl = 'http://shn.wd10.myworkdayjobs.com/job/x';
    expect(() => normalizeWorkday(insecure, shn)).toThrow();
  });

  it('rejects an https externalUrl whose host is not the employer registry host', () => {
    const foreign = JSON.parse(JSON.stringify(shnDetail));
    foreign.jobPostingInfo.externalUrl =
      'https://evil.example.com/SHN_External_Career_Site/job/General-Hospital/x_JR106932-1';
    // The message must name both hosts and the req id so an operator can diagnose it.
    expect(() => normalizeWorkday(foreign, shn)).toThrow(/evil\.example\.com/);
    expect(() => normalizeWorkday(foreign, shn)).toThrow(/shn\.wd10\.myworkdayjobs\.com/);
    expect(() => normalizeWorkday(foreign, shn)).toThrow(/JR106932/);
  });

  it('accepts the real fixture hosts, which match their registry hosts', () => {
    expect(() => normalizeWorkday(shnDetail, shn)).not.toThrow();
    expect(() => normalizeWorkday(cheoDetail, cheo)).not.toThrow();
    expect(() => normalizeWorkday(oakvalleyDetail, oakvalley)).not.toThrow();
  });
});

describe('stripDescriptionHeader', () => {
  it('drops the SHN metadata block up to the first HTML tag', () => {
    const stripped = stripDescriptionHeader(shnDetail.jobPostingInfo.jobDescription);
    expect(stripped).not.toContain('Job Number:');
    expect(stripped).not.toContain('Union: CUPE');
    expect(stripped.startsWith('<br />')).toBe(true);
  });

  it('leaves the CHEO description byte-identical (no header block)', () => {
    const raw = cheoDetail.jobPostingInfo.jobDescription;
    expect(stripDescriptionHeader(raw)).toBe(raw);
  });

  it('leaves the Oak Valley description byte-identical (no header block)', () => {
    const raw = oakvalleyDetail.jobPostingInfo.jobDescription;
    expect(stripDescriptionHeader(raw)).toBe(raw);
  });

  it('does not strip prose that merely starts with a capitalized word and a colon', () => {
    expect(stripDescriptionHeader('<p>Note: this is body prose.</p>')).toBe('<p>Note: this is body prose.</p>');
  });

  it('does not strip unwrapped prose opening with a "Key: value" shape', () => {
    // A shape-based `^[A-Z][A-Za-z /-]{0,40}:\s` detector matches this and would truncate
    // everything before the first "<", losing the opening sentence. Only a real `Job Number:`
    // block is a header.
    const raw = 'Position Summary: We are hiring an RPN. <p>Full details below.</p>';
    expect(stripDescriptionHeader(raw)).toBe(raw);
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

  it('parses the real SHN fixture header exactly, without over-capturing the body', () => {
    const fields = parseDescriptionHeader(shnDetail.jobPostingInfo.jobDescription);
    expect(fields).toEqual({
      union: 'CUPE',
      salaryMin: 35.753,
      salaryMax: 39.019,
      salaryPeriod: 'hour',
      employmentType: 'temporary',
      shiftType: undefined,
    });
  });

  it('returns {} for CHEO and Oak Valley, which have no header block', () => {
    expect(parseDescriptionHeader(cheoDetail.jobPostingInfo.jobDescription)).toEqual({});
    expect(parseDescriptionHeader(oakvalleyDetail.jobPostingInfo.jobDescription)).toEqual({});
  });

  // The header block's LAST line is unterminated in the real SHN fixture: it butts straight up
  // against the HTML body (`Hours: All Shifts<br />`) with no `&amp;#xa;` delimiter and no
  // trailing newline. Every test below puts the line under test in that position, because a
  // header line sitting mid-block (terminated by a newline) matches even with a broken end
  // anchor, and so proves nothing.
  const unterminated = (lastLine: string) =>
    ['Job Number: JR1', lastLine].join('&amp;#xa;') + '<br /><p>Day surgery unit, nights available.</p>';

  it('does not classify weekday names in the Hours line as shiftType "day", and still matches that line when it is unterminated', () => {
    // Weekday names must not be read as a day shift...
    expect(parseDescriptionHeader(unterminated('Hours: Sunday to Thursday, 2300-0700')).shiftType).toBeUndefined();
    // ...but the same unterminated line must still match, so the `undefined` above means "no
    // shift branch matched", not "the Hours regex failed to match at all". Without this second
    // assertion the test passes even when `shiftType` is entirely unreachable.
    expect(parseDescriptionHeader(unterminated('Hours: Days')).shiftType).toBe('day');
    // The body prose after `<br />` contains both "Day" and "nights"; neither may be captured.
  });

  it('extracts shiftType from an unterminated last Hours line', () => {
    expect(parseDescriptionHeader(unterminated('Hours: Nights')).shiftType).toBe('night');
  });

  it('extracts union from an unterminated last Union line, trimmed', () => {
    expect(parseDescriptionHeader(unterminated('Union: ONA  ')).union).toBe('ONA');
  });

  it('extracts employmentType from an unterminated last Job Type line', () => {
    expect(parseDescriptionHeader(unterminated('Job Type: Casual  ')).employmentType).toBe('casual');
  });
});

describe('parseDescriptionHeader salary anchoring', () => {
  // Regression: the salary pattern was the only one of the four not anchored to a line
  // start, so a rate quoted anywhere in the BODY was attributed to the job. A posting
  // whose header carried no rate picked up $99-$199 from surrounding prose.
  it('ignores a rate that appears only in the body prose', () => {
    const bodyOnly =
      'Job Number: JR1&amp;#xa;Union: CUPE&amp;#xa;Hours: Days<br /><p>Other postings: Minimum - Maximum Hourly Rate: $99.00 - $199.00</p>';
    const fields = parseDescriptionHeader(bodyOnly);
    expect(fields.salaryMin).toBeUndefined();
    expect(fields.salaryMax).toBeUndefined();
    expect(fields.salaryPeriod).toBeUndefined();
    // The header fields it SHOULD find are still found, so this is not passing vacuously.
    expect(fields.union).toBe('CUPE');
    expect(fields.shiftType).toBe('day');
  });

  it('still reads the rate from a real header line', () => {
    const fields = parseDescriptionHeader(shnDetail.jobPostingInfo.jobDescription);
    expect(fields.salaryMin).toBe(35.753);
    expect(fields.salaryMax).toBe(39.019);
    expect(fields.salaryPeriod).toBe('hour');
  });
});

const extendicare: WorkdayEmployer = {
  slug: 'extendicare',
  name: 'Extendicare',
  province: 'ON',
  defaultCity: 'Markham',
  config: {
    tenant: 'extendicare',
    site: 'Extendicare2023',
    host: 'extendicare.wd10.myworkdayjobs.com',
    parseDescriptionHeader: false,
    key: 'extendicare',
    locationFromPosting: true,
    locationAliases: { 'LTC - Athabasca (53rd St.)': 'Athabasca, AB' },
  },
};

const paramed: WorkdayEmployer = {
  ...extendicare,
  slug: 'paramed',
  name: 'ParaMed',
  config: { ...extendicare.config, site: 'Paramed2023', key: 'paramed', locationAliases: {} },
};

describe('normalizeWorkday — employers that read location from the posting', () => {
  it('reads a trailing town and province', () => {
    // "ParaMed - Windsor, Ontario"
    expect(normalizeWorkday(paramedDetail, paramed)).toMatchObject({
      sourceId: 'workday:paramed',
      sourceJobId: 'R36395',
      city: 'Windsor',
      province: 'ON',
      employerName: 'ParaMed',
    });
  });

  it('reads the town from the last line of a street address', () => {
    // "LTC - York (York St.) 333 York Street \nSudbury, ON"
    expect(normalizeWorkday(extendicareStreetDetail, extendicare)).toMatchObject({ city: 'Sudbury', province: 'ON' });
  });

  it('resolves a bare home name through the alias map, into another province', () => {
    expect(normalizeWorkday(extendicareAliasDetail, extendicare)).toMatchObject({
      sourceId: 'workday:extendicare',
      city: 'Athabasca',
      province: 'AB',
    });
  });

  it('refuses a posting it cannot place rather than filing it under the default', () => {
    expect(() => normalizeWorkday(extendicareAliasDetail, { ...extendicare, config: { ...extendicare.config, locationAliases: {} } }))
      .toThrow(/No town in Workday location "LTC - Athabasca \(53rd St\.\)".*locationAliases/);
  });
});

describe('resolveWorkdayLocation', () => {
  it('handles each shape the Extendicare tenant writes', () => {
    expect(resolveWorkdayLocation('LTC - Viking - 5020 - 57th Ave, P.O. Box 430, Viking, Alberta'))
      .toEqual({ city: 'Viking', province: 'AB' });
    expect(resolveWorkdayLocation('LTC - Medex (Baseline Rd.) 1865 Baseline Road \nOttawa , ON'))
      .toEqual({ city: 'Ottawa', province: 'ON' });
    expect(resolveWorkdayLocation('ParaMed - Lindsay, Ontario (Kent St Job Posting)'))
      .toEqual({ city: 'Lindsay', province: 'ON' });
    expect(resolveWorkdayLocation('ParaMed  - Niagara-on-the-Lake, Ontario'))
      .toEqual({ city: 'Niagara-on-the-Lake', province: 'ON' });
  });

  it('refuses a street address, a bare name and a multi-site count', () => {
    expect(resolveWorkdayLocation('LTC - Guildwood Villa (Guildwood Pkwy.) 60 Guildwood Parkway Scarborough, ON')).toBeNull();
    expect(resolveWorkdayLocation('Beacon Hill Lodge')).toBeNull();
    expect(resolveWorkdayLocation('3 Locations')).toBeNull();
  });

  it('matches an alias whatever the whitespace, and lets an alias fix a misspelt town', () => {
    const aliases = { 'Klienburg, Ontario': 'Kleinburg, ON', 'Beacon Hill Lodge': 'Winnipeg, MB' };
    expect(resolveWorkdayLocation('Klienburg,  Ontario', aliases)).toEqual({ city: 'Kleinburg', province: 'ON' });
    expect(resolveWorkdayLocation(' Beacon Hill\nLodge ', aliases)).toEqual({ city: 'Winnipeg', province: 'MB' });
  });
});

describe('postedAtFromPostedOn', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const daysAgo = (d: Date | undefined) => d && Math.round((now.getTime() - d.getTime()) / 86_400_000);

  it('reads every phrasing Workday uses', () => {
    expect(daysAgo(postedAtFromPostedOn('Posted Today', now))).toBe(0);
    expect(daysAgo(postedAtFromPostedOn('Posted Yesterday', now))).toBe(1);
    expect(daysAgo(postedAtFromPostedOn('Posted 8 Days Ago', now))).toBe(8);
    expect(postedAtFromPostedOn(undefined, now)).toBeUndefined();
  });

  it('puts "30+ Days Ago" past the ingest cutoff, so it is skipped without a fetch', () => {
    expect(isTooOld(postedAtFromPostedOn('Posted 30+ Days Ago', now)!, now)).toBe(true);
    expect(isTooOld(postedAtFromPostedOn('Posted 29 Days Ago', now)!, now)).toBe(false);
  });

  it('dates the stubs of a real list page', () => {
    const { stubs } = parseWorkdayList(extendicareList, now);
    expect(stubs.length).toBe(20);
    expect(stubs.every((s) => s.postedAt instanceof Date)).toBe(true);
  });
});

describe('nextWorkdayPage', () => {
  const page = (from: number, n = 20) =>
    Array.from({ length: n }, (_, i) => ({ sourceJobId: `JR${from + i}`, externalPath: '/job/x', title: '', locationsText: '' }));

  it('stops when the list wraps back to its first page', () => {
    // SHN: 120 postings, total 0 after page one, and page one again past the end.
    const state: WorkdayCrawlState = { seen: new Set() };
    expect(nextWorkdayPage(state, 0, 0, page(0)).nextOffset).toBe(20);
    expect(nextWorkdayPage(state, 20, 0, page(20)).nextOffset).toBe(40);
    const wrapped = nextWorkdayPage(state, 40, 0, page(0));
    expect(wrapped.fresh).toEqual([]);
    expect(wrapped.nextOffset).toBeUndefined();
  });

  it('stops at the first page’s total and ignores the 0 later pages report', () => {
    const state: WorkdayCrawlState = { seen: new Set() };
    expect(nextWorkdayPage(state, 0, 60, page(0)).nextOffset).toBe(20);
    expect(nextWorkdayPage(state, 20, 0, page(20)).nextOffset).toBe(40);
    expect(nextWorkdayPage(state, 40, 0, page(40)).nextOffset).toBeUndefined();
  });

  it('still stops on a short page', () => {
    const state: WorkdayCrawlState = { seen: new Set() };
    expect(nextWorkdayPage(state, 0, 0, page(0, 7)).nextOffset).toBeUndefined();
  });

  it('passes on only postings not already seen in this crawl', () => {
    const state: WorkdayCrawlState = { seen: new Set() };
    nextWorkdayPage(state, 0, 0, page(0));
    const { fresh } = nextWorkdayPage(state, 20, 0, [...page(15, 5), ...page(20, 15)]);
    expect(fresh.map((s) => s.sourceJobId)).toEqual(page(20, 15).map((s) => s.sourceJobId));
  });
});
