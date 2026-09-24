import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  parseJobList,
  parseCreated,
  parseCampaignEnd,
  employmentTypeFromStatus,
  salaryFrom,
  extractDescription,
  normalizeTalentPoolBuilder,
  type TalentPoolBuilderEmployer,
  type TalentPoolBuilderJob,
} from '@/workers/connectors/talentpoolbuilder';

const HOST = 'wrh.talentpoolbuilder.com';
const list = () => JSON.parse(readFileSync('fixtures/talentpoolbuilder/wrh-jobs-list.json', 'utf8'));
const page = () => readFileSync('fixtures/talentpoolbuilder/wrh-job.html', 'utf8');

const wrh: TalentPoolBuilderEmployer = {
  slug: 'windsor-regional-hospital',
  name: 'Windsor Regional Hospital',
  province: 'ON',
  defaultCity: 'Windsor',
  config: { key: 'wrh', host: HOST, cpId: '369', brands: '114', type: 'Public' },
};

const detail = (job: TalentPoolBuilderJob) => ({
  job,
  url: `https://${HOST}/job/${job.campaign_id}`,
  descriptionHtml: extractDescription(page()),
});

describe('parseJobList', () => {
  const { stubs, jobs } = parseJobList(list(), HOST);

  it('reads the postings with their dates and detail paths', () => {
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.externalPath).toBe(`/job/${stub.sourceJobId}`);
      expect(stub.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(stub.postedAt!.getTime())).toBe(false);
      expect(stub.title.length).toBeGreaterThan(0);
    }
  });

  it('drops a filled posting the board still returns', () => {
    // The API answers with both "Hiring" and "Hired"; a "Hired" post is filled, and listing
    // one would send an applicant at a job that no longer exists. The fixture holds one.
    const raw = list();
    expect(raw.jobs.some((j: TalentPoolBuilderJob) => j.status === 'Hired')).toBe(true);
    expect(stubs).toHaveLength(raw.jobs.filter((j: TalentPoolBuilderJob) => j.status === 'Hiring').length);
    for (const job of jobs.values()) expect(job.status).toBe('Hiring');
  });

  it('accepts the empty success the API returns for a wrong request', () => {
    // A JSON body, or a missing `brands`, is answered with result:true and no jobs rather
    // than an error — it must parse cleanly and yield nothing, not throw.
    expect(parseJobList({ result: true, jobs: [] }, HOST).stubs).toEqual([]);
  });
});

describe('parseCreated', () => {
  it('reads the space-separated stamp as UTC', () => {
    // "2026-09-21 16:41:44" is not ISO 8601. Left to `new Date`, the runner's own timezone
    // would decide the calendar day.
    expect(parseCreated('2026-09-21 16:41:44')?.toISOString()).toBe('2026-09-21T16:41:44.000Z');
  });

  it('returns nothing for a stamp it cannot read', () => {
    expect(parseCreated('yesterday')).toBeUndefined();
    expect(parseCreated('')).toBeUndefined();
  });
});

describe('parseCampaignEnd', () => {
  it('reads the closing date as the end of that day', () => {
    const closes = parseCampaignEnd('Oct 22, 2026');
    expect(closes?.toISOString().slice(0, 10)).toBe('2026-10-22');
    expect(closes!.getUTCHours()).toBe(23);
  });

  it('sets no date when the posting has no closing date', () => {
    expect(parseCampaignEnd(null)).toBeUndefined();
    expect(parseCampaignEnd(undefined)).toBeUndefined();
  });
});

describe('employmentTypeFromStatus', () => {
  it('lets a temporary post outrank the hours beside it', () => {
    expect(employmentTypeFromStatus('Temporary Part-Time')).toBe('temporary');
    expect(employmentTypeFromStatus('Temporary Full-time')).toBe('temporary');
    expect(employmentTypeFromStatus('Temporary Casual')).toBe('casual');
  });

  it('reads the plain statuses', () => {
    expect(employmentTypeFromStatus('Full-time')).toBe('full_time');
    expect(employmentTypeFromStatus('Part-time')).toBe('part_time');
    expect(employmentTypeFromStatus('Casual')).toBe('casual');
    // Providence Care's word for a reduced-hours post.
    expect(employmentTypeFromStatus('Pro-rated')).toBe('part_time');
  });

  it('says nothing when the board does not', () => {
    expect(employmentTypeFromStatus(null)).toBeUndefined();
  });
});

