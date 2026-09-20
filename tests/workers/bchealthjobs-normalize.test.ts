import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  extractBcHealthJobsDetail,
  normalizeBcHealthJobs,
  parseBcHealthJobsSitemap,
  parseCardFields,
  parseHourlyWage,
  parseCloseDate,
  displayTitle,
  employmentTypeFromBc,
  resolvePostedAt,
  titleCase,
  type BcHealthJobsEmployer,
} from '@/workers/connectors/bchealthjobs';

const IH_HOST = 'jobs.interiorhealth.ca';
const NH_HOST = 'expectmore.northernhealth.ca';

const fixture = (name: string) => readFileSync(`fixtures/bchealthjobs/${name}`, 'utf8');
const page = (name: string) => fixture(`${name}.html`);

const interior: BcHealthJobsEmployer = {
  slug: 'interior-health',
  name: 'Interior Health',
  province: 'BC',
  defaultCity: 'Kelowna',
  config: { key: 'interior', host: IH_HOST },
};

const northern: BcHealthJobsEmployer = {
  slug: 'northern-health',
  name: 'Northern Health',
  province: 'BC',
  defaultCity: 'Prince George',
  config: { key: 'northern', host: NH_HOST },
};

/** A hydrated record as `hydrate` would have built it, from the real saved page. */
const detail = (name: string, host: string, id: string, lastmod: string) =>
  extractBcHealthJobsDetail(page(name), `https://${host}/ViewJobPosting/${id}`, new Date(lastmod));

const ihJob = () => detail('ih-job', IH_HOST, '2458710', '2026-09-18');
const ihWage = () => detail('ih-job-wage', IH_HOST, '2445337', '2026-09-04');
const nhJob = () => detail('nh-job', NH_HOST, '5751423', '2026-06-17');

describe('parseBcHealthJobsSitemap', () => {
  const stubs = parseBcHealthJobsSitemap(fixture('ih-sitemap.xml'), IH_HOST);

  it('reads every job URL with its last-modified date', () => {
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.sourceJobId).toMatch(/^\d+$/);
      expect(stub.externalPath).toBe(`/ViewJobPosting/${stub.sourceJobId}`);
      expect(stub.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(stub.postedAt!.getTime())).toBe(false);
    }
  });

  it('skips the sign-in, search and home URLs the sitemap also lists', () => {
    // The sitemap carries /Home, /JobSearch and /SignIn alongside the postings. Only
    // /ViewJobPosting/{id} is a job.
    expect(stubs.every((s) => /^\/ViewJobPosting\/\d+$/.test(s.externalPath))).toBe(true);
  });

  it('carries the date the runner needs to skip an old posting before fetching it', () => {
    // 83% of this site is older than 30 days, so the cutoff has to be applied from the
    // sitemap rather than after hydration.
    const posting = stubs.find((s) => s.sourceJobId === '2458710');
    expect(posting?.postedAt?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });

  it('reads a pretty-printed sitemap, not only the minified one both hosts serve today', () => {
    // A pattern requiring "</loc><lastmod>" adjacent would return zero stubs here, and the run
    // would report success with nothing fetched rather than failing.
    const pretty = fixture('ih-sitemap.xml').replace(/<\/loc><lastmod>/g, '</loc>\n    <lastmod>');
    expect(parseBcHealthJobsSitemap(pretty, IH_HOST).length).toBe(stubs.length);
  });

  it('rejects a sitemap entry that leaves the registry host', () => {
    const tampered = fixture('ih-sitemap.xml').replace(
      `https://${IH_HOST}/ViewJobPosting/`,
      'https://evil.example/ViewJobPosting/',
    );
    expect(() => parseBcHealthJobsSitemap(tampered, IH_HOST)).toThrow(/not on registry host/);
  });
});

