# SmartRecruiters Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `smartrecruiters` ATS connector so Halton Healthcare, University Health Network, West Nipissing General Hospital, and William Osler Health System can be ingested, reusing SmartRecruiters' public Postings API.

**Architecture:** One new connector file (`workers/connectors/smartrecruiters.ts`) following the exact `Connector` interface and file shape every other connector in this repo uses (see `workers/connectors/icims.ts`, `workers/connectors/oraclecloud.ts`): Zod schemas for both API responses, pure exported parse/normalize functions, and a `createSmartRecruitersConnector()` factory. `workers/run.ts` gets one new Zod schema and one new arm on its discriminated union, matching the pattern already used for 11 other platforms there. A seed migration activates employers only after a live pre-flight check — this plan's final task is explicitly a verification runbook, not code, because its content (confirmed company IDs, confirmed `is_active` values) cannot be known until that check runs.

**Tech Stack:** TypeScript, Zod (schema validation), Vitest (tests), Supabase/Postgres (employer registry), no new npm dependencies.

## Global Constraints

- All outbound URLs must be `https://` only — enforced today by `fetchWithBackoff` (throws on non-`https://`) and by `z.url({ protocol: /^https$/ })` on any URL field parsed from vendor JSON.
- Outbound apply/source URLs must never be trusted blindly from vendor JSON without a host check — every existing connector validates the host of any URL it got from the network before using it as `applyUrl`/`sourceUrl`. This connector's `applyUrl` comes from a different domain than its API host, so the check is an allow-list of SmartRecruiters' own apply domains, not an exact-match against `employer.config.host` (documented in Task 3).
- A malformed API response must fail that one posting, never abort the whole run — enforced by parsing every response through Zod and letting `workers/run.ts`'s existing per-item `try/catch` handle the throw.
- Respect `robots.txt` and never bypass a bot-detection challenge (`docs/superpowers/specs/2026-09-08-careportal-phase-1-design.md` §3.2). A seed migration must not set `is_active = true` for any employer that has not had a live pre-flight check confirming this.
- `employers.ats_platform` is a free-text column (no CHECK constraint — confirmed in `supabase/migrations/0001_init.sql`), so adding the new platform value needs no schema migration, only a seed migration.
- No salary or shift-type extraction in v1 (per the approved design spec, §5) — SmartRecruiters has no reliably structured field for either, and guessing from free text risks the same false-positive class of bug documented in `workers/connectors/workday.ts`'s salary-regex comment.

---

## File Structure

- **Create** `fixtures/smartrecruiters/uhn-list.json` — a two-posting SmartRecruiters list-endpoint response, used by the list-parsing tests.
- **Create** `fixtures/smartrecruiters/uhn-detail.json` — a full detail response with every `jobAd.sections` entry present, used by the normalize tests' happy path.
- **Create** `fixtures/smartrecruiters/osler-detail.json` — a detail response with a grouped location name, an empty region, missing `jobAd` sections, and an employment-type label outside `EMPLOYMENT_TYPES` — exercises every fallback/edge branch in one second fixture.
- **Create** `workers/connectors/smartrecruiters.ts` — the connector: types, schemas, pure parse/normalize functions, and the `Connector` factory.
- **Create** `tests/workers/smartrecruiters-normalize.test.ts` — unit tests for every pure function in the file above.
- **Modify** `workers/run.ts` — add `SmartRecruitersAtsConfigSchema`, a new arm on `EmployerRowSchema`'s discriminated union, an import of the connector, `'smartrecruiters'` in the `.in('ats_platform', [...])` filter, and a new `else if` branch in `main()`.
- **Create** `supabase/migrations/0024_seed_smartrecruiters_ontario.sql` — written in Task 6, after and only after the live pre-flight check that task runs.

---

### Task 1: SmartRecruiters fixtures

**Files:**
- Create: `fixtures/smartrecruiters/uhn-list.json`
- Create: `fixtures/smartrecruiters/uhn-detail.json`
- Create: `fixtures/smartrecruiters/osler-detail.json`

