# SilkRoad Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `silkroad` ATS connector so Baycrest and Muskoka Algonquin Healthcare (MAHC) can be ingested, via SilkRoad Technology's server-rendered job board platform at `jobs-ca.silkroad.com`.

**Architecture:** One new connector file (`workers/connectors/silkroad.ts`) parsing server-rendered HTML with `node-html-parser` (already a dependency, used by `icims.ts`). Unlike every other connector so far, the two target employers render detail pages two genuinely different ways: Baycrest carries a schema.org `JobPosting` JSON-LD block (same shape `icims.ts` already parses), MAHC carries labelled `<h2>`/`<div>` field pairs instead. `normalizeSilkRoad` tries JSON-LD first and falls back to label-based extraction when it's absent. `workers/run.ts` gains one new Zod schema and one new arm on its discriminated union, matching the pattern already used for 12 other platforms there.

**Tech Stack:** TypeScript, Zod (JSON-LD validation only — there's no API schema), `node-html-parser` (HTML parsing), Vitest (tests), Supabase/Postgres (employer registry), no new npm dependencies.

## Global Constraints

- All outbound URLs are built from the employer registry (`host`/`tenant`/`boardCode`), never from page content — there is no vendor-supplied apply link to validate here, unlike every API-based connector.
- `fetchWithBackoff` already refuses non-`https://` URLs — no connector-specific URL validation is needed beyond that.
- A malformed detail page must fail that one posting, never abort the whole run — enforced by letting `workers/run.ts`'s existing per-item `try/catch` handle any thrown error from `normalize()`.
- Respect `robots.txt`: `jobs-ca.silkroad.com`'s robots.txt states `Crawl-Delay: 10`. The connector's rate limiter must honor this exactly (`createHostLimiter(10_000)`), not the default 1-second interval every other connector uses.
- No salary, shift-type, employment-type, or `closesAt` extraction in v1 (per the approved design spec, §5, decision #3) — neither extraction path has a reliable source for these that's confirmed to hold across tenants, and Baycrest's own JSON-LD `employmentType` is a literal `"OTHER"`, uninformative even where present.
- Test fixtures must be **real captured HTML**, not synthetic — this connector has no documented schema to write fixtures against, only actual rendered markup, so hand-written fixtures would not prove anything about real-world behavior.

---

## File Structure

- **Create** `fixtures/silkroad/mahc-listing-page1.html` — a real captured MAHC listing page (10 job links — a full page).
- **Create** `fixtures/silkroad/mahc-listing-page3.html` — a real captured MAHC listing page (fewer than 10 job links — the last/short page).
- **Create** `fixtures/silkroad/mahc-job-detail.html` — a real captured MAHC detail page (label-fallback path; no JSON-LD).
- **Create** `fixtures/silkroad/baycrest-job-detail.html` — a real captured Baycrest detail page (JSON-LD path; no labelled fields).
- **Create** `workers/connectors/silkroad.ts` — the connector: types, list parsing, both normalization paths, the `Connector` factory.
- **Create** `tests/workers/silkroad-normalize.test.ts` — unit tests for every pure function in the file above.
- **Modify** `workers/run.ts` — add `SilkRoadAtsConfigSchema`, a new arm on `EmployerRowSchema`'s discriminated union, an import of the connector, `'silkroad'` in the `.in('ats_platform', [...])` filter, and a new `else if` branch in `main()`.
- **Create** `supabase/migrations/0025_seed_silkroad_ontario.sql` — written in the final task, after a pre-flight recheck confirming nothing changed since this plan was written.

---

### Task 1: Real fixtures

**Files:**
- Create: `fixtures/silkroad/mahc-listing-page1.html`
- Create: `fixtures/silkroad/mahc-listing-page3.html`
- Create: `fixtures/silkroad/mahc-job-detail.html`
- Create: `fixtures/silkroad/baycrest-job-detail.html`

**Interfaces:**
- Produces: four real HTML files later tasks import by path. These are **captured from the live site**, not authored — the commands below were already run once during design and confirmed to work; running them again should reproduce materially the same structure (exact job content may have changed if postings closed, which is fine — the tests in later tasks assert on structural facts like "has exactly N job links" and "the description contains this phrase", not on every byte).

This task has no test cycle of its own — fixtures are data, not code.

- [ ] **Step 1: Capture the two MAHC listing pages**

```bash
UA="MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:jelanshahi6@gmail.com)"
curl -sL "https://jobs-ca.silkroad.com/MAHC/MAHCCareers?page=1" -A "$UA" -o fixtures/silkroad/mahc-listing-page1.html
curl -sL "https://jobs-ca.silkroad.com/MAHC/MAHCCareers?page=3" -A "$UA" -o fixtures/silkroad/mahc-listing-page3.html
```

- [ ] **Step 2: Verify the two listing pages have the expected shape**

Run: `grep -c 'MAHCCareers/jobs/' fixtures/silkroad/mahc-listing-page1.html`
Expected: a number greater than 0 (link count; each job link appears once as an `href`, but may also appear in an `id` attribute on the same line, so don't expect exactly 10 — Step 2 of Task 2 establishes the exact parsed count via code, not `grep`).

Run: `grep -c 'MAHCCareers/jobs/' fixtures/silkroad/mahc-listing-page3.html`
Expected: a smaller number than page 1's (page 3 is the last/short page — fewer job links than a full page).

If `mahc-listing-page3.html` has the SAME or MORE links than page 1, pagination may have changed since this plan was written — try a higher page number (`?page=4`, `?page=5`, ...) until you find one with visibly fewer links than page 1, and use that page number instead of 3 (rename the file to match, e.g. `mahc-listing-page4.html`, and use that filename consistently in Tasks 1-3).

- [ ] **Step 3: Capture the two detail pages**

```bash
UA="MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:jelanshahi6@gmail.com)"
curl -sL "https://jobs-ca.silkroad.com/MAHC/MAHCCareers/jobs/1621" -A "$UA" -o fixtures/silkroad/mahc-job-detail.html
curl -sL "https://jobs-ca.silkroad.com/Baycrest/Careers/jobs/5727" -A "$UA" -o fixtures/silkroad/baycrest-job-detail.html
```

If either job id now 404s (the posting closed since this plan was written), pick any other live id from that tenant's current listing page (captured in Step 1) and use it instead.

- [ ] **Step 4: Verify which extraction path each detail fixture needs**

Run: `grep -c 'application/ld+json' fixtures/silkroad/mahc-job-detail.html`
Expected: `0` — MAHC's page must NOT have JSON-LD (if it now does, note this in your task report — it would mean this plan's two-path design needs revisiting, and you should stop and report BLOCKED rather than guess).

Run: `grep -c 'application/ld+json' fixtures/silkroad/baycrest-job-detail.html`
Expected: a number greater than `0` — Baycrest's page must have JSON-LD (same BLOCKED guidance if it doesn't).

Run: `grep -c 'ConfigurablePageDetail__DisplayLocation' fixtures/silkroad/mahc-job-detail.html`
Expected: a number greater than `0` — confirms MAHC's labelled-field structure is present.

- [ ] **Step 5: Commit**

```bash
git add fixtures/silkroad/
git commit -m "test: add real captured SilkRoad fixtures for MAHC and Baycrest"
```

---

### Task 2: List parsing

**Files:**
- Create: `workers/connectors/silkroad.ts` (started here, extended in Tasks 3-5)
- Test: `tests/workers/silkroad-normalize.test.ts` (started here, extended in Tasks 3-5)

**Interfaces:**
- Consumes: `JobStub` from `@/lib/types` (`{ sourceJobId: string; externalPath: string; title: string; locationsText: string; postedAt?: Date; listFields?: Record<string,string> }`).
- Produces: `parseSilkRoadListing(html: string, tenant: string, boardCode: string): JobStub[]`, exported for this task's test and for the `fetchPage` wiring in Task 5.

- [ ] **Step 1: Write the failing test for list parsing**

Create `tests/workers/silkroad-normalize.test.ts` with this content:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseSilkRoadListing } from '@/workers/connectors/silkroad';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'fixtures/silkroad', name), 'utf8');

