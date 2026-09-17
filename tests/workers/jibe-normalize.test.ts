import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  normalizeJibe,
  parseSalaryFromDescription,
  employmentTypeFromJibe,
  resolveCity,
  type JibeEmployer,
  type JibeJob,
} from '@/workers/connectors/jibe';

const list = JSON.parse(readFileSync('fixtures/jibe/fraserhealth-list.json', 'utf8')) as {
  jobs: { data: JibeJob }[];
};

const fraser: JibeEmployer = {
  slug: 'fraser-health',
  name: 'Fraser Health',
  province: 'BC',
  defaultCity: 'Surrey',
  config: {
    key: 'fraserhealth',
    host: 'jobs.fraserhealth.ca',
    cityAliases: {
      'Tri-Cities / Coquitlam / Port Coquitlam / Port Moody': 'Coquitlam',
      'Maple Ridge / Pitt Meadows': 'Maple Ridge',
    },
  },
};

const job = (index: number) => list.jobs[index].data;

describe('normalizeJibe', () => {
  it('maps a posting from the board’s own list response', () => {
    const posting = normalizeJibe(job(0), fraser);
    expect(posting.sourceId).toBe('jibe:fraserhealth');
    expect(posting.employerName).toBe('Fraser Health');
    expect(posting.province).toBe('BC');
    expect(posting.city).toBe('Surrey');
    expect(posting.title.length).toBeGreaterThan(0);
    expect(posting.description).not.toMatch(/<(script|div|span)\b/);
    expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
  });

  it('sends applicants to the public posting, not the iCIMS login page', () => {
    const posting = normalizeJibe(job(0), fraser);
    expect(posting.applyUrl).toMatch(/^https:\/\/jobs\.fraserhealth\.ca\/jobs\//);
    expect(posting.applyUrl).not.toContain('icims');
  });

  it('drops a location that lists communities rather than naming a facility', () => {
    const grouped = list.jobs.map((j) => j.data).find((d) => d.location_name.includes('/'));
    expect(grouped).toBeDefined();
    expect(normalizeJibe(grouped!, fraser).facilityName).toBeUndefined();
  });

  it('resolves a grouped location name to one city', () => {
    const grouped = list.jobs.map((j) => j.data).find((d) => d.city.includes('Tri-Cities'));
    expect(grouped).toBeDefined();
    expect(normalizeJibe(grouped!, fraser).city).toBe('Coquitlam');
  });

  it('throws on an unparseable posted date rather than inventing one', () => {
    expect(() => normalizeJibe({ ...job(0), posted_date: 'whenever' }, fraser)).toThrow(/Unparseable/);
  });
});

describe('parseSalaryFromDescription', () => {
  it('reads the rate the board states in prose, since its salary fields are zeroed', () => {
    expect(parseSalaryFromDescription('The salary range for this position is CAD $41.42 - $59.52 / hour'))
      .toEqual({ salaryMin: 41.42, salaryMax: 59.52, salaryPeriod: 'hour' });
    expect(parseSalaryFromDescription('The salary range for this position is CAD $32.84 - $32.84 / hour'))
      .toEqual({ salaryMin: 32.84, salaryMax: 32.84, salaryPeriod: 'hour' });
  });

  it('returns nothing when no rate is stated', () => {
    expect(parseSalaryFromDescription('<p>Come work with us.</p>')).toEqual({});
  });

  it('every fixture posting either states a rate or gets none', () => {
    for (const { data } of list.jobs) {
      const salary = parseSalaryFromDescription(data.description);
      if (salary.salaryMin !== undefined) {
        expect(salary.salaryMax).toBeGreaterThanOrEqual(salary.salaryMin);
        expect(salary.salaryPeriod).toBe('hour');
      }
    }
  });
});

describe('employmentTypeFromJibe', () => {
  const base = job(0);
  const withTag = (tag: string) => employmentTypeFromJibe({ ...base, tags1: [tag] });

  it('uses the employer’s own wording', () => {
    expect(withTag('Full Time')).toBe('full_time');
    expect(withTag('Part Time')).toBe('part_time');
    expect(withTag('Casual')).toBe('casual');
    expect(withTag('Relief Full Time')).toBe('temporary');
    expect(withTag('Temp Part Time')).toBe('temporary');
  });

  it('claims nothing for a posting open to several arrangements', () => {
    expect(withTag('Full Time / Part Time / Locum / Temp')).toBeUndefined();
  });

  it('falls back to the board’s employment_type when untagged', () => {
    expect(employmentTypeFromJibe({ ...base, tags1: [], employment_type: 'PART_TIME' })).toBe('part_time');
    expect(employmentTypeFromJibe({ ...base, tags1: [], employment_type: 'OTHER_EMPLOYMENT_TYPE' })).toBeUndefined();
  });
});

describe('resolveCity', () => {
  it('falls back to the registry city when the board names the employer instead', () => {
    expect(resolveCity('Fraser Health', fraser)).toBe('Surrey');
    expect(resolveCity('', fraser)).toBe('Surrey');
  });

  it('takes the first segment of an unmapped grouped name', () => {
    expect(resolveCity('Bella Bella / Bella Coola', fraser)).toBe('Bella Bella');
  });
});