**Interfaces:**
- Produces: three JSON fixtures matching SmartRecruiters' public Postings API response shapes (list: `{ offset, limit, totalFound, content: [...] }`; detail: a posting object plus `jobAd.sections`). Tasks 2 and 3 import these by path.

This task has no test cycle of its own — fixtures are data, not code — but every later task's tests depend on exact values here, so write them precisely as given.

- [ ] **Step 1: Create the list fixture**

```json
{
  "offset": 0,
  "limit": 100,
  "totalFound": 2,
  "content": [
    {
      "id": "743999752619427",
      "name": "Registered Nurse - Medicine",
      "refNumber": "RN-24-1182",
      "releasedDate": "2026-09-15T13:22:00.000Z",
      "location": { "city": "Toronto", "region": "Ontario", "country": "ca", "remote": false },
      "department": { "id": "d1", "label": "Nursing" },
      "typeOfEmployment": { "id": "t1", "label": "Full-time" },
      "postingUrl": "https://jobs.smartrecruiters.com/UniversityHealthNetwork/743999752619427-registered-nurse-medicine",
      "applyUrl": "https://jobs.smartrecruiters.com/UniversityHealthNetwork/743999752619427-registered-nurse-medicine?oga=true"
    },
    {
      "id": "743999752619999",
      "name": "Clinical Research Coordinator",
      "refNumber": "CRC-24-0042",
      "releasedDate": "2026-09-14T09:00:00.000Z",
      "location": { "city": "Toronto", "region": "Ontario", "country": "ca", "remote": false },
      "department": { "id": "d2", "label": "Research" },
      "typeOfEmployment": { "id": "t2", "label": "Temporary" },
      "postingUrl": "https://jobs.smartrecruiters.com/UniversityHealthNetwork/743999752619999-clinical-research-coordinator",
      "applyUrl": "https://jobs.smartrecruiters.com/UniversityHealthNetwork/743999752619999-clinical-research-coordinator?oga=true"
    }
  ]
}
```

Save this to `fixtures/smartrecruiters/uhn-list.json`.

- [ ] **Step 2: Create the UHN detail fixture (every `jobAd` section present)**

```json
{
  "id": "743999752619427",
  "name": "Registered Nurse - Medicine",
  "refNumber": "RN-24-1182",
  "releasedDate": "2026-09-15T13:22:00.000Z",
  "location": { "city": "Toronto", "region": "Ontario", "country": "ca", "remote": false },
  "department": { "id": "d1", "label": "Nursing" },
  "typeOfEmployment": { "id": "t1", "label": "Full-time" },
  "postingUrl": "https://jobs.smartrecruiters.com/UniversityHealthNetwork/743999752619427-registered-nurse-medicine",
  "applyUrl": "https://jobs.smartrecruiters.com/UniversityHealthNetwork/743999752619427-registered-nurse-medicine?oga=true",
  "jobAd": {
    "sections": {
      "companyDescription": {
        "title": "Company Description",
        "text": "<p>University Health Network (UHN) is Canada's #1 hospital and the world's #1 publicly funded hospital for research impact.</p>"
      },
      "jobDescription": {
        "title": "Job Description",
        "text": "<p>The Registered Nurse provides direct patient care on the Medicine unit.</p>"
      },
      "qualifications": {
        "title": "Qualifications",
        "text": "<ul><li>Current registration with the College of Nurses of Ontario</li><li>BScN preferred</li></ul>"
      },
      "additionalInformation": {
        "title": "Additional Information",
        "text": "<p>UHN is an equal opportunity employer.</p>"
      }
    }
  }
}
```

Save this to `fixtures/smartrecruiters/uhn-detail.json`.

- [ ] **Step 3: Create the Osler detail fixture (edge cases: grouped location, empty region, missing sections, unmapped employment type)**