describe('salaryFrom', () => {
  const job = (over: Partial<TalentPoolBuilderJob>) => ({ ...list().jobs[0], ...over } as TalentPoolBuilderJob);

  it('takes the period the board states rather than guessing from magnitude', () => {
    expect(salaryFrom(job({ wage_from: 104929, wage_to: 141963, wage_type: 'Annually' })))
      .toEqual({ salaryMin: 104929, salaryMax: 141963, salaryPeriod: 'year' });
    expect(salaryFrom(job({ wage_from: 28.5, wage_to: 35.9, wage_type: 'Hourly' })))
      .toEqual({ salaryMin: 28.5, salaryMax: 35.9, salaryPeriod: 'hour' });
  });

  it('quotes nothing when the period is missing or the range is nonsense', () => {
    expect(salaryFrom(job({ wage_from: 20, wage_to: 30, wage_type: null }))).toEqual({});
    expect(salaryFrom(job({ wage_from: 50, wage_to: 10, wage_type: 'Hourly' }))).toEqual({});
    expect(salaryFrom(job({ wage_from: null, wage_to: null, wage_type: 'Hourly' }))).toEqual({});
  });
});

describe('extractDescription', () => {
  it('reads the description the page renders', () => {
    const html = extractDescription(page());
    expect(html.length).toBeGreaterThan(200);
    expect(html.toLowerCase()).toMatch(/qualification|responsibilit|summary/);
  });

  it('throws rather than storing an empty description', () => {
    expect(() => extractDescription('<html><body><p>nothing</p></body></html>'))
      .toThrow(/no description/);
  });
});

describe('normalizeTalentPoolBuilder', () => {
  const hiring = () => (list().jobs as TalentPoolBuilderJob[]).filter((j) => j.status === 'Hiring');

  it('maps a posting', () => {
    const job = hiring()[0];
    const posting = normalizeTalentPoolBuilder(detail(job), wrh);
    expect(posting.sourceId).toBe('talentpoolbuilder:wrh');
    expect(posting.sourceJobId).toBe(String(job.campaign_id));
    expect(posting.employerName).toBe('Windsor Regional Hospital');
    expect(posting.province).toBe('ON');
    expect(posting.city.length).toBeGreaterThan(0);
    expect(posting.applyUrl).toBe(`https://${HOST}/job/${job.campaign_id}`);
  });

  it('maps every posting in the fixture without throwing', () => {
    for (const job of hiring()) {
      const posting = normalizeTalentPoolBuilder(detail(job), wrh);
      expect(posting.title.length).toBeGreaterThan(0);
      expect(posting.description).not.toMatch(/<(script|style)\b/);
      expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    }
  });

  it('uses the brand as the facility, not the department', () => {
    // brand_name is the site a multi-site tenant posts under; department_name is a
    // programme ("Cancer Clinic"), which is not a place.
    const job = { ...hiring()[0], brand_name: 'Providence Care Centre', department_name: 'Cancer Clinic' };
    expect(normalizeTalentPoolBuilder(detail(job), wrh).facilityName).toBe('Providence Care Centre');
  });

  it('falls back to the registry city when the posting names none', () => {
    const job = { ...hiring()[0], city: null };
    expect(normalizeTalentPoolBuilder(detail(job), wrh).city).toBe('Windsor');
  });

  it('refuses a posting whose URL leaves the registry host', () => {
    const raw = { ...detail(hiring()[0]), url: 'https://evil.example/job/1' };
    expect(() => normalizeTalentPoolBuilder(raw, wrh)).toThrow(/not on registry host/);
  });
});