describe('parseCardFields', () => {
  it('reads the labelled card the posting states its details in', () => {
    const fields = parseCardFields(page('ih-job'));
    expect(fields['Competition #']).toBe('02458710');
    expect(fields['Employee Type']).toBe('PERMANENT FULL TIME');
    expect(fields['Facility']).toBe('CASTLEGAR DIST HLTH CTR');
    expect(fields['Location']).toBe('Castlegar');
    expect(fields['Close Date']).toBe('OPEN UNTIL FILLED');
  });

  it('keeps "Share this posting" out, though it wears the same class as a value', () => {
    const fields = parseCardFields(page('ih-job'));
    expect(Object.values(fields)).not.toContain('Share this posting');
  });

  it('resolves HTML entities rather than storing them raw', () => {
    // Northern Health's "Reports To" contains &amp; in the markup. Stripping tags with a
    // regex instead of parsing would store the entity — the defect this project shipped once
    // already, on Manitoba job titles.
    const fields = parseCardFields(page('nh-job'));
    expect(fields['Reports To']).toContain('MENTAL HEALTH & SUBSTANCE USE');
    expect(fields['Reports To']).not.toContain('&amp;');
  });
});

describe('normalizeBcHealthJobs', () => {
  it('maps an Interior Health posting', () => {
    const posting = normalizeBcHealthJobs(ihJob(), interior);
    expect(posting.sourceId).toBe('bchealthjobs:interior');
    expect(posting.sourceJobId).toBe('2458710');
    expect(posting.title).toBe('Administrative Assistant | Community Care Administration');
    expect(posting.employerName).toBe('Interior Health');
    expect(posting.city).toBe('Castlegar');
    expect(posting.province).toBe('BC');
    expect(posting.employmentType).toBe('full_time');
    expect(posting.applyUrl).toBe(`https://${IH_HOST}/ViewJobPosting/2458710`);
  });

  it('stops the facility shouting without inventing words for its abbreviations', () => {
    expect(normalizeBcHealthJobs(ihJob(), interior).facilityName).toBe('Castlegar Dist Hlth Ctr');
  });

  it('strips the province Northern Health appends to its city, Interior Health having none', () => {
    // "Prince George, BC" against Interior Health's plain "Castlegar". Left alone it would
    // file a city named "Prince George, BC".
    expect(normalizeBcHealthJobs(nhJob(), northern).city).toBe('Prince George');
    expect(normalizeBcHealthJobs(ihJob(), interior).city).toBe('Castlegar');
  });

  it('strips it from the card fallback too, jobLocation being optional', () => {
    // With no JSON-LD location the city comes from the "Location" card field, which carries
    // the same ", BC" suffix on every Northern Health posting.
    const raw = nhJob();
    const noLocation = { ...raw, posting: { ...raw.posting, jobLocation: undefined } };
    expect(normalizeBcHealthJobs(noLocation, northern).city).toBe('Prince George');
  });

  it('falls back to the JSON-LD employment type when the card states a blank one', () => {
    const raw = ihJob();
    const blank = { ...raw, fields: { ...raw.fields, 'Employee Type': '' } };
    expect(normalizeBcHealthJobs(blank, interior).employmentType).toBe('full_time');
  });

  it('reads a relief posting as casual, and its wage and closing date', () => {
    const posting = normalizeBcHealthJobs(ihWage(), interior);
    expect(posting.employmentType).toBe('casual');
    expect(posting.salaryMin).toBe(27.26);
    expect(posting.salaryMax).toBe(29.16);
    expect(posting.salaryPeriod).toBe('hour');
    expect(posting.closesAt?.getFullYear()).toBe(2026);
    expect(posting.closesAt?.getMonth()).toBe(8); // September
  });

  it('sets no closing date for a posting open until filled', () => {
    expect(normalizeBcHealthJobs(ihJob(), interior).closesAt).toBeUndefined();
  });

  it('quotes no pay when the posting states none', () => {
    const posting = normalizeBcHealthJobs(ihJob(), interior);
    expect(posting.salaryMin).toBeUndefined();
    expect(posting.salaryMax).toBeUndefined();
  });

  it('states no shift rather than guessing one this site never publishes', () => {
    expect(normalizeBcHealthJobs(ihJob(), interior).shiftType).toBeUndefined();
    expect(normalizeBcHealthJobs(nhJob(), northern).shiftType).toBeUndefined();
  });

  it('encodes the description as HTML and the title as plain text', () => {
    // These two are rendered differently and so must be escaped differently. The description
    // goes through dangerouslySetInnerHTML, where "&amp;" is the correct encoding of a literal
    // ampersand and displays as "&". The title is rendered as text, where an entity would be
    // shown to the applicant verbatim — which is exactly what shipped on Manitoba once.
    const description = normalizeBcHealthJobs(ihJob(), interior).description;
    expect(description).toContain('Health &amp; Dental');
    expect(description).toContain('Métis'); // &#233; resolved
    expect(description).not.toMatch(/&amp;(amp|#)/); // never double-encoded

    const title = normalizeBcHealthJobs(nhJob(), northern).title;
    expect(title).toContain('Mental Health & Substance Use');
    expect(title).not.toContain('&amp;');
  });

  it('maps every saved fixture without throwing', () => {
    const cases = [
      [ihJob(), interior],
      [ihWage(), interior],
      [nhJob(), northern],
    ] as const;
    for (const [raw, employer] of cases) {
      const posting = normalizeBcHealthJobs(raw, employer);
      expect(posting.title.length).toBeGreaterThan(0);
      expect(posting.province).toBe('BC');
      expect(posting.city.length).toBeGreaterThan(0);
      expect(posting.description.length).toBeGreaterThan(50);
      expect(posting.description).not.toMatch(/<(script|style)\b/);
      expect(posting.description).not.toMatch(/&amp;(amp|lt|gt|#)/);
      expect(posting.title).not.toMatch(/&\w+;|&#\d+;/);
      expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    }
  });

  it('refuses a posting whose URL points off the registry host', () => {
    const raw = { ...ihJob(), url: 'https://evil.example/ViewJobPosting/2458710' };
    expect(() => normalizeBcHealthJobs(raw, interior)).toThrow(/not on registry host/);
  });

  it('throws rather than inventing a posting from a page with no JSON-LD', () => {
    expect(() => extractBcHealthJobsDetail('<html><body>nothing</body></html>', `https://${IH_HOST}/ViewJobPosting/1`, new Date()))
      .toThrow(/no JSON-LD posting/);
  });
});

describe('resolvePostedAt', () => {
  it('reads the posting’s own unpadded date as the calendar day it names', () => {
    // "2026-9-18" is not ISO 8601. Handed to `new Date` it is parsed in local time, which
    // west of UTC lands on the 17th.
    const posted = resolvePostedAt(ihJob());
    expect(posted.toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });

  it('falls back to the sitemap date when the posting states none it can read', () => {
    const raw = { ...ihJob(), posting: { ...ihJob().posting, datePosted: 'not a date' } };
    expect(resolvePostedAt(raw).toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });

  it('agrees with the sitemap, which is what lets the cutoff run before hydration', () => {
    // Sampled 10 postings across 3.5 years: lastmod equalled datePosted on all of them.
    for (const [raw, lastmod] of [[ihJob(), '2026-09-18'], [ihWage(), '2026-09-04']] as const) {
      expect(resolvePostedAt(raw).toISOString().slice(0, 10)).toBe(lastmod);
    }
  });
});

describe('employmentTypeFromBc', () => {
  it('lets the engagement outrank the hours beside it', () => {
    expect(employmentTypeFromBc('RELIEF FULL TIME')).toBe('casual');
    expect(employmentTypeFromBc('TERM SPECIFIC FULL TIME')).toBe('temporary');
    expect(employmentTypeFromBc('CASUAL')).toBe('casual');
  });

  it('reads plain permanent postings from their hours', () => {
    expect(employmentTypeFromBc('PERMANENT FULL TIME')).toBe('full_time');
    expect(employmentTypeFromBc('PERMANENT PART TIME (0.50 FTE)')).toBe('part_time');
  });

  it('says nothing when the posting does not', () => {
    expect(employmentTypeFromBc(undefined)).toBeUndefined();
    expect(employmentTypeFromBc('')).toBeUndefined();
  });
});

describe('parseHourlyWage', () => {
  it('reads a rate range', () => {
    expect(parseHourlyWage('$27.26 - $29.16'))
      .toEqual({ salaryMin: 27.26, salaryMax: 29.16, salaryPeriod: 'hour' });
  });

  it('quotes nothing when the posting states no rate', () => {
    expect(parseHourlyWage(undefined)).toEqual({});
    expect(parseHourlyWage('As per collective agreement')).toEqual({});
  });

  it('does not quote an annual figure as an hourly one', () => {
    expect(parseHourlyWage('$78,000 - $92,500'))
      .toEqual({ salaryMin: 78000, salaryMax: 92500, salaryPeriod: 'year' });
  });
});

describe('parseCloseDate', () => {
  it('closes at the end of the stated day, never the start of it', () => {
    // closesAt becomes expires_at. Local midnight would take the posting off the site at the
    // very beginning of the day it actually closes, costing a full day of applicants.
    expect(parseCloseDate('SEPTEMBER 20, 2026')?.toISOString()).toBe('2026-09-21T07:59:59.000Z');
  });

  it('sets no date for the majority that stay open until filled', () => {
    expect(parseCloseDate('OPEN UNTIL FILLED')).toBeUndefined();
    expect(parseCloseDate(undefined)).toBeUndefined();
  });

  it('sets no date rather than a wrong one for a format it does not know', () => {
    expect(parseCloseDate('SOMEDAY SOON')).toBeUndefined();
    expect(parseCloseDate('20-09-2026')).toBeUndefined();
  });
});

describe('displayTitle', () => {
  it('stops Northern Health shouting while leaving Interior Health alone', () => {
    expect(displayTitle('REGISTERED NURSE (RN), MED SURG')).toBe('Registered Nurse (RN), Med Surg');
    const interiorStyle = 'Administrative Assistant | Community Care Administration';
    expect(displayTitle(interiorStyle)).toBe(interiorStyle);
  });

  it('keeps clinical acronyms and grade numerals uppercase', () => {
    expect(displayTitle('ACTIVITY WORKER II')).toBe('Activity Worker II');
    expect(displayTitle('LPN, ICU AND OR')).toBe('LPN, ICU and OR');
    expect(displayTitle('MRI TECHNOLOGIST')).toBe('MRI Technologist');
  });

  it('applies to the stored title, so the two authorities read alike', () => {
    expect(normalizeBcHealthJobs(nhJob(), northern).title)
      .toBe('Administrative Assistant, Mental Health & Substance Use and Child & Youth Health');
  });
});

describe('titleCase', () => {
  it('keeps an apostrophe inside the word', () => {
    expect(titleCase("ST. PAUL'S HOSPITAL")).toBe("St. Paul's Hospital");
  });

  it('leaves the employer’s own abbreviations alone', () => {
    expect(titleCase('CASTLEGAR DIST HLTH CTR')).toBe('Castlegar Dist Hlth Ctr');
  });

  it('keeps joining words lowercase and the province code upper', () => {
    // The most common facility of the two authorities, 23 jobs. "Hospital Of N. Bc" was what
    // plain title case made of it.
    expect(titleCase('UNIV. HOSPITAL OF N. BC', 'BC')).toBe('Univ. Hospital of N. BC');
  });

  it('still capitalises a joining word when it opens the name', () => {
    expect(titleCase('THE PAS HEALTH COMPLEX', 'MB')).toBe('The Pas Health Complex');
  });

  it('leaves the province code alone when it is not that employer’s province', () => {
    expect(titleCase('HOSPITAL OF N. BC', 'MB')).toBe('Hospital of N. Bc');
  });
});

describe('placeholder facilities', () => {
  it('reports no facility where the site says the role has no fixed site', () => {
    // "Flexible" is on 8 postings. Shown on a card as the facility it would read as a place.
    const raw = ihJob();
    const flexible = { ...raw, fields: { ...raw.fields, Facility: 'FLEXIBLE' } };
    expect(normalizeBcHealthJobs(flexible, interior).facilityName).toBeUndefined();

    const real = { ...raw, fields: { ...raw.fields, Facility: 'KELOWNA GENERAL HOSPITAL' } };
    expect(normalizeBcHealthJobs(real, interior).facilityName).toBe('Kelowna General Hospital');
  });
});
