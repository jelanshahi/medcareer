import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  parsePhenomSitemap,
  extractPhenomDetail,
  normalizePhenom,
  employmentTypeFromPhenom,
  type PhenomEmployer,
} from '@/workers/connectors/phenom';

const HOST = 'careers.siennaliving.ca';
const fixture = (name: string) => readFileSync(`fixtures/phenom/${name}`, 'utf8');

const sienna: PhenomEmployer = {
  slug: 'sienna-senior-living',
  name: 'Sienna Senior Living',
  province: 'ON',
  defaultCity: 'Markham',
  config: { key: 'sienna', host: HOST },
};

const JOB_PATH = '/job/SILICAUNREG078947EXTERNALENCA/Unregulated-Care-Provider';
const detail = () => extractPhenomDetail(fixture('sienna-job.html'), `https://${HOST}${JOB_PATH}`);

describe('parsePhenomSitemap', () => {
  const stubs = parsePhenomSitemap(fixture('sienna-sitemap.xml'), HOST);

  it('reads the job URLs with their modified dates', () => {
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.externalPath).toMatch(/^\/job\/[^/]+\//);
      expect(stub.sourceJobId.length).toBeGreaterThan(0);
      expect(stub.postedAt).toBeInstanceOf(Date);
    }
  });

  it('reads a sitemap whose loc and lastmod are separated', () => {
    // The same failure mode as the Quebec sitemaps: a pattern spanning </loc> to <lastmod>
    // reads nothing the day a tag appears between them, and the run still reports success.
    const spaced = fixture('sienna-sitemap.xml').replace(/<\/loc>/g, '</loc>\n<changefreq>daily</changefreq>');
    expect(parsePhenomSitemap(spaced, HOST).length).toBe(stubs.length);
  });

  it('ignores the sitemap entries that are not postings', () => {
    const withPages = fixture('sienna-sitemap.xml').replace(
      '<url>',
      `<url><loc>https://${HOST}/benefits</loc><lastmod>2026-09-24T00:00:00+00:00</lastmod></url><url>`,
    );
    expect(parsePhenomSitemap(withPages, HOST).length).toBe(stubs.length);
  });

  it('rejects an entry that leaves the registry host', () => {
    const tampered = fixture('sienna-sitemap.xml').replace(`https://${HOST}/job/`, 'https://evil.example/job/');
    expect(() => parsePhenomSitemap(tampered, HOST)).toThrow(/not on registry host/);
  });
});

describe('normalizePhenom', () => {
  it('maps a posting', () => {
    const posting = normalizePhenom(detail(), sienna);
    expect(posting.sourceId).toBe('phenom:sienna');
    expect(posting.title).toBe('Unregulated Care Provider');
    expect(posting.employerName).toBe('Sienna Senior Living');
    expect(posting.city).toBe('Simcoe');
    expect(posting.province).toBe('ON');
    expect(posting.employmentType).toBe('full_time');
    expect(posting.postedAt.toISOString().slice(0, 10)).toBe('2026-09-17');
  });

  it('takes the province from the posting, not the registry', () => {
    // Sienna runs homes in more than one province, so a BC posting must not be filed in ON.
    const raw = detail();
    const bc = { ...raw, posting: { ...raw.posting, jobLocation: { address: { addressLocality: 'Nanaimo', addressRegion: 'BC' } } } };
    const posting = normalizePhenom(bc, sienna);
    expect(posting.province).toBe('BC');
    expect(posting.city).toBe('Nanaimo');
  });

  it('decodes the escaped description into HTML', () => {
    const description = normalizePhenom(detail(), sienna).description;
    expect(description).toMatch(/<p>/);
    expect(description).not.toMatch(/&lt;|&gt;/);
    expect(description).not.toMatch(/&amp;(amp|lt|gt|#)/);
    expect(description.length).toBeGreaterThan(300);
  });

  it('falls back to the registry city when the posting names none', () => {
    const raw = detail();
    const noCity = { ...raw, posting: { ...raw.posting, jobLocation: undefined } };
    expect(normalizePhenom(noCity, sienna).city).toBe('Markham');
  });

  it('refuses a posting whose URL leaves the registry host', () => {
    expect(() => normalizePhenom({ ...detail(), url: 'https://evil.example/job/x/y' }, sienna))
      .toThrow(/not on registry host/);
  });

  it('throws rather than inventing a posting from a page with no JobPosting', () => {
    expect(() => extractPhenomDetail('<html><body>nothing</body></html>', `https://${HOST}${JOB_PATH}`))
      .toThrow(/no JobPosting JSON-LD/);
  });

  it('keeps looking past the page’s other JSON-LD blocks', () => {
    // The page carries WebPage and BreadcrumbList blocks alongside the JobPosting.
    expect(detail().posting.title).toBe('Unregulated Care Provider');
  });
});

describe('employmentTypeFromPhenom', () => {
  it('reads the array schema.org sends', () => {
    expect(employmentTypeFromPhenom(['FULL_TIME'])).toBe('full_time');
    expect(employmentTypeFromPhenom(['PART_TIME'])).toBe('part_time');
    expect(employmentTypeFromPhenom('PER_DIEM')).toBe('casual');
  });

  it('says nothing for a type it does not know', () => {
    expect(employmentTypeFromPhenom(undefined)).toBeUndefined();
    expect(employmentTypeFromPhenom(['OTHER'])).toBeUndefined();
  });
});