```json
{
  "id": "811122233344",
  "name": "Patient Care Assistant",
  "refNumber": "PCA-1029",
  "releasedDate": "2026-09-10T08:00:00.000Z",
  "location": { "city": "GTA", "region": "", "country": "ca", "remote": false },
  "department": { "id": "d9", "label": "Patient Care" },
  "typeOfEmployment": { "id": "t9", "label": "Student" },
  "postingUrl": "https://jobs.smartrecruiters.com/williamoslerhealthsystem1/811122233344-patient-care-assistant",
  "applyUrl": "https://jobs.smartrecruiters.com/williamoslerhealthsystem1/811122233344-patient-care-assistant?oga=true",
  "jobAd": {
    "sections": {
      "jobDescription": {
        "title": "Job Description",
        "text": "<p>Supports patient care activities under supervision of regulated staff.</p>"
      }
    }
  }
}
```

Save this to `fixtures/smartrecruiters/osler-detail.json`. Note what makes this fixture deliberately different from UHN's: `location.city` is a grouped name ("GTA") rather than a real city, `location.region` is empty, only `jobDescription` is present under `jobAd.sections`, and `typeOfEmployment.label` ("Student") is not one of `full_time`/`part_time`/`casual`/`temporary`/`contract`.

- [ ] **Step 4: Commit**

```bash
git add fixtures/smartrecruiters/
git commit -m "test: add SmartRecruiters API fixtures for UHN and Osler"
```

---

### Task 2: List parsing

**Files:**
- Create: `workers/connectors/smartrecruiters.ts` (started here, extended in Task 3)
- Test: `tests/workers/smartrecruiters-normalize.test.ts` (started here, extended in Task 3)

**Interfaces:**
- Consumes: `JobStub` from `@/lib/types` (`{ sourceJobId: string; externalPath: string; title: string; locationsText: string; postedAt?: Date; listFields?: Record<string,string> }`).
- Produces: `parseSmartRecruitersList(payload: unknown): JobStub[]`, exported for Task 2's test and for the `fetchPage` wiring in Task 4.

- [ ] **Step 1: Write the failing test for list parsing**

Create `tests/workers/smartrecruiters-normalize.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest';
import uhnList from '@/fixtures/smartrecruiters/uhn-list.json';
import { parseSmartRecruitersList } from '@/workers/connectors/smartrecruiters';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/workers/smartrecruiters-normalize.test.ts`
Expected: FAIL — `workers/connectors/smartrecruiters.ts` does not exist yet, so the import throws.

- [ ] **Step 3: Create `workers/connectors/smartrecruiters.ts` with types, the list schema, and `parseSmartRecruitersList`**

```ts
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * SmartRecruiters career sites (careers.smartrecruiters.com/<company>). Unlike most connectors
 * here, SmartRecruiters publishes an official public JSON API for postings
 * (api.smartrecruiters.com/v1/companies/{companyId}/postings), so this connector calls that
 * directly rather than scraping the hosted career page.
 */
export type SmartRecruitersEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    /** SmartRecruiters company identifier, e.g. "UniversityHealthNetwork". */
    key: string;
    /** Always "api.smartrecruiters.com" today; kept explicit rather than hardcoded so the
     *  registry row schema in workers/run.ts validates it like every other platform's host. */
    host: string;
    /** Grouped location names the board uses ("GTA") mapped onto one real city. */
    cityAliases?: Record<string, string>;
  };
};

const LocationSchema = z.object({
  city: z.string().default(''),
  region: z.string().default(''),
});

const ListItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  releasedDate: z.string().min(1),
  location: LocationSchema.default({ city: '', region: '' }),
});

const ListSchema = z.object({
  totalFound: z.number().optional(),
  content: z.array(ListItemSchema).default([]),
});

export function parseSmartRecruitersList(payload: unknown): JobStub[] {
  const parsed = ListSchema.parse(payload);
  return parsed.content.map((item) => {
    const postedAt = new Date(item.releasedDate);
    return {
      sourceJobId: item.id,
      // SmartRecruiters' detail fetch is built from the id alone (see createSmartRecruitersConnector
      // in Task 4), so this is informational only -- the same role externalPath plays for Oracle
      // Cloud postings, which also rebuild their detail URL from sourceJobId rather than this path.
      externalPath: `/postings/${item.id}`,
      title: item.name,
      locationsText: [item.location.city, item.location.region].filter(Boolean).join(', '),
      postedAt: Number.isNaN(postedAt.getTime()) ? undefined : postedAt,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/workers/smartrecruiters-normalize.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add workers/connectors/smartrecruiters.ts tests/workers/smartrecruiters-normalize.test.ts
git commit -m "feat(smartrecruiters): add list-endpoint parsing"
```

