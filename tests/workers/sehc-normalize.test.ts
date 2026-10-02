import { readFileSync } from 'node:fs';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  createSeHealthConnector,
  extractSeHealthDetail,
  normalizeSeHealth,
  parseSeHealthDate,
  parseSeHealthList,
  postedAtFromAge,
  splitLocation,
  type SeHealthEmployer,
} from '@/workers/connectors/sehc';

const HOST = 'careers.sehc.com';
const fixture = (name: string) => readFileSync(`fixtures/sehc/${name}`, 'utf8');

const seHealth: SeHealthEmployer = {
  slug: 'se-health',
  name: 'SE Health',
  province: 'ON',
  defaultCity: 'Markham',
  config: { key: 'sehc', host: HOST },
};

const JOB_PATH = '/current-positions/registered-nurse-(4)';
const detail = () => extractSeHealthDetail(fixture('registered-nurse-4.html'), `https://${HOST}${JOB_PATH}`);

const NOW = new Date('2026-10-02T15:00:00Z');
const DAY_MS = 86_400_000;

describe('parseSeHealthList', () => {
  const stubs = parseSeHealthList(fixture('job-openings-page1.html'), HOST, NOW);

  it('reads one stub per posting, keyed by its URL slug', () => {
    expect(stubs).toHaveLength(10);
    for (const stub of stubs) {
      expect(stub.externalPath).toBe(`/current-positions/${stub.sourceJobId}`);
      expect(stub.title.length).toBeGreaterThan(0);
      expect(stub.locationsText).toMatch(/, [A-Z]{2}$/);
    }
  });

  it('keeps the parentheses and symbols the board puts in a slug', () => {
    expect(stubs[0]).toMatchObject({
      sourceJobId: 'occupational-therapist-new-grad-(1)',
      title: 'Occupational Therapist - New Grad',
      locationsText: 'Niagara Falls, ON',
    });
  });

  it('turns "Posted 1 Day Ago" into a date a day before now', () => {
    expect(stubs[0].postedAt?.getTime()).toBe(NOW.getTime() - DAY_MS);
  });

  it('skips a row that links somewhere other than a posting', () => {
    const html = fixture('job-openings-page1.html').replace("href='/current-positions/occupational-therapist-new-grad-(1)'", "href='/about'");
    // The row has the same link twice (title and View Job); only the title's is replaced, and
    // that is the one the parser reads.
    expect(parseSeHealthList(html, HOST, NOW)).toHaveLength(9);
  });

  it('rejects a row that leaves the registry host', () => {
    const html = fixture('job-openings-page1.html').replace(
      "href='/current-positions/occupational-therapist-new-grad-(1)'",
      "href='https://evil.example/current-positions/x'",
    );
    expect(() => parseSeHealthList(html, HOST, NOW)).toThrow(/not on registry host/);
  });

  it('reads nothing from a page with no rows', () => {
    expect(parseSeHealthList('<html><body>No jobs</body></html>', HOST, NOW)).toEqual([]);
  });
});

describe('postedAtFromAge', () => {
  it('reads hours, days and weeks as the newest date they can mean', () => {
    expect(postedAtFromAge('Posted 5 Hours Ago', NOW)?.getTime()).toBe(NOW.getTime() - 5 * 3_600_000);
    expect(postedAtFromAge('Posted 3 Days Ago', NOW)?.getTime()).toBe(NOW.getTime() - 3 * DAY_MS);
    expect(postedAtFromAge('Posted 3 Weeks Ago', NOW)?.getTime()).toBe(NOW.getTime() - 21 * DAY_MS);
    expect(postedAtFromAge('Posted Today', NOW)?.getTime()).toBe(NOW.getTime());
  });

  it('dates two or more months past the cutoff, so those pages are never fetched', () => {
    expect(postedAtFromAge('Posted 2 Months Ago', NOW)?.getTime()).toBe(NOW.getTime() - 60 * DAY_MS);
    expect(postedAtFromAge('Posted 5 Months Ago', NOW)?.getTime()).toBe(NOW.getTime() - 150 * DAY_MS);
  });

  it('leaves one month unset, because it could be on either side of the cutoff', () => {
    expect(postedAtFromAge('Posted 1 Month Ago', NOW)).toBeUndefined();
    expect(postedAtFromAge('', NOW)).toBeUndefined();
  });
});

describe('extractSeHealthDetail', () => {
  it('reads the JobPosting', () => {
    expect(detail().posting.title).toBe('Registered Nurse');
  });

  it('throws when the page carries no JobPosting', () => {
    expect(() => extractSeHealthDetail('<html></html>', `https://${HOST}${JOB_PATH}`)).toThrow(/no JobPosting/);
  });
});