describe('parseSilkRoadListing', () => {
  it('extracts every unique job id from a full listing page', () => {
    const stubs = parseSilkRoadListing(fixture('mahc-listing-page1.html'), 'MAHC', 'MAHCCareers');
    expect(stubs.length).toBeGreaterThan(0);
    for (const stub of stubs) {
      expect(stub.sourceJobId).toMatch(/^\d+$/);
      expect(stub.externalPath).toBe(`/MAHC/MAHCCareers/jobs/${stub.sourceJobId}`);
    }
    // No duplicates: each job's link and id-attribute both contain the href, but each job id
    // must appear exactly once in the result.
    expect(new Set(stubs.map((s) => s.sourceJobId)).size).toBe(stubs.length);
  });

  it('returns fewer ids for the short/last page than the full first page', () => {
    const page1 = parseSilkRoadListing(fixture('mahc-listing-page1.html'), 'MAHC', 'MAHCCareers');
    const lastPage = parseSilkRoadListing(fixture('mahc-listing-page3.html'), 'MAHC', 'MAHCCareers');
    expect(lastPage.length).toBeLessThan(page1.length);
  });

  it('ignores links for a different tenant or board code', () => {
    const stubs = parseSilkRoadListing(fixture('mahc-listing-page1.html'), 'SomeOtherTenant', 'SomeOtherBoard');
    expect(stubs).toHaveLength(0);
  });
});
```

(If Task 1's Step 2 found you needed a different page number than 3 for the short-page fixture, use that filename here instead of `mahc-listing-page3.html`, consistently.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/workers/silkroad-normalize.test.ts`
Expected: FAIL — `workers/connectors/silkroad.ts` does not exist yet, so the import throws.

- [ ] **Step 3: Create `workers/connectors/silkroad.ts` with types and `parseSilkRoadListing`**