---

### Task 3: Detail normalization

**Files:**
- Modify: `workers/connectors/smartrecruiters.ts`
- Modify: `tests/workers/smartrecruiters-normalize.test.ts`

**Interfaces:**
- Consumes: `SmartRecruitersEmployer` and `ListSchema`/`LocationSchema` from Task 2 (same file); `sanitizeDescription` from `@/lib/normalize/sanitize`; `provinceCodeFromName` from `@/lib/provinces`; `EMPLOYMENT_TYPES`/`EmploymentType`/`NormalizedPosting` from `@/lib/types`.
- Produces: `employmentTypeFromSmartRecruiters(label?: string): EmploymentType | undefined`, `combineJobAdSections(jobAd: SmartRecruitersDetail['jobAd']): string`, `normalizeSmartRecruiters(raw: unknown, employer: SmartRecruitersEmployer): NormalizedPosting`, and the exported type `SmartRecruitersDetail`. Task 4's `createSmartRecruitersConnector` calls `normalizeSmartRecruiters` directly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/workers/smartrecruiters-normalize.test.ts` (keep the existing `parseSmartRecruitersList` describe block above these):

```ts
import oslerDetail from '@/fixtures/smartrecruiters/osler-detail.json';
import uhnDetail from '@/fixtures/smartrecruiters/uhn-detail.json';
import {
  normalizeSmartRecruiters,
  employmentTypeFromSmartRecruiters,
  combineJobAdSections,
} from '@/workers/connectors/smartrecruiters';
import type { SmartRecruitersEmployer } from '@/workers/connectors/smartrecruiters';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/workers/smartrecruiters-normalize.test.ts`
Expected: FAIL — `normalizeSmartRecruiters`, `employmentTypeFromSmartRecruiters`, and `combineJobAdSections` are not exported yet.

- [ ] **Step 3: Append the detail schema, helpers, and `normalizeSmartRecruiters` to `workers/connectors/smartrecruiters.ts`**

