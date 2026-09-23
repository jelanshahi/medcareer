import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  parseWpSitemap,
  extractWpJobManagerDetail,
  normalizeWpJobManager,
  employmentTypeFromWp,
  cityFromAddress,
  type WpJobManagerEmployer,
} from '@/workers/connectors/wpjobmanager';

const HOST = 'carrieres.cusm.ca';
const fixture = (name: string) => readFileSync(`fixtures/wpjobmanager/${name}`, 'utf8');

const muhc: WpJobManagerEmployer = {
  slug: 'muhc',
  name: 'McGill University Health Centre',
  province: 'QC',
  defaultCity: 'Montréal',
  config: { key: 'muhc', host: HOST },
};

const detail = (name: string, slug: string) =>
  extractWpJobManagerDetail(fixture(`${name}.html`), `https://${HOST}/poste/${slug}/`);

const job1 = () => detail('muhc-job-1', 'candidat-a-lexercice-de-la-profession-dinfirmier-infirmiere-auxiliaire');
const job2 = () => detail('muhc-job-2', 'candidat-candidate-a-lexercice-de-la-profession-dinfirmier-infirmiere-plusieurs-sites');

describe('parseWpSitemap', () => {
  const stubs = parseWpSitemap(fixture('muhc-sitemap.xml'), HOST);

  it('reads every posting with its last-modified date', () => {
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.externalPath).toBe(`/poste/${stub.sourceJobId}/`);
      expect(stub.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(stub.postedAt!.getTime())).toBe(false);
    }
  });

  it('reads a sitemap whose loc and lastmod are not adjacent', () => {
    // The Capitale-Nationale site puts <xhtml:link hreflang> alternates between them. A
    // pattern spanning </loc> to <lastmod> matches nothing there, and the run then reports
    // success having fetched zero postings — the failure that silently empties a source.
    const withAlternates = fixture('muhc-sitemap.xml').replace(
      /<\/loc>/g,
      `</loc>\n\t\t<xhtml:link rel="alternate" hreflang="fr" href="https://${HOST}/poste/x/" />`,
    );
    expect(parseWpSitemap(withAlternates, HOST).length).toBe(stubs.length);
  });

  it('ignores sitemap entries that are not postings', () => {
    const withPages = fixture('muhc-sitemap.xml').replace(
      '<url>',
      `<url><loc>https://${HOST}/nous-joindre/</loc><lastmod>2026-09-01T00:00:00+00:00</lastmod></url><url>`,
    );
    expect(parseWpSitemap(withPages, HOST).length).toBe(stubs.length);
  });

  it('rejects an entry that leaves the registry host', () => {
    const tampered = fixture('muhc-sitemap.xml').replace(`https://${HOST}/poste/`, 'https://evil.example/poste/');
    expect(() => parseWpSitemap(tampered, HOST)).toThrow(/not on registry host/);
  });
});

describe('normalizeWpJobManager', () => {
  it('maps a posting', () => {
    const posting = normalizeWpJobManager(job1(), muhc);
    expect(posting.sourceId).toBe('wpjobmanager:muhc');
    expect(posting.employerName).toBe('McGill University Health Centre');
    expect(posting.city).toBe('Montréal');
    expect(posting.province).toBe('QC');
    expect(posting.employmentType).toBe('part_time');
    expect(posting.postedAt.toISOString()).toBe('2025-10-31T04:00:00.000Z');
    expect(posting.applyUrl).toMatch(new RegExp(`^https://${HOST}/poste/`));
  });

  it('decodes a title that was escaped twice', () => {
    // Stored as "l&rsquo;exercice", then the JSON-LD encoder escaped the ampersand, so the
    // raw value reads "l&amp;rsquo;exercice". One pass leaves "&rsquo;" on the job card.
    const title = normalizeWpJobManager(job2(), muhc).title;
    expect(title).toBe('Candidat / candidate à l’exercice de la profession d’infirmier / infirmière – Plusieurs sites');
    expect(title).not.toContain('&');
  });

  it('decodes the description exactly once, leaving it as HTML', () => {
    // A second pass would strip the markup the job page renders, and turn an escaped
    // ampersand into a bare one.
    const description = normalizeWpJobManager(job1(), muhc).description;
    expect(description).toMatch(/<p>/);
    expect(description).not.toMatch(/&lt;|&gt;/);
    expect(description).not.toMatch(/&amp;(amp|lt|gt|#)/);
    expect(description.length).toBeGreaterThan(200);
  });

  it('maps both saved fixtures without throwing', () => {
    for (const raw of [job1(), job2()]) {
      const posting = normalizeWpJobManager(raw, muhc);
      expect(posting.title.length).toBeGreaterThan(0);
      expect(posting.province).toBe('QC');
      expect(posting.city.length).toBeGreaterThan(0);
      expect(posting.description).not.toMatch(/<(script|style)\b/);
      expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    }
  });

  it('sets no closing date, validThrough being a placeholder', () => {
    // It is exactly a year after datePosted on one fixture and the year end on the other.
    expect(normalizeWpJobManager(job1(), muhc).closesAt).toBeUndefined();
    expect(normalizeWpJobManager(job2(), muhc).closesAt).toBeUndefined();
  });

  it('refuses a posting whose URL leaves the registry host', () => {
    const raw = { ...job1(), url: 'https://evil.example/poste/x/' };
    expect(() => normalizeWpJobManager(raw, muhc)).toThrow(/not on registry host/);
  });

  it('throws rather than inventing a posting from a page with no JobPosting', () => {
    expect(() => extractWpJobManagerDetail('<html><body>rien</body></html>', `https://${HOST}/poste/x/`))
      .toThrow(/no JobPosting JSON-LD/);
  });

  it('keeps looking when a page carries a malformed JSON-LD block first', () => {
    const broken = `<script type="application/ld+json">{ not json </script>${fixture('muhc-job-1.html')}`;
    expect(extractWpJobManagerDetail(broken, `https://${HOST}/poste/x/`).posting.title.length)
      .toBeGreaterThan(0);
  });
});

describe('employmentTypeFromWp', () => {
  it('reads the array schema.org sends', () => {
    expect(employmentTypeFromWp(['PART_TIME'])).toBe('part_time');
    expect(employmentTypeFromWp(['FULL_TIME'])).toBe('full_time');
    expect(employmentTypeFromWp('TEMPORARY')).toBe('temporary');
  });

  it('says nothing for a type it does not know', () => {
    expect(employmentTypeFromWp(undefined)).toBeUndefined();
    expect(employmentTypeFromWp(['OTHER'])).toBeUndefined();
  });
});

describe('cityFromAddress', () => {
  it('reads the bare string these sites send', () => {
    expect(cityFromAddress('Montréal', 'Québec')).toBe('Montréal');
  });

  it('reads a PostalAddress too, should one appear', () => {
    expect(cityFromAddress({ addressLocality: 'Laval' }, 'Québec')).toBe('Laval');
  });

  it('falls back to the registry city when the posting names none', () => {
    expect(cityFromAddress(undefined, 'Québec')).toBe('Québec');
    expect(cityFromAddress('', 'Québec')).toBe('Québec');
  });
});