```ts
import { parse } from 'node-html-parser';
import type { JobStub, ProvinceCode } from '@/lib/types';
import type { Connector } from './types';

/**
 * SilkRoad Technology career sites (jobs-ca.silkroad.com and friends) -- a classic
 * server-rendered ATS, not a SPA. robots.txt states `Crawl-Delay: 10`, which this connector's
 * rate limiter honours directly (see `limit` in Task 5) rather than deferring confirmation to a
 * later pre-flight step the way SmartRecruiters' rate limit needed to be.
 */
export type SilkRoadEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    host: string;
    /** First URL path segment, e.g. "MAHC", "Baycrest". */
    tenant: string;
    /** Second URL path segment, e.g. "MAHCCareers", "Careers". */
    boardCode: string;
  };
};

export function parseSilkRoadListing(html: string, tenant: string, boardCode: string): JobStub[] {
  const root = parse(html);
  const prefix = `/${tenant}/${boardCode}/jobs/`;
  const ids = new Set<string>();
  for (const a of root.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    // Require the remainder after the prefix to be purely digits, so a deeper path like
    // "/MAHC/MAHCCareers/jobs/1621/apply" (if one exists) is not mistaken for a job id.
    if (href && href.startsWith(prefix) && /^\d+$/.test(href.slice(prefix.length))) {
      ids.add(href.slice(prefix.length));
    }
  }
  return [...ids].map((id) => ({
    sourceJobId: id,
    externalPath: `${prefix}${id}`,
    // The listing page's link text is not a reliable title source across tenants; hydrate()
    // always fetches the full detail page regardless, same as every HTML-scraping connector here.
    title: '',
    locationsText: '',
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/workers/silkroad-normalize.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add workers/connectors/silkroad.ts tests/workers/silkroad-normalize.test.ts
git commit -m "feat(silkroad): add listing-page parsing"
```

---

### Task 3: Extraction helpers for both paths

**Files:**
- Modify: `workers/connectors/silkroad.ts`
- Modify: `tests/workers/silkroad-normalize.test.ts`

**Interfaces:**
- Consumes: `provinceCodeFromName` from `@/lib/provinces`; `ProvinceCode` from `@/lib/types` (already imported in Task 2).
- Produces: `extractJsonLd(html: string): unknown`, `provinceFromIsoRegion(region?: string): ProvinceCode | null`, `fieldByLabel(root: ReturnType<typeof parse>, label: string): string | undefined`, `parseLabelLocation(location: string): { city?: string; province: ProvinceCode | null }`, `parseSilkRoadLabelDate(value: string): Date` — all exported for this task's tests and for Task 4's `normalizeSilkRoad`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/workers/silkroad-normalize.test.ts`:

```ts
import { parse } from 'node-html-parser';
import {
  extractJsonLd,
  provinceFromIsoRegion,
  fieldByLabel,
  parseLabelLocation,
  parseSilkRoadLabelDate,
} from '@/workers/connectors/silkroad';

describe('extractJsonLd', () => {
  it('parses the JSON-LD block from the Baycrest fixture', () => {
    const json = extractJsonLd(fixture('baycrest-job-detail.html')) as { '@type'?: string } | undefined;
    expect(json).toBeDefined();
    expect(json?.['@type']).toBe('JobPosting');
  });

  it('returns undefined when there is no JSON-LD block', () => {
    expect(extractJsonLd(fixture('mahc-job-detail.html'))).toBeUndefined();
  });

  it('returns undefined for malformed JSON rather than throwing', () => {
    const html = '<script type="application/ld+json">{not valid json</script>';
    expect(extractJsonLd(html)).toBeUndefined();
  });
});