```ts
const JobAdSectionSchema = z.object({
  title: z.string().optional(),
  text: z.string().min(1),
});

const JobAdSchema = z.object({
  sections: z.object({
    companyDescription: JobAdSectionSchema.optional(),
    jobDescription: JobAdSectionSchema.optional(),
    qualifications: JobAdSectionSchema.optional(),
    additionalInformation: JobAdSectionSchema.optional(),
  }).default({}),
});

const DetailSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  releasedDate: z.string().min(1),
  location: LocationSchema.default({ city: '', region: '' }),
  typeOfEmployment: z.object({ label: z.string() }).optional(),
  // Outbound URLs are built from vendor JSON here, never user input (plan Global Constraints).
  // z.url() with a protocol restriction rejects javascript:/data:/http: the same way every
  // other connector's URL field does.
  applyUrl: z.url({ protocol: /^https$/ }),
  jobAd: JobAdSchema.optional(),
});
export type SmartRecruitersDetail = z.infer<typeof DetailSchema>;

/**
 * SmartRecruiters serves postings from api.smartrecruiters.com but apply links live on a
 * DIFFERENT SmartRecruiters-owned domain -- so this is an allow-list of known apply hosts,
 * not an exact match against employer.config.host like every other connector's requireHost.
 */
const ALLOWED_APPLY_HOSTS = ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com'];

function requireAllowedApplyHost(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_APPLY_HOSTS.includes(parsed.host)) {
    throw new Error(`applyUrl "${url}" is not on an allowed SmartRecruiters domain`);
  }
}

export function employmentTypeFromSmartRecruiters(label?: string): EmploymentType | undefined {
  if (!label) return undefined;
  const v = label.toLowerCase();
  if (/casual/.test(v)) return 'casual';
  if (/temporary|temp\b/.test(v)) return 'temporary';
  if (/full.?time/.test(v)) return 'full_time';
  if (/part.?time/.test(v)) return 'part_time';
  if (/contract/.test(v)) return 'contract';
  return undefined;
}

/**
 * companyDescription is included despite being generic marketing boilerplate repeated across
 * every posting -- full fidelity to what a seeker sees on the real posting page, not a trimmed
 * subset (design spec §5, decision #5). Missing sections are skipped, never inferred.
 */
const SECTION_ORDER: Array<[key: keyof NonNullable<SmartRecruitersDetail['jobAd']>['sections'], fallbackHeading: string]> = [
  ['companyDescription', 'About'],
  ['jobDescription', 'Job Description'],
  ['qualifications', 'Qualifications'],
  ['additionalInformation', 'Additional Information'],
];

export function combineJobAdSections(jobAd: SmartRecruitersDetail['jobAd']): string {
  if (!jobAd) return '';
  const parts: string[] = [];
  for (const [key, fallbackHeading] of SECTION_ORDER) {
    const section = jobAd.sections[key];
    if (!section?.text) continue;
    parts.push(`<h3>${section.title || fallbackHeading}</h3>${section.text}`);
  }
  return parts.join('');
}

export function normalizeSmartRecruiters(raw: unknown, employer: SmartRecruitersEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  requireAllowedApplyHost(detail.applyUrl);

  const postedAt = new Date(detail.releasedDate);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable releasedDate "${detail.releasedDate}" for ${detail.id}`);
  }

  const cityKey = detail.location.city;
  const city = employer.config.cityAliases?.[cityKey] ?? (cityKey || employer.defaultCity);
  const province = detail.location.region
    ? provinceCodeFromName(detail.location.region) ?? employer.province
    : employer.province;

  return {
    sourceId: `smartrecruiters:${employer.config.key}`,
    sourceJobId: detail.id,
    sourceUrl: detail.applyUrl,
    title: detail.name,
    employerName: employer.name,
    description: sanitizeDescription(combineJobAdSections(detail.jobAd)),
    city,
    province,
    postedAt,
    employmentType: employmentTypeFromSmartRecruiters(detail.typeOfEmployment?.label),
    applyUrl: detail.applyUrl,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/workers/smartrecruiters-normalize.test.ts`
Expected: PASS (all tests in the file, list-parsing tests from Task 2 included)

- [ ] **Step 5: Commit**

```bash
git add workers/connectors/smartrecruiters.ts tests/workers/smartrecruiters-normalize.test.ts
git commit -m "feat(smartrecruiters): add detail normalization"
```

---

### Task 4: Connector factory

**Files:**
- Modify: `workers/connectors/smartrecruiters.ts`

**Interfaces:**
- Consumes: `parseSmartRecruitersList` and `normalizeSmartRecruiters` from this same file (Tasks 2–3); `Connector` from `./types`; `createHostLimiter`/`fetchWithBackoff` from `@/workers/ratelimit`; `SITE` from `@/lib/site`; `log`/`LogContext` from `@/workers/logger`.
- Produces: `createSmartRecruitersConnector(employer: SmartRecruitersEmployer, ctx: LogContext): Connector`, consumed by `workers/run.ts` in Task 5.

No new unit test in this task: `fetchPage`/`hydrate` are I/O, and no existing connector (`icims.ts`, `oraclecloud.ts`, `workday.ts`) unit-tests its factory function either — only the pure parse/normalize functions, already covered in Tasks 2–3. This task is verified by typecheck and the full existing test suite still passing.

- [ ] **Step 1: Append the factory to `workers/connectors/smartrecruiters.ts`**

```ts
const LIST_PAGE_SIZE = 100;
const limit = createHostLimiter();

export function createSmartRecruitersConnector(employer: SmartRecruitersEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent, Accept: 'application/json' };
  const api = `https://${host}/v1/companies/${key}`;

  return {
    id: `smartrecruiters:${key}`,
    kind: 'ats',
    // One detail fetch per posting, and postings don't change once published, so known ones
    // are only marked as seen -- same reasoning as iCIMS and Oracle Cloud.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      const offset = cursor ? Number(cursor) : 0;
      const url = `${api}/postings?limit=${LIST_PAGE_SIZE}&offset=${offset}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);

      const items = parseSmartRecruitersList(await res.json());
      log(ctx, 'info', 'fetched list page', { offset, returned: items.length });

      // Stop on a short page, not on `totalFound` -- the same lesson already learned from
      // Workday (workers/connectors/workday.ts): a vendor's own total can go stale mid-crawl.
      const hasMore = items.length === LIST_PAGE_SIZE;
      return { items, nextCursor: hasMore ? String(offset + LIST_PAGE_SIZE) : undefined };
    },

    async hydrate(stub) {
      const url = `${api}/postings/${stub.sourceJobId}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return res.json();
    },

    normalize(raw: unknown) {
      return normalizeSmartRecruiters(raw, employer);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all test files pass, including `tests/workers/smartrecruiters-normalize.test.ts`

- [ ] **Step 4: Commit**

```bash
git add workers/connectors/smartrecruiters.ts
git commit -m "feat(smartrecruiters): add connector factory"
```

---

### Task 5: Wire into the ingest runner

**Files:**
- Modify: `workers/run.ts`

**Interfaces:**
- Consumes: `createSmartRecruitersConnector`, `type SmartRecruitersEmployer` from `@/workers/connectors/smartrecruiters` (Task 4).
- Produces: `workers/run.ts`'s `main()` now ingests `ats_platform = 'smartrecruiters'` employers the same way it ingests the other 11 platforms.

- [ ] **Step 1: Add the import**

In `workers/run.ts`, add this line alongside the other connector imports (after the `successfactors-mb` import, before `phenom`, to keep the existing alphabetical-ish grouping intact):

```ts
import { createSmartRecruitersConnector, type SmartRecruitersEmployer } from '@/workers/connectors/smartrecruiters';
```

- [ ] **Step 2: Add the config schema**

Add this schema in `workers/run.ts` right after `BcHealthJobsAtsConfigSchema` (around line 95), matching its `key`+`host` shape plus the optional `cityAliases` from `BoardAtsConfigSchema`:

```ts
/** SmartRecruiters: the API host is constant, the company identifier (`key`) is per tenant. */
const SmartRecruitersAtsConfigSchema = z.object({
  key: z.string().min(1),
  host: z.string().min(1),
  cityAliases: z.record(z.string(), z.string()).optional(),
});
```

- [ ] **Step 3: Add the discriminated-union arm**

In `EmployerRowSchema`'s array (around line 111), add this line after the `oraclecloud` arm:

```ts
  EmployerBaseSchema.extend({ ats_platform: z.literal('smartrecruiters'), ats_config: SmartRecruitersAtsConfigSchema }),
```

- [ ] **Step 4: Add the platform to the active-employers query**

In `main()`, the `.in('ats_platform', [...])` array (around line 323) lists every platform `main()` knows how to ingest. Add `'smartrecruiters'` to it:

```ts
    .in('ats_platform', ['workday', 'taleo', 'icims', 'jibe', 'successfactors', 'successfactors_mb', 'bchealthjobs', 'wpjobmanager', 'talentpoolbuilder', 'phenom', 'oraclecloud', 'smartrecruiters']);
```

- [ ] **Step 5: Add the branch in the platform dispatch**

The dispatch in `main()` is an `if`/`else if`/.../`else` chain ending with `oraclecloud` as the bare `else`. Adding a 12th platform means `oraclecloud` needs its own explicit `else if` so the chain still fails closed on an unrecognized platform rather than silently treating it as Oracle Cloud. Replace:

```ts
    } else {
      const employer: OracleCloudEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `oraclecloud:${employer.config.key}`;
      createConnector = (ctx) => createOracleCloudConnector(employer, ctx);
    }
```

with:

```ts
    } else if (parsed.data.ats_platform === 'oraclecloud') {
      const employer: OracleCloudEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `oraclecloud:${employer.config.key}`;
      createConnector = (ctx) => createOracleCloudConnector(employer, ctx);
    } else {
      const employer: SmartRecruitersEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `smartrecruiters:${employer.config.key}`;
      createConnector = (ctx) => createSmartRecruitersConnector(employer, ctx);
    }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`parsed.data.ats_platform === 'oraclecloud'` must narrow `parsed.data.ats_config` to `OracleCloudAtsConfigSchema`'s inferred type inside that branch, and the final `else` must narrow to `SmartRecruitersAtsConfigSchema`'s type — if either narrowing fails, the discriminated union in Step 3 was not added correctly.)

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass (this file has no dedicated test suite today — confirmed by `tests/workers/` containing no `run.test.ts` — so this step only guards against a regression in another file).

- [ ] **Step 8: Commit**

```bash
git add workers/run.ts
git commit -m "feat(smartrecruiters): wire connector into the ingest runner"
```

---

### Task 6: Live pre-flight check and seed migration

**Files:**
- Create: `supabase/migrations/0024_seed_smartrecruiters_ontario.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks directly — this is a verification runbook, not code. Its output (which employers are confirmed safe to activate) determines the content of the migration.

This task cannot be completed in the same sitting as Tasks 1–5 unless network tools are available right now — per the approved design spec (§8) and this project's own precedent (`supabase/migrations/0023_seed_workday_ontario_expansion.sql`, which seeded two of three candidate hospitals active and one inactive based on exactly this kind of live check), no employer goes into the registry as `is_active = true` without this check having actually run. If network tools are unavailable when you reach this task, stop here and resume it later — do not guess at the results.

- [ ] **Step 1: Confirm each company's SmartRecruiters identifier**

The careers-page slugs from `docs/research/ontario-hospitals-ats.md` are candidates, not confirmed API identifiers:

| Hospital | Candidate `key` |
|---|---|
| Halton Healthcare | `HaltonHealthcare1` |
| University Health Network | `UniversityHealthNetwork` |
| West Nipissing General Hospital | `WestNipissingGeneralHospital` |
| William Osler Health System | `williamoslerhealthsystem1` |

For each, run:

```bash
UA="MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:jelanshahi6@gmail.com)"
curl -s -w "\n[HTTP %{http_code}]\n" "https://api.smartrecruiters.com/v1/companies/<candidate-key>/postings?limit=1" -A "$UA"
```

A `200` with a JSON body containing `"content"` confirms the `key`. A `404` means the candidate slug is wrong — check the actual careers page (`https://careers.smartrecruiters.com/<candidate-key>`) for the real slug and retry.

- [ ] **Step 2: Check for a bot challenge**

For each confirmed `key`, inspect the response body from Step 1. A real postings JSON body (even an empty `"content": []`) means no bot challenge. An HTML response, a Cloudflare challenge page, or a non-JSON body means that employer is blocked — treat it the same as Alberta Health Services (`supabase/migrations/0010_seed_alberta_employers.sql`): seed it `is_active = false` with a comment stating what blocked it.

- [ ] **Step 3: Check robots.txt**

```bash
curl -s "https://api.smartrecruiters.com/robots.txt" -A "$UA"
curl -s "https://careers.smartrecruiters.com/robots.txt" -A "$UA"
```

If either disallows a path this connector actually uses (`/v1/companies/` or the specific company path), treat the affected employer(s) as blocked — same reasoning as Peterborough Regional in `0023_seed_workday_ontario_expansion.sql`, where a technically-answering endpoint was still kept inactive because robots.txt disallowed it.

- [ ] **Step 4: Check SmartRecruiters' API terms of use**

Read SmartRecruiters' published API terms (linked from `developers.smartrecruiters.com`) for any restriction on caching, storing, or redistributing posting content. If a restriction exists that this pipeline would violate, do not activate any SmartRecruiters employer — document the finding in the migration's comment the way `0019_seed_quebec_wpjobmanager.sql` documents the Santé Québec licensing question, and leave all four rows `is_active = false`.

- [ ] **Step 5: Confirm the rate limit**

Check SmartRecruiters' published rate limit for the public Postings API. If it's tighter than the connector's default 1 request/second/host (`MIN_INTERVAL_MS` in `workers/ratelimit.ts`), pass a slower interval explicitly when constructing the limiter in `workers/connectors/smartrecruiters.ts`'s `createSmartRecruitersConnector` (change `createHostLimiter()` to `createHostLimiter(<ms>)`) before activating any employer.

- [ ] **Step 6: Confirm the real `applyUrl` domain**

From the Step 1 responses, check the actual `applyUrl` values returned. If they use a domain other than `jobs.smartrecruiters.com` or `careers.smartrecruiters.com`, update `ALLOWED_APPLY_HOSTS` in `workers/connectors/smartrecruiters.ts` to match before activating any employer, and re-run `npx vitest run tests/workers/smartrecruiters-normalize.test.ts` to confirm the host-rejection tests still pass against the fixtures.

- [ ] **Step 7: Write the seed migration**

Using the confirmed `key` values and the active/inactive decision from Steps 2–6 for each of the four hospitals, write `supabase/migrations/0024_seed_smartrecruiters_ontario.sql` following the exact structure of `supabase/migrations/0023_seed_workday_ontario_expansion.sql`: a comment block stating what was checked and when, per-employer notes for any employer kept inactive (naming the specific reason, not a generic "pending check"), then the `insert into employers (...) values (...) on conflict (slug) do nothing;` statement. Use `facility_type = 'hospital'`, `province = 'ON'`, `ats_platform = 'smartrecruiters'`, and `ats_config` of the form `{"key":"<confirmed key>","host":"api.smartrecruiters.com"}` (add `"cityAliases":{...}` only for an employer where Step 1's response showed a grouped location name needing one, as William Osler's design-spec discussion anticipated with its multi-site locations).

Slugs to use: `halton-healthcare`, `university-health-network`, `west-nipissing-general-hospital`, `william-osler-health-system`.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests pass (the migration is SQL, not exercised by Vitest, but this confirms nothing in the working tree broke while this task was open).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0024_seed_smartrecruiters_ontario.sql
git commit -m "feat(smartrecruiters): seed Ontario SmartRecruiters employers after pre-flight check"
```

---

## Self-Review

**Spec coverage:** §3 (architecture/config shape) → Task 2–3. §4 (data flow) → Task 4. §5 (normalization mapping table) → Task 3, every row has a corresponding assertion. §6 (error handling) → Task 3's rejection tests. §7 (testing) → Tasks 2–3 cover every listed case (pagination via short-page logic in Task 4's `hasMore`, employment-type table, missing-section concatenation, host-mismatch rejection, city/province fallback). §8 (pre-flight checklist) → Task 6, one step per checklist item. §9 (seed migration) → Task 6 Step 7.

**Placeholder scan:** no "TBD"/"TODO"/"add appropriate handling" language. Task 6 is necessarily a runbook rather than fixed code because its content depends on a live check that hasn't run yet — every step in it is a fully specified command plus an explicit decision rule, not an open-ended instruction.

**Type consistency:** `SmartRecruitersEmployer`, `SmartRecruitersDetail`, `parseSmartRecruitersList`, `normalizeSmartRecruiters`, `employmentTypeFromSmartRecruiters`, `combineJobAdSections`, and `createSmartRecruitersConnector` are named identically everywhere they're defined, exported, and consumed across Tasks 2–5.