describe('normalizeSeHealth', () => {
  it('maps a posting', () => {
    const posting = normalizeSeHealth(detail(), seHealth);
    expect(posting).toMatchObject({
      sourceId: 'sehc:sehc',
      sourceJobId: 'registered-nurse-(4)',
      sourceUrl: `https://${HOST}${JOB_PATH}`,
      applyUrl: `https://${HOST}${JOB_PATH}`,
      title: 'Registered Nurse',
      employerName: 'SE Health',
      city: 'Innisfil',
      province: 'ON',
      employmentType: 'full_time',
    });
    expect(posting.description.length).toBeGreaterThan(100);
  });

  it('uses the same job id the list stub does, so a known posting is recognised', () => {
    expect(normalizeSeHealth(detail(), seHealth).sourceJobId).toBe('registered-nurse-(4)');
  });

  it('pins the date to noon UTC, so no zone moves it to another day', () => {
    expect(normalizeSeHealth(detail(), seHealth).postedAt.toISOString()).toBe('2026-08-26T12:00:00.000Z');
  });

  it('takes the province from the posting, not the registry', () => {
    const calgary = structuredClone(detail());
    calgary.posting.jobLocation = { address: { addressLocality: 'Calgary, AB' } };
    expect(normalizeSeHealth(calgary, seHealth)).toMatchObject({ city: 'Calgary', province: 'AB' });
  });

  it('applies the registry city aliases', () => {
    const grouped = structuredClone(detail());
    grouped.posting.jobLocation = { address: { addressLocality: 'Eastern Counties, ON' } };
    const aliased: SeHealthEmployer = {
      ...seHealth,
      config: { ...seHealth.config, cityAliases: { 'Eastern Counties': 'Cornwall' } },
    };
    expect(normalizeSeHealth(grouped, aliased).city).toBe('Cornwall');
  });

  it('falls back to the registry city and province when the posting names neither', () => {
    const bare = structuredClone(detail());
    bare.posting.jobLocation = undefined;
    expect(normalizeSeHealth(bare, seHealth)).toMatchObject({ city: 'Markham', province: 'ON' });
  });

  it('rejects a posting URL that leaves the registry host', () => {
    expect(() => normalizeSeHealth({ ...detail(), url: `https://evil.example${JOB_PATH}` }, seHealth)).toThrow(
      /not on registry host/,
    );
  });
});

describe('parseSeHealthDate', () => {
  it('reads the date and ignores the midnight placeholder', () => {
    expect(parseSeHealthDate('2026-10-01 12:00:00 AM').toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('throws on a value that is not a date', () => {
    expect(() => parseSeHealthDate('last Tuesday')).toThrow(/Unreadable datePosted/);
  });
});

describe('splitLocation', () => {
  it('splits a city from its province', () => {
    expect(splitLocation('Innisfil, ON')).toEqual({ city: 'Innisfil', province: 'ON' });
    expect(splitLocation('Calgary, AB')).toEqual({ city: 'Calgary', province: 'AB' });
  });

  it('drops a city that is just the province, for the registry default to replace', () => {
    expect(splitLocation('Ontario, ON')).toEqual({ city: '', province: 'ON' });
  });

  it('keeps a value with no province whole', () => {
    expect(splitLocation('Innisfil')).toEqual({ city: 'Innisfil' });
    expect(splitLocation('Somewhere, Nowhere')).toEqual({ city: 'Somewhere, Nowhere' });
  });
});

describe('createSeHealthConnector', () => {
  afterEach(() => vi.unstubAllGlobals());

  const page1 = fixture('job-openings-page1.html');
  // A second page: the same markup with different slugs, so its first row differs from page 1's.
  const page2 = page1.replaceAll('/current-positions/', '/current-positions/p2-');
  const ctx = { sourceId: 'sehc:sehc', runId: 'test' };

  const serve = (pages: Record<string, string>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const page = new URL(url).searchParams.get('page') ?? '1';
        return new Response(pages[page] ?? page1, { status: 200 });
      }),
    );

  it('stops when the board wraps back to page 1 instead of ending', async () => {
    // Page 3 does not exist, and the board answers it with page 1 again, as it does live.
    serve({ '1': page1, '2': page2 });
    const connector = createSeHealthConnector(seHealth, ctx);

    const first = await connector.fetchPage();
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).toBe('2');

    const second = await connector.fetchPage(first.nextCursor);
    expect(second.items).toHaveLength(10);
    expect(second.nextCursor).toBe('3');

    const third = await connector.fetchPage(second.nextCursor);
    expect(third.items).toEqual([]);
    expect(third.nextCursor).toBeUndefined();
  }, 15_000);

  it('stops on a page with no rows', async () => {
    serve({ '1': page1, '2': '<html></html>' });
    const connector = createSeHealthConnector(seHealth, ctx);
    await connector.fetchPage();
    expect((await connector.fetchPage('2')).items).toEqual([]);
  }, 15_000);

  it('fails, rather than reporting an empty board, when the WAF serves its CAPTCHA page', async () => {
    // What careers.sehc.com returned, with HTTP 200, once it began challenging the crawler.
    serve({
      '1': '<html><body><title>Validation request</title><h3>User validation required to continue..</h3>'
        + '<form action="/captcha_resp" method="POST"></form></body></html>',
    });
    const connector = createSeHealthConnector(seHealth, ctx);
    await expect(connector.fetchPage()).rejects.toThrow(/blocked by the WAF/);
  });

  it('points at the certificate fix when the connection itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const connector = createSeHealthConnector(seHealth, ctx);
    await expect(connector.fetchPage()).rejects.toThrow(/NODE_EXTRA_CA_CERTS/);
  }, 30_000);
});