describe('provinceFromIsoRegion', () => {
  it('strips the "CA-" prefix', () => {
    expect(provinceFromIsoRegion('CA-ON')).toBe('ON');
  });

  it('accepts a bare province code too', () => {
    expect(provinceFromIsoRegion('ON')).toBe('ON');
  });

  it('returns null for an unrecognized region', () => {
    expect(provinceFromIsoRegion('CA-ZZ')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(provinceFromIsoRegion(undefined)).toBeNull();
  });
});

describe('fieldByLabel', () => {
  it('finds "Job Location" on the MAHC fixture', () => {
    const root = parse(fixture('mahc-job-detail.html'));
    const value = fieldByLabel(root, 'Job Location');
    expect(value).toContain('Huntsville');
  });

  it('finds "Posted Date" on the MAHC fixture', () => {
    const root = parse(fixture('mahc-job-detail.html'));
    expect(fieldByLabel(root, 'Posted Date')).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });

  it('does not find a label that is not present', () => {
    const root = parse(fixture('mahc-job-detail.html'));
    expect(fieldByLabel(root, 'Not A Real Label')).toBeUndefined();
  });

  it('returns undefined on a page with none of these containers at all', () => {
    const root = parse(fixture('baycrest-job-detail.html'));
    expect(fieldByLabel(root, 'Job Location')).toBeUndefined();
  });
});

describe('parseLabelLocation', () => {
  it('reads city and province from the end of a variable-length address', () => {
    const result = parseLabelLocation('100 Frank Miller Dr, Huntsville, Ontario, Canada');
    expect(result.city).toBe('Huntsville');
    expect(result.province).toBe('ON');
  });

  it('handles an address with no street-address prefix', () => {
    const result = parseLabelLocation('Huntsville, Ontario, Canada');
    expect(result.city).toBe('Huntsville');
    expect(result.province).toBe('ON');
  });

  it('returns an undefined city and null province for an unparseable string', () => {
    const result = parseLabelLocation('');
    expect(result.city).toBeUndefined();
    expect(result.province).toBeNull();
  });
});

describe('parseSilkRoadLabelDate', () => {
  it('parses M/D/YYYY', () => {
    expect(parseSilkRoadLabelDate('9/3/2026')).toEqual(new Date('2026-09-03T00:00:00Z'));
  });

  it('parses single-digit month and day with no leading zero required', () => {
    expect(parseSilkRoadLabelDate('1/5/2026')).toEqual(new Date('2026-01-05T00:00:00Z'));
  });

  it('throws on an unparseable value', () => {
    expect(() => parseSilkRoadLabelDate('not a date')).toThrow();
  });

  it('throws on an ISO-format value (this parser is for the label format only)', () => {
    expect(() => parseSilkRoadLabelDate('2026-09-03')).toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/workers/silkroad-normalize.test.ts`
Expected: FAIL — `extractJsonLd`, `provinceFromIsoRegion`, `fieldByLabel`, `parseLabelLocation`, and `parseSilkRoadLabelDate` are not exported yet.

- [ ] **Step 3: Append the helpers to `workers/connectors/silkroad.ts`**

```ts
import { provinceCodeFromName } from '@/lib/provinces';
```

(add this import alongside the existing ones at the top of the file)

```ts
/** Reads the first `application/ld+json` script's parsed content, if the page has one. */
export function extractJsonLd(html: string): unknown {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

/** "CA-ON" -> "ON". Also accepts a bare code. Null for anything unrecognized. */
export function provinceFromIsoRegion(region?: string): ProvinceCode | null {
  if (!region) return null;
  const code = region.startsWith('CA-') ? region.slice(3) : region;
  return provinceCodeFromName(code);
}

/**
 * Finds the value of a labelled field by the text of its <h2>, not by its container's id --
 * ids are partly tenant-specific custom fields (MAHC's "mahc_positiontype" etc.), but the
 * human-readable label is what a future tenant on this fallback path is most likely to share.
 * node-html-parser exposes no parentNode/nextSibling/nextElementSibling (confirmed against its
 * own type definitions, node_modules/node-html-parser/dist/nodes/html.d.ts), so this reads each
 * whole field container and its own <h2>/<div> children, rather than walking from the <h2> to
 * "the next sibling" the way a full DOM API would allow.
 */
export function fieldByLabel(root: ReturnType<typeof parse>, label: string): string | undefined {
  for (const container of root.querySelectorAll('[id^="ConfigurablePageDetail__"]')) {
    const heading = container.querySelector('h2');
    if (heading?.text.trim() !== label) continue;
    const value = container.querySelector('div');
    return value?.text.trim() || undefined;
  }
  return undefined;
}

/**
 * "100 Frank Miller Dr, Huntsville, Ontario, Canada" -> city "Huntsville", province "ON".
 * Indexed from the END of the comma list, not the start: the leading street-address portion is
 * variable-length (it may be absent entirely), but the trailing "..., city, province, country"
 * shape is constant -- unlike oraclecloud.ts's parseLocation, which can safely index from the
 * start because its "city, province, country" shape has no variable-length prefix.
 */
export function parseLabelLocation(location: string): { city?: string; province: ProvinceCode | null } {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  const city = parts.length >= 3 ? parts[parts.length - 3] : undefined;
  const province = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  return { city, province: province ? provinceCodeFromName(province) : null };
}

/** "9/3/2026" -> Date at UTC midnight. Throws on anything that is not exactly M/D/YYYY. */
export function parseSilkRoadLabelDate(value: string): Date {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Unparseable Posted Date "${value}"`);
  const [, month, day, year] = match;
  const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Unparseable Posted Date "${value}"`);
  return date;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/workers/silkroad-normalize.test.ts`
Expected: PASS (all tests in the file, Task 2's tests included)

- [ ] **Step 5: Commit**

```bash
git add workers/connectors/silkroad.ts tests/workers/silkroad-normalize.test.ts
git commit -m "feat(silkroad): add JSON-LD and label-fallback extraction helpers"
```

---

### Task 4: `normalizeSilkRoad` — combining both paths

**Files:**
- Modify: `workers/connectors/silkroad.ts`
- Modify: `tests/workers/silkroad-normalize.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-3 (same file); `sanitizeDescription` from `@/lib/normalize/sanitize`; `NormalizedPosting` from `@/lib/types`; `z` from `zod`.
- Produces: `normalizeSilkRoad(html: string, employer: SilkRoadEmployer, sourceJobId: string): NormalizedPosting`, exported for this task's tests and for Task 5's connector factory.

- [ ] **Step 1: Write the failing tests**

Append to `tests/workers/silkroad-normalize.test.ts`:

```ts
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { normalizeSilkRoad } from '@/workers/connectors/silkroad';
import type { SilkRoadEmployer } from '@/workers/connectors/silkroad';

const mahc: SilkRoadEmployer = {
  slug: 'muskoka-algonquin-healthcare',
  name: 'Muskoka Algonquin Healthcare',
  province: 'ON',
  defaultCity: 'Huntsville',
  config: { host: 'jobs-ca.silkroad.com', tenant: 'MAHC', boardCode: 'MAHCCareers' },
};

const baycrest: SilkRoadEmployer = {
  slug: 'baycrest',
  name: 'Baycrest',
  province: 'ON',
  defaultCity: 'Toronto',
  config: { host: 'jobs-ca.silkroad.com', tenant: 'Baycrest', boardCode: 'Careers' },
};

describe('normalizeSilkRoad', () => {
  describe('label-fallback path (MAHC, no JSON-LD)', () => {
    it('maps the detail page onto NormalizedPosting', () => {
      const posting = normalizeSilkRoad(fixture('mahc-job-detail.html'), mahc, '1621');
      expect(posting.sourceId).toBe('silkroad:MAHC');
      expect(posting.sourceJobId).toBe('1621');
      expect(posting.sourceUrl).toBe('https://jobs-ca.silkroad.com/MAHC/MAHCCareers/jobs/1621');
      expect(posting.applyUrl).toBe(posting.sourceUrl);
      expect(posting.employerName).toBe('Muskoka Algonquin Healthcare');
      expect(posting.city).toBe('Huntsville');
      expect(posting.province).toBe('ON');
      expect(posting.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    });

    it('sanitizes the description', () => {
      const posting = normalizeSilkRoad(fixture('mahc-job-detail.html'), mahc, '1621');
      expect(posting.description).not.toContain('<script');
      expect(posting.description.length).toBeGreaterThan(0);
    });

    it('leaves salary, shift type, employment type, and closesAt undefined', () => {
      const posting = normalizeSilkRoad(fixture('mahc-job-detail.html'), mahc, '1621');
      expect(posting.salaryMin).toBeUndefined();
      expect(posting.salaryMax).toBeUndefined();
      expect(posting.shiftType).toBeUndefined();
      expect(posting.employmentType).toBeUndefined();
      expect(posting.closesAt).toBeUndefined();
    });

    it('falls back to the employer registry city/province when Job Location is absent', () => {
      const html = fixture('mahc-job-detail.html').replace('Job Location', 'Something Else');
      const posting = normalizeSilkRoad(html, mahc, '1621');
      expect(posting.city).toBe('Huntsville');
      expect(posting.province).toBe('ON');
    });

    it('throws when Posted Date is missing (no reasonable fallback for a required date)', () => {
      const html = fixture('mahc-job-detail.html').replace('Posted Date', 'Something Else');
      expect(() => normalizeSilkRoad(html, mahc, '1621')).toThrow();
    });

    it('throws when the title element is missing', () => {
      const html = fixture('mahc-job-detail.html').replace('Jobs_JobDetail_TitleText', 'renamed');
      expect(() => normalizeSilkRoad(html, mahc, '1621')).toThrow();
    });
  });

  describe('JSON-LD path (Baycrest)', () => {
    it('maps the detail page onto NormalizedPosting', () => {
      const posting = normalizeSilkRoad(fixture('baycrest-job-detail.html'), baycrest, '5727');
      expect(posting.sourceId).toBe('silkroad:Baycrest');
      expect(posting.sourceJobId).toBe('5727');
      expect(posting.sourceUrl).toBe('https://jobs-ca.silkroad.com/Baycrest/Careers/jobs/5727');
      expect(posting.title).toBe('Janitor');
      expect(posting.city).toBe('Toronto');
      expect(posting.province).toBe('ON');
      expect(posting.postedAt).toBeInstanceOf(Date);
      expect(Number.isNaN(posting.postedAt.getTime())).toBe(false);
    });

    it('sanitizes the JSON-LD description', () => {
      const posting = normalizeSilkRoad(fixture('baycrest-job-detail.html'), baycrest, '5727');
      expect(posting.description).not.toContain('<script');
      expect(posting.description.length).toBeGreaterThan(0);
    });

    it('ignores the JSON-LD employmentType field ("OTHER" is uninformative)', () => {
      const posting = normalizeSilkRoad(fixture('baycrest-job-detail.html'), baycrest, '5727');
      expect(posting.employmentType).toBeUndefined();
    });

    it('leaves salary, shift type, and closesAt undefined', () => {
      const posting = normalizeSilkRoad(fixture('baycrest-job-detail.html'), baycrest, '5727');
      expect(posting.salaryMin).toBeUndefined();
      expect(posting.salaryMax).toBeUndefined();
      expect(posting.shiftType).toBeUndefined();
      expect(posting.closesAt).toBeUndefined();
    });

    it('throws when datePosted is unparseable', () => {
      const html = fixture('baycrest-job-detail.html').replace(
        /"datePosted":"[^"]*"/,
        '"datePosted":"not-a-date"',
      );
      expect(() => normalizeSilkRoad(html, baycrest, '5727')).toThrow();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/workers/silkroad-normalize.test.ts`
Expected: FAIL — `normalizeSilkRoad` is not exported yet.

- [ ] **Step 3: Append `normalizeSilkRoad` to `workers/connectors/silkroad.ts`**

```ts
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { NormalizedPosting } from '@/lib/types';
```

(add these imports alongside the existing ones — `NormalizedPosting` joins the existing `JobStub, ProvinceCode` import from `@/lib/types`)

```ts
const JsonLdAddressSchema = z.object({
  addressLocality: z.string().optional(),
  addressRegion: z.string().optional(),
});

const JsonLdJobPostingSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  datePosted: z.string().min(1),
  jobLocation: z.object({ address: JsonLdAddressSchema }).optional(),
});

export function normalizeSilkRoad(html: string, employer: SilkRoadEmployer, sourceJobId: string): NormalizedPosting {
  const { host, tenant, boardCode } = employer.config;
  const url = `https://${host}/${tenant}/${boardCode}/jobs/${sourceJobId}`;

  const jsonLdRaw = extractJsonLd(html);
  const jsonLd = jsonLdRaw ? JsonLdJobPostingSchema.safeParse(jsonLdRaw) : undefined;

  if (jsonLd?.success) {
    const { title, description, datePosted, jobLocation } = jsonLd.data;
    const postedAt = new Date(datePosted);
    if (Number.isNaN(postedAt.getTime())) {
      throw new Error(`Unparseable datePosted "${datePosted}" for ${sourceJobId}`);
    }
    const address = jobLocation?.address;

    return {
      sourceId: `silkroad:${tenant}`,
      sourceJobId,
      sourceUrl: url,
      title,
      employerName: employer.name,
      description: sanitizeDescription(description),
      city: address?.addressLocality || employer.defaultCity,
      province: provinceFromIsoRegion(address?.addressRegion) ?? employer.province,
      postedAt,
      applyUrl: url,
    };
  }

  // Label-based fallback: this tenant's pages carry no JSON-LD.
  const root = parse(html);
  const titleEl = root.getElementById('Jobs_JobDetail_TitleText');
  const descriptionEl = root.getElementById('ConfigurablePageDetail__JobDescription');
  if (!titleEl || !descriptionEl) {
    throw new Error(`Missing title or description for ${sourceJobId}`);
  }

  const locationLabel = fieldByLabel(root, 'Job Location');
  const location = locationLabel ? parseLabelLocation(locationLabel) : undefined;

  const postedLabel = fieldByLabel(root, 'Posted Date');
  if (!postedLabel) throw new Error(`No Posted Date field for ${sourceJobId}`);

  return {
    sourceId: `silkroad:${tenant}`,
    sourceJobId,
    sourceUrl: url,
    title: titleEl.text.trim(),
    employerName: employer.name,
    description: sanitizeDescription(descriptionEl.innerHTML),
    city: location?.city || employer.defaultCity,
    province: location?.province ?? employer.province,
    postedAt: parseSilkRoadLabelDate(postedLabel),
    applyUrl: url,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/workers/silkroad-normalize.test.ts`
Expected: PASS (all tests in the file, Tasks 2-3's tests included)

- [ ] **Step 5: Commit**

```bash
git add workers/connectors/silkroad.ts tests/workers/silkroad-normalize.test.ts
git commit -m "feat(silkroad): add normalizeSilkRoad combining both extraction paths"
```

---

### Task 5: Connector factory

**Files:**
- Modify: `workers/connectors/silkroad.ts`

**Interfaces:**
- Consumes: `parseSilkRoadListing` and `normalizeSilkRoad` from this same file (Tasks 2 and 4); `Connector` from `./types`; `createHostLimiter`/`fetchWithBackoff` from `@/workers/ratelimit`; `SITE` from `@/lib/site`; `log`/`LogContext` from `@/workers/logger`.
- Produces: `createSilkRoadConnector(employer: SilkRoadEmployer, ctx: LogContext): Connector`, consumed by `workers/run.ts` in Task 6.

No new unit test in this task: `fetchPage`/`hydrate` are I/O, and no existing connector unit-tests its factory function either — only the pure parse/normalize functions, already covered in Tasks 2-4. Verified by typecheck and the full existing test suite still passing.

- [ ] **Step 1: Append the factory to `workers/connectors/silkroad.ts`**

```ts
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
```

(add these imports alongside the existing ones)

```ts
const PAGE_SIZE = 10;

const HydratedPageSchema = z.object({
  html: z.string().min(1),
  sourceJobId: z.string().min(1),
});

// robots.txt on jobs-ca.silkroad.com states "Crawl-Delay: 10" -- a 10-second minimum interval,
// not the default 1 second every other connector here uses. Both employers share this one host,
// so they automatically share this one rate budget, the same shared-host behavior already
// established for SmartRecruiters and Manitoba's SuccessFactors tenant.
const limit = createHostLimiter(10_000);

export function createSilkRoadConnector(employer: SilkRoadEmployer, ctx: LogContext): Connector {
  const { host, tenant, boardCode } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };
  const base = `https://${host}/${tenant}/${boardCode}`;

  return {
    id: `silkroad:${tenant}`,
    kind: 'ats',
    // One detail fetch per posting, and postings don't change once published, so known ones
    // are only marked as seen -- same reasoning as iCIMS and Oracle Cloud.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      const page = cursor ? Number(cursor) : 1;
      const url = `${base}?page=${page}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);

      const items = parseSilkRoadListing(await res.text(), tenant, boardCode);
      log(ctx, 'info', 'fetched list page', { page, returned: items.length });

      // Stop on a short page -- this platform publishes no total count to paginate against,
      // the same reasoning as every other connector's short-page stop rule here.
      const hasMore = items.length === PAGE_SIZE;
      return { items, nextCursor: hasMore ? String(page + 1) : undefined };
    },

    async hydrate(stub) {
      const url = `${base}/jobs/${stub.sourceJobId}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return { html: await res.text(), sourceJobId: stub.sourceJobId };
    },

    normalize(raw: unknown) {
      const { html, sourceJobId } = HydratedPageSchema.parse(raw);
      return normalizeSilkRoad(html, employer, sourceJobId);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `workers/connectors/silkroad.ts`. (This repo's fresh checkouts show pre-existing, unrelated `PageProps`/`LayoutProps` errors in `app/**` files until `next dev`/`next build` has run once and generated Next's ambient types — ignore those; they're a known, confirmed-pre-existing gap, not something this task introduced.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all test files pass, including `tests/workers/silkroad-normalize.test.ts`

- [ ] **Step 4: Commit**

```bash
git add workers/connectors/silkroad.ts
git commit -m "feat(silkroad): add connector factory"
```

---

### Task 6: Wire into the ingest runner

**Files:**
- Modify: `workers/run.ts`

**Interfaces:**
- Consumes: `createSilkRoadConnector`, `type SilkRoadEmployer` from `@/workers/connectors/silkroad` (Task 5).
- Produces: `workers/run.ts`'s `main()` now ingests `ats_platform = 'silkroad'` employers the same way it ingests the other 12 platforms.

- [ ] **Step 1: Add the import**

In `workers/run.ts`, add this line alongside the other connector imports (after the `smartrecruiters` import):

```ts
import { createSilkRoadConnector, type SilkRoadEmployer } from '@/workers/connectors/silkroad';
```

- [ ] **Step 2: Add the config schema**

Add this schema in `workers/run.ts` right after `OracleCloudAtsConfigSchema`, before `EmployerBaseSchema`:

```ts
/** SilkRoad: two URL path segments per tenant, one shared host across customers today. */
const SilkRoadAtsConfigSchema = z.object({
  host: z.string().min(1),
  tenant: z.string().min(1),
  boardCode: z.string().min(1),
});
```

- [ ] **Step 3: Add the discriminated-union arm**

In `EmployerRowSchema`'s array, add this line after the `smartrecruiters` arm:

```ts
  EmployerBaseSchema.extend({ ats_platform: z.literal('silkroad'), ats_config: SilkRoadAtsConfigSchema }),
```

- [ ] **Step 4: Add the platform to the active-employers query**

In `main()`, the `.in('ats_platform', [...])` array lists every platform `main()` knows how to ingest. Add `'silkroad'` to it:

```ts
    .in('ats_platform', ['workday', 'taleo', 'icims', 'jibe', 'successfactors', 'successfactors_mb', 'bchealthjobs', 'wpjobmanager', 'talentpoolbuilder', 'phenom', 'oraclecloud', 'smartrecruiters', 'silkroad']);
```

- [ ] **Step 5: Add the branch in the platform dispatch**

The dispatch in `main()` currently ends with:

```ts
    } else if (parsed.data.ats_platform === 'smartrecruiters') {
      const employer: SmartRecruitersEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `smartrecruiters:${employer.config.key}`;
      createConnector = (ctx) => createSmartRecruitersConnector(employer, ctx);
    } else {
      const exhaustiveCheck: never = parsed.data;
      throw new Error(`Unhandled ats_platform: ${JSON.stringify(exhaustiveCheck)}`);
    }
```

Adding a 13th platform means inserting its own `else if` before the final exhaustiveness-check `else`, the same way `smartrecruiters` was added as its own branch rather than replacing that final `else`. Replace the block above with:

```ts
    } else if (parsed.data.ats_platform === 'smartrecruiters') {
      const employer: SmartRecruitersEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `smartrecruiters:${employer.config.key}`;
      createConnector = (ctx) => createSmartRecruitersConnector(employer, ctx);
    } else if (parsed.data.ats_platform === 'silkroad') {
      const employer: SilkRoadEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `silkroad:${employer.config.tenant}`;
      createConnector = (ctx) => createSilkRoadConnector(employer, ctx);
    } else {
      const exhaustiveCheck: never = parsed.data;
      throw new Error(`Unhandled ats_platform: ${JSON.stringify(exhaustiveCheck)}`);
    }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `workers/run.ts` or `workers/connectors/silkroad.ts` (ignore the pre-existing, unrelated `app/**` noise described in Task 5). The final `else`'s `const exhaustiveCheck: never = parsed.data;` must still compile — if it doesn't, the discriminated union in Step 3 was not added correctly (one of the 13 literals isn't excluded by the preceding `if`/`else if` chain).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add workers/run.ts
git commit -m "feat(silkroad): wire connector into the ingest runner"
```

---

### Task 7: Live pre-flight recheck and seed migration

**Files:**
- Create: `supabase/migrations/0025_seed_silkroad_ontario.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks directly — this is a verification runbook, not code.

Unlike the SmartRecruiters plan's final task, nothing found during this connector's design investigation blocks activation — both employers can likely be seeded active directly. This task still reruns the key checks immediately before writing the migration, in case anything changed between design and implementation (robots.txt, bot-blocking, or the exact tenant/boardCode path segments).

- [ ] **Step 1: Recheck robots.txt**

```bash
UA="MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:jelanshahi6@gmail.com)"
curl -s "https://jobs-ca.silkroad.com/robots.txt" -A "$UA"
```

Expected: still permissive (a `Crawl-Delay` directive, disallowing only internal asset/Ajax paths, not `/MAHC/` or `/Baycrest/`). If it now disallows either tenant's path, stop and report that employer must stay `is_active = false` — do not activate an employer robots.txt newly disallows.

- [ ] **Step 2: Recheck both tenants are still reachable and bot-challenge-free**

```bash
UA="MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:jelanshahi6@gmail.com)"
curl -s -o /dev/null -w "MAHC: %{http_code} %{content_type}\n" "https://jobs-ca.silkroad.com/MAHC/MAHCCareers" -A "$UA"
curl -s -o /dev/null -w "Baycrest: %{http_code} %{content_type}\n" "https://jobs-ca.silkroad.com/Baycrest/Careers" -A "$UA"
```

Expected: `200 text/html` for both. Anything else (a different status, or a content type suggesting a challenge/error page) means that employer must stay `is_active = false` until investigated further.

- [ ] **Step 3: Write the seed migration**

Assuming both checks above pass cleanly, write `supabase/migrations/0025_seed_silkroad_ontario.sql` following the structure of `supabase/migrations/0024_seed_smartrecruiters_ontario.sql`: a comment block stating what was checked and when (including the two commands above and their results), then the insert statement with both employers `is_active = true`.

```sql
-- Two Ontario hospitals on the new SilkRoad connector (workers/connectors/silkroad.ts): Baycrest
-- and Muskoka Algonquin Healthcare (MAHC). Both run SilkRoad Technology's job board at
-- jobs-ca.silkroad.com.
--
-- Pre-flight rechecked <DATE> with our own User-Agent:
--   robots.txt: Crawl-Delay: 10, disallows only internal asset/Ajax paths -- /MAHC/ and
--   /Baycrest/ are both allowed. (This connector's rate limiter is set to createHostLimiter(10_000)
--   in workers/connectors/silkroad.ts to honour the stated delay.)
--   MAHC:     200 text/html at jobs-ca.silkroad.com/MAHC/MAHCCareers
--   Baycrest: 200 text/html at jobs-ca.silkroad.com/Baycrest/Careers
--
-- Note on page structure (see docs/superpowers/specs/2026-10-01-silkroad-connector-design.md):
-- the two tenants render detail pages two different ways -- Baycrest via a schema.org JobPosting
-- JSON-LD block, MAHC via labelled <h2>/<div> field pairs -- and normalizeSilkRoad() handles both.
--
-- Originally found via docs/research/ontario-hospitals-ats.md's baycrestcareers.silkroad.com
-- entry, which turned out to be a legacy front-door redirecting to a blocked host
-- (baycrest-hospital-openhire.silkroad.com, robots.txt Disallow: /). Baycrest's current presence
-- on jobs-ca.silkroad.com is the one actually used here.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('Baycrest', 'baycrest', 'hospital', 'ON', 'Toronto',
   'https://www.baycrest.org', 'silkroad',
   '{"host":"jobs-ca.silkroad.com","tenant":"Baycrest","boardCode":"Careers"}', true),
  ('Muskoka Algonquin Healthcare', 'muskoka-algonquin-healthcare', 'hospital', 'ON', 'Huntsville',
   'https://www.mahc.ca', 'silkroad',
   '{"host":"jobs-ca.silkroad.com","tenant":"MAHC","boardCode":"MAHCCareers"}', true)
on conflict (slug) do nothing;
```

Fill in `<DATE>` with the actual date you ran Steps 1-2.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the migration is SQL, not exercised by Vitest; this confirms nothing in the working tree broke while this task was open).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0025_seed_silkroad_ontario.sql
git commit -m "feat(silkroad): seed Baycrest and Muskoka Algonquin Healthcare"
```

---

## Self-Review

**Spec coverage:** §3 (architecture/config shape, node-html-parser API constraints) → Tasks 2-4. §4 (data flow, rate limiting) → Task 5. §5 (normalization mapping, both paths) → Task 4, every row has a corresponding assertion. §6 (error handling) → Task 4's throw-on-missing-field tests. §7 (testing) → Tasks 2-4 cover every listed case (short-page via two real fixtures, JSON-LD path, label-fallback path, `CA-` prefix stripping, M/D/YYYY date parsing, city/province fallback, missing-field throws, v1 scope on both fixtures). §8 (pre-flight checklist) → Task 7, one step per checklist item. §9 (seed migration) → Task 7 Step 3.

**Placeholder scan:** no "TBD"/"TODO"/"add appropriate handling" language. Task 1's fixture capture is a runbook rather than fixed file content because the content is externally captured, real data — every step in it is a fully specified, already-validated-once command, with explicit fallback instructions (try a different page/job id) if live content has changed since this plan was written. Task 7's `<DATE>` placeholder is the one deliberate exception: it is filled in from that task's own Step 1-2 output, not left open-ended.

**Type consistency:** `SilkRoadEmployer`, `parseSilkRoadListing`, `extractJsonLd`, `provinceFromIsoRegion`, `fieldByLabel`, `parseLabelLocation`, `parseSilkRoadLabelDate`, `normalizeSilkRoad`, and `createSilkRoadConnector` are named identically everywhere they're defined, exported, and consumed across Tasks 2-6.
