# CarePortal Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, server-rendered site where anyone can search ~197 live Ontario hospital jobs and click through to the employer's own application page.

**Architecture:** A GitHub Actions cron runs a standalone TypeScript ingester that calls three Workday tenants' public JSON endpoints, validates every payload with Zod, sanitizes descriptions, and upserts into an immutable `raw_postings` table. A matcher then fingerprints and projects those rows into a canonical `jobs` table. A Next.js App Router site reads `jobs` in server components. `jobs` is a rebuildable projection; `raw_postings` is the source of truth.

**Tech Stack:** Next.js (App Router, TypeScript strict) · Supabase Postgres · Tailwind v4 · Zod · `sanitize-html` · Vitest · `tsx` · GitHub Actions · Vercel

**Source spec:** `docs/superpowers/specs/2026-09-08-careportal-phase-1-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **TypeScript strict mode.** No `any` at module boundaries. Parse external data with Zod rather than casting.
- **Service role key** lives only in GitHub Actions secrets and Vercel server-side env. Never in any file under `app/`. Never in a `NEXT_PUBLIC_*` variable.
- **RLS enabled on every table.** `jobs` gets public read restricted to `is_active = true`. `raw_postings`, `ingest_runs`, and `employers` get no anon policy at all.
- **HTML sanitize allow-list, exactly:** `p, br, ul, ol, li, strong, em, h3, h4`. No attributes. No `a`, `script`, `style`, or `iframe`.
- **Rate limiter:** one shared limiter, minimum 1000ms between requests to the same host, exponential backoff on 429/5xx.
- **User-Agent** on every outbound request must include a contact URL, read from `lib/site.ts`. Never hardcoded.
- **Outbound URLs** are built from the `employers` registry only, never from user input. `https:` only.
- **Search params** are Zod-parsed and bounded server-side: `limit` capped at **50**, offset bounded, `category` validated against the enum.
- **Freshness:** unseen for **7 days** → `is_active = false`. `expires_at = posted_at + 60 days` minimum. Hard-expire regardless.
- **External apply links:** `rel="noopener noreferrer nofollow"` and `target="_blank"`.
- **No auth code exists in Phase 1** — this is what guarantees the no-login-wall condition.
- **Ingestion is idempotent.** Upsert on `(source_id, source_job_id)`; compare `content_hash` to decide whether anything changed. Every run writes an `ingest_runs` row. One connector failing never aborts the others.
- **Accessibility floor:** responsive to 360px, visible focus rings, WCAG AA contrast, real `<label>`s, keyboard-navigable results, `prefers-reduced-motion` respected.
- **Palette, exact values:**
  `--ink #14181C` · `--paper #FBFAF7` · `--slate #5B6670` · `--rule #E2E1DC` · `--signal #0F5C4A` · `--flag #C2410C`
- **Copy rule:** label things the way a job seeker says them ("Nights", not `shift_type: night`). Buttons name their outcome ("Apply on Scarborough Health Network", not "Apply now").

### Verified constants (from spec §12 — do not re-derive)

```
List:   POST https://{tenant}.wd10.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
        body: { "appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "" }
Detail: GET  https://{tenant}.wd10.myworkdayjobs.com/wday/cxs/{tenant}/{site}{externalPath}
```

`externalPath` already starts with `/job/` — append it directly, do not prefix again.

| Employer | tenant | site | default city |
|---|---|---|---|
| Scarborough Health Network | `shn` | `SHN_External_Career_Site` | Toronto |
| CHEO | `cheo` | `External_Site` | Ottawa |
| Oak Valley Health | `oakvalleyhealth` | `OakValleyHealth` | Markham |

### Two payload facts that drive the design

1. **The list response is a stub.** It carries only `title`, `externalPath`, `locationsText`, `postedOn` (a *relative string* — never parse it), and `bulletFields`. Everything else requires the detail fetch. This is why `Connector` has a `hydrate()` step.
2. **There is no city field.** `jobPostingInfo.location` is a facility string — `"1940 Eglinton Ave"`, `"General Hospital"`, `"5 Locations"`. City therefore comes from the employer registry (`employers.default_city`), and the raw location string is stored as `facility_name`. This is a schema addition beyond the original spec §5, discovered during Step 0 verification.

---

## File Structure

```
app/
  layout.tsx                    root layout, fonts, header
  page.tsx                      search page (the home page)
  globals.css                   Tailwind v4 import + @theme tokens
  jobs/[slug]/page.tsx          job detail + JSON-LD + 410 on expired
  about/page.tsx                connector contact page (required)
components/
  JobCard.tsx                   one result row
  SearchForm.tsx                keyword + city + category inputs
  Pagination.tsx                prev/next links
lib/
  site.ts                       ALL brand strings — single rename point
  types.ts                      NormalizedPosting, JobStub, enums
  db/server.ts                  anon client for RSC reads
  db/admin.ts                   service-role client (workers only)
  schemas/search-params.ts      Zod parsing + bounding of query params
  normalize/title.ts            normalizeTitle + alias map
  normalize/fingerprint.ts      fingerprint()
  normalize/sanitize.ts         sanitizeDescription()
  taxonomy/categories.ts        Category enum
  taxonomy/classify.ts          rule-based title -> category
workers/
  connectors/types.ts           Connector interface
  connectors/workday.ts         the one platform connector
  ratelimit.ts                  shared per-host limiter + backoff
  logger.ts                     structured logging with source_id/run_id
  run.ts                        orchestrator, writes ingest_runs
  dedupe.ts                     raw_postings -> jobs projection
  expire.ts                     the three freshness rules
supabase/migrations/
  0001_init.sql
  0002_rls.sql
  0003_seed_employers.sql
fixtures/workday/
  shn-list.json, shn-detail.json, cheo-detail.json, oakvalley-detail.json
tests/
  (mirrors lib/ and workers/)
.github/workflows/ingest.yml
```

---

### Task 1: Project scaffold and brand config

Scaffolds Next.js, installs everything, and creates the single module every brand string comes from. `create-next-app` refuses to run in a directory containing `docs/`, so it scaffolds into a temp subdirectory and the files are moved up.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (all via scaffold)
- Create: `lib/site.ts`, `vitest.config.ts`, `.env.local.example`
- Test: `tests/lib/site.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `SITE` — `{ name: string; tagline: string; url: string; contactUrl: string; contactEmail: string; userAgent: string }`

- [ ] **Step 1: Scaffold Next.js into a temp directory**

```bash
npx create-next-app@latest .scaffold-tmp --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Move the scaffold up and delete the temp directory**

```bash
mv .scaffold-tmp/* .scaffold-tmp/.[!.]* . 2>/dev/null || true
rm -rf .scaffold-tmp
ls package.json tsconfig.json app/layout.tsx
```

Expected: all three paths listed, no errors. If `.gitignore` was overwritten, re-add `.env.local` and `.vercel` to it.

- [ ] **Step 3: Install runtime and dev dependencies**

```bash
npm install zod @supabase/supabase-js sanitize-html
npm install -D vitest tsx @types/sanitize-html
```

- [ ] **Step 4: Confirm TypeScript strict mode is on**

Open `tsconfig.json` and confirm `"strict": true` under `compilerOptions`. Add it if absent.

- [ ] **Step 5: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
```

Add to `package.json` `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 6: Write the failing test**

Create `tests/lib/site.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SITE } from '@/lib/site';

describe('site config', () => {
  it('derives the contact URL from the site URL', () => {
    expect(SITE.contactUrl).toBe(`${SITE.url}/about`);
  });

  it('exposes a User-Agent that carries the contact URL', () => {
    expect(SITE.userAgent).toContain(SITE.contactUrl);
    expect(SITE.userAgent).toMatch(/^\S+\/\d/);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '@/lib/site'`

- [ ] **Step 8: Write the implementation**

Create `lib/site.ts`. **This is the only file in the repo permitted to contain the brand name as a literal.**

```ts
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const SITE = {
  name: 'CarePortal',
  tagline: 'Healthcare jobs across Ontario',
  url: SITE_URL,
  contactUrl: `${SITE_URL}/about`,
  contactEmail: 'hello@careportal.invalid',
  userAgent: `CarePortalBot/0.1 (+${SITE_URL}/about)`,
} as const;
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 2 tests.

- [ ] **Step 10: Add the env template**

Create `.env.local.example`:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 11: Verify the app builds**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with brand config module"
```

---

### Task 2: Title normalization and fingerprinting

Pure functions, no I/O. This is the dedupe key the whole matcher rests on.

**Files:**
- Create: `lib/types.ts`, `lib/normalize/title.ts`, `lib/normalize/fingerprint.ts`
- Test: `tests/lib/normalize/title.test.ts`, `tests/lib/normalize/fingerprint.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `normalizeTitle(raw: string): string`
  - `fingerprint(input: { title: string; employerKey: string; city: string; province: string }): string` — returns a 64-char lowercase hex sha256
  - Types `ProvinceCode`, `EmploymentType`, `ShiftType`, `NormalizedPosting`, `JobStub`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/normalize/title.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/lib/normalize/title';

describe('normalizeTitle', () => {
  it('strips requisition noise and expands abbreviations', () => {
    expect(normalizeTitle('RN - Emergency (Req #12345)')).toBe('registered nurse emergency');
  });

  it('strips parenthesised site codes', () => {
    expect(normalizeTitle('Registered Nurse - Hemodialysis Unit - CP2 (GEN)'))
      .toBe('registered nurse hemodialysis unit cp2');
  });

  it('expands support-care abbreviations', () => {
    expect(normalizeTitle('PSW - Nights')).toBe('personal support worker nights');
  });

  it('strips accents', () => {
    expect(normalizeTitle('Registered Nurse — Médecine')).toBe('registered nurse medecine');
  });

  it('collapses whitespace and punctuation', () => {
    expect(normalizeTitle('  Unit   Secretary,,, Clinics  ')).toBe('unit secretary clinics');
  });
});
```

Create `tests/lib/normalize/fingerprint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fingerprint } from '@/lib/normalize/fingerprint';

const base = { title: 'RN - Emergency (Req #12345)', employerKey: 'shn', city: 'Toronto', province: 'ON' };

describe('fingerprint', () => {
  it('returns a 64-char hex digest', () => {
    expect(fingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches across differently formatted titles for the same job', () => {
    const other = { ...base, title: 'Registered Nurse, Emergency (Req #99999)' };
    expect(fingerprint(other)).toBe(fingerprint(base));
  });

  it('is insensitive to employer and city casing', () => {
    expect(fingerprint({ ...base, employerKey: 'SHN', city: 'toronto' })).toBe(fingerprint(base));
  });

  it('differs when the city differs', () => {
    expect(fingerprint({ ...base, city: 'Ottawa' })).not.toBe(fingerprint(base));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/normalize/title`.

- [ ] **Step 3: Write `lib/types.ts`**

```ts
export const PROVINCE_CODES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const EMPLOYMENT_TYPES = ['full_time','part_time','casual','temporary','contract'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SHIFT_TYPES = ['day','evening','night','rotating','weekend'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

/** Thin record from a list endpoint, before hydration. */
export type JobStub = {
  sourceJobId: string;
  externalPath: string;
  title: string;
  locationsText: string;
};

/** The single shape the rest of the system knows about. */
export type NormalizedPosting = {
  sourceId: string;
  sourceJobId: string;
  sourceUrl: string;
  title: string;
  employerName: string;
  facilityName?: string;
  description: string;
  city: string;
  province: ProvinceCode;
  postedAt: Date;
  closesAt?: Date;
  employmentType?: EmploymentType;
  shiftType?: ShiftType;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'year';
  nocCode?: string;
  applyUrl: string;
};
```

- [ ] **Step 4: Write `lib/normalize/title.ts`**

```ts
const ALIASES: Record<string, string> = {
  rn: 'registered nurse',
  rpn: 'registered practical nurse',
  lpn: 'licensed practical nurse',
  np: 'nurse practitioner',
  psw: 'personal support worker',
  hca: 'health care aide',
  ot: 'occupational therapist',
  pt: 'physiotherapist',
  rt: 'respiratory therapist',
  mlt: 'medical laboratory technologist',
  mrt: 'medical radiation technologist',
  slp: 'speech language pathologist',
};

export function normalizeTitle(raw: string): string {
  const withoutBrackets = raw.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const deaccented = withoutBrackets.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lowered = deaccented.toLowerCase();
  const withoutReq = lowered.replace(/\breq\s*#?\s*\d+/g, ' ').replace(/\bjr\d+\b/g, ' ');
  const wordsOnly = withoutReq.replace(/[^a-z0-9]+/g, ' ');
  return wordsOnly
    .split(' ')
    .filter(Boolean)
    .map((token) => ALIASES[token] ?? token)
    .join(' ');
}
```

- [ ] **Step 5: Write `lib/normalize/fingerprint.ts`**

```ts
import { createHash } from 'node:crypto';
import { normalizeTitle } from './title';

export type FingerprintInput = {
  title: string;
  employerKey: string;
  city: string;
  province: string;
};

export function fingerprint(input: FingerprintInput): string {
  const parts = [
    normalizeTitle(input.title),
    input.employerKey.trim().toLowerCase(),
    input.city.trim().toLowerCase(),
    input.province.trim().toUpperCase(),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 11 tests total.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add title normalization and fingerprinting"
```

---

### Task 3: HTML sanitizer

Job descriptions are third-party HTML and the main attack surface. Sanitize once, at ingest, and store the clean output.

Real payloads contain double-encoded newlines (`&amp;#xa;`), so those are converted to `<br />` before sanitizing.

**Files:**
- Create: `lib/normalize/sanitize.ts`
- Test: `tests/lib/normalize/sanitize.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `sanitizeDescription(dirty: string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/normalize/sanitize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizeDescription } from '@/lib/normalize/sanitize';

describe('sanitizeDescription', () => {
  it('removes script tags and their contents', () => {
    const out = sanitizeDescription('<p>Hi</p><script>alert(1)</script>');
    expect(out).toContain('<p>Hi</p>');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('script');
  });

  it('strips event handler attributes', () => {
    const out = sanitizeDescription('<p onerror="steal()">Text</p>');
    expect(out).not.toContain('onerror');
    expect(out).toContain('Text');
  });

  it('discards anchors entirely, including javascript: hrefs', () => {
    const out = sanitizeDescription('<a href="javascript:alert(1)">Click</a>');
    expect(out).not.toContain('href');
    expect(out).not.toContain('javascript');
  });

  it('discards iframes and style tags', () => {
    const out = sanitizeDescription('<iframe src="https://evil.test"></iframe><style>body{}</style>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('evil.test');
  });

  it('keeps the allowed formatting tags', () => {
    const out = sanitizeDescription('<h3>Role</h3><ul><li><strong>Shift</strong></li></ul>');
    expect(out).toBe('<h3>Role</h3><ul><li><strong>Shift</strong></li></ul>');
  });

  it('converts double-encoded newlines into line breaks', () => {
    const out = sanitizeDescription('Union: OPSEU&amp;#xa;Hours: Days');
    expect(out).toContain('<br />');
    expect(out).not.toContain('#xa;');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/lib/normalize/sanitize.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

Create `lib/normalize/sanitize.ts`:

```ts
import sanitizeHtml from 'sanitize-html';

/** Exactly the allow-list from the spec. Do not widen without a spec change. */
const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'h3', 'h4'];

export function sanitizeDescription(dirty: string): string {
  const withBreaks = dirty
    .replace(/&amp;#xa;/gi, '<br />')
    .replace(/&#xa;/gi, '<br />');

  return sanitizeHtml(withBreaks, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 17 tests total.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add HTML sanitizer for third-party job descriptions"
```

---

### Task 4: Taxonomy and rule-based classification

Workday gives us no NOC code, so categories are derived from titles by deterministic rules. The Claude API fallback from the long-range plan is **not** built in Phase 1.

**Deviation from spec §5, recorded deliberately:** `jobs.category` is **nullable**. The original schema marked it `not null`, which assumed NOC codes seeded every row. Workday supplies none, and "we could not classify this title" is a real state that must not be faked with a wrong category. The search UI filters on category only when one is supplied.

**Files:**
- Create: `lib/taxonomy/categories.ts`, `lib/taxonomy/classify.ts`
- Test: `tests/lib/taxonomy/classify.test.ts`

**Interfaces:**
- Consumes: `normalizeTitle` from Task 2
- Produces:
  - `CATEGORIES` (readonly tuple), type `Category`
  - `classify(title: string): Category | null`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/taxonomy/classify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classify } from '@/lib/taxonomy/classify';

describe('classify', () => {
  it('classifies nursing titles, including abbreviations', () => {
    expect(classify('Registered Nurse - Hemodialysis Unit - CP2 (GEN)')).toBe('nursing');
    expect(classify('RN - Emergency (Req #12345)')).toBe('nursing');
    expect(classify('Registered Practical Nurse - 3MBW CCC (CEN)')).toBe('nursing');
  });

  it('classifies allied health', () => {
    expect(classify('Occupational Therapist - ACTT')).toBe('allied_health');
  });

  it('prefers mental health over allied health for psychiatric roles', () => {
    expect(classify('Social Worker, Acute Mental Health')).toBe('mental_health');
  });

  it('classifies support care', () => {
    expect(classify('PSW - Nights')).toBe('support_care');
  });

  it('classifies admin and clerical', () => {
    expect(classify('Unit Secretary, Diabetes and Pediatric Ambulatory Clinics (CUPE) - Casual'))
      .toBe('admin_clerical');
  });

  it('classifies research', () => {
    expect(classify('Postdoctoral Fellow | Temporary Full Time (1.0 FTE) | CHEO Research Institute'))
      .toBe('research');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(classify('Weekend Switchboard Operator, Information Services')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/lib/taxonomy/classify.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `lib/taxonomy/categories.ts`**

```ts
export const CATEGORIES = [
  'nursing',
  'physicians',
  'allied_health',
  'mental_health',
  'support_care',
  'diagnostics_lab',
  'pharmacy',
  'admin_clerical',
  'management',
  'research',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** User-facing labels. Job seekers do not say "support_care". */
export const CATEGORY_LABELS: Record<Category, string> = {
  nursing: 'Nursing',
  physicians: 'Physicians',
  allied_health: 'Allied health',
  mental_health: 'Mental health',
  support_care: 'Support care (PSW/HCA)',
  diagnostics_lab: 'Lab and imaging',
  pharmacy: 'Pharmacy',
  admin_clerical: 'Admin and clerical',
  management: 'Management',
  research: 'Research',
};
```

- [ ] **Step 4: Write `lib/taxonomy/classify.ts`**

Rule order is significant — the first match wins, so narrower categories precede broader ones.

```ts
import { normalizeTitle } from '@/lib/normalize/title';
import type { Category } from './categories';

const RULES: ReadonlyArray<{ pattern: RegExp; category: Category }> = [
  { pattern: /\b(registered nurse|practical nurse|nurse practitioner|nursing|nurse)\b/, category: 'nursing' },
  { pattern: /\b(physician|surgeon|anesthesiologist|hospitalist|psychiatrist)\b/, category: 'physicians' },
  { pattern: /\b(mental health|psychiatric|addiction|crisis|social worker)\b/, category: 'mental_health' },
  { pattern: /\b(personal support worker|health care aide|patient attendant|porter|orderly)\b/, category: 'support_care' },
  { pattern: /\b(laboratory|radiation technologist|sonographer|imaging|phlebotomist|diagnostic|cytotechnologist)\b/, category: 'diagnostics_lab' },
  { pattern: /\b(pharmacist|pharmacy)\b/, category: 'pharmacy' },
  { pattern: /\b(occupational therapist|physiotherapist|respiratory therapist|speech language pathologist|dietitian|audiologist|therapist)\b/, category: 'allied_health' },
  { pattern: /\b(research|scientist|postdoctoral|clinical trial)\b/, category: 'research' },
  { pattern: /\b(manager|director|chief|supervisor|vice president)\b/, category: 'management' },
  { pattern: /\b(clerk|secretary|administrative|receptionist|scheduler|registration|clerical)\b/, category: 'admin_clerical' },
];

/** Returns null when no rule matches. Never guess a category. */
export function classify(title: string): Category | null {
  const normalized = normalizeTitle(title);
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.category;
  }
  return null;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 24 tests total.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add healthcare taxonomy and rule-based classifier"
```

---

### Task 5: Database schema, RLS, and employer registry

**Human step required:** `npx supabase login` and `npx supabase link` are interactive. A human must run them, or supply `SUPABASE_ACCESS_TOKEN` and the project ref.

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_rls.sql`, `supabase/migrations/0003_seed_employers.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `employers`, `raw_postings`, `jobs`, `job_sources`, `ingest_runs`, with three seeded employer rows

- [ ] **Step 1: Initialise Supabase and link the project**

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

- [ ] **Step 2: Write `supabase/migrations/0001_init.sql`**

Two deliberate departures from spec §5, both justified in Task 4 and in the Global Constraints: `jobs.category` is nullable, and `employers.default_city` is added because Workday exposes no city field.

```sql
create extension if not exists pgcrypto;

create table employers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  facility_type text,
  province      text not null,
  default_city  text not null,
  website       text,
  ats_platform  text,
  ats_config    jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table raw_postings (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null,
  source_job_id text not null,
  source_url    text not null,
  payload       jsonb not null,
  normalized    jsonb not null,
  content_hash  text not null,
  fingerprint   text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source_id, source_job_id)
);
create index on raw_postings (fingerprint);
create index on raw_postings (last_seen_at);

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  fingerprint      text not null unique,
  title            text not null,
  employer_id      uuid references employers(id),
  employer_name    text not null,
  facility_name    text,
  description      text not null,
  city             text not null,
  province         text not null,
  latitude         double precision,
  longitude        double precision,
  noc_code         text,
  category         text,
  employment_type  text,
  shift_type       text,
  salary_min       numeric,
  salary_max       numeric,
  salary_period    text,
  apply_url        text not null,
  canonical_source text not null,
  posted_at        timestamptz not null,
  closes_at        timestamptz,
  expires_at       timestamptz not null,
  is_active        boolean not null default true,
  search_vector    tsvector generated always as (
                     setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                     setweight(to_tsvector('english', coalesce(employer_name,'')), 'B') ||
                     setweight(to_tsvector('english', coalesce(description,'')), 'C')
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on jobs using gin (search_vector);
create index on jobs (province, category, is_active, posted_at desc);
create index on jobs (is_active, posted_at desc);
create index on jobs (is_active, city);

create table job_sources (
  job_id         uuid references jobs(id) on delete cascade,
  raw_posting_id uuid references raw_postings(id) on delete cascade,
  primary key (job_id, raw_posting_id)
);

create table ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null,
  fetched     int default 0,
  inserted    int default 0,
  updated     int default 0,
  error       text
);
```

- [ ] **Step 3: Write `supabase/migrations/0002_rls.sql`**

RLS enabled with **zero policies** denies everything to `anon`. Only `jobs` gets a policy, and only for active rows. The service role bypasses RLS, which is how workers write.

```sql
alter table employers    enable row level security;
alter table raw_postings enable row level security;
alter table jobs         enable row level security;
alter table job_sources  enable row level security;
alter table ingest_runs  enable row level security;

create policy "anon reads active jobs"
  on jobs for select
  to anon
  using (is_active = true);
```

- [ ] **Step 4: Write `supabase/migrations/0003_seed_employers.sql`**

Tenant and site values are the verified constants from the plan header. `parseDescriptionHeader` is true only for SHN, because only SHN uses the structured description header.

```sql
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Scarborough Health Network', 'scarborough-health-network', 'hospital', 'ON', 'Toronto',
   'https://www.shn.ca', 'workday',
   '{"tenant":"shn","site":"SHN_External_Career_Site","host":"shn.wd10.myworkdayjobs.com","parseDescriptionHeader":true}'),
  ('Children''s Hospital of Eastern Ontario', 'cheo', 'hospital', 'ON', 'Ottawa',
   'https://www.cheo.on.ca', 'workday',
   '{"tenant":"cheo","site":"External_Site","host":"cheo.wd10.myworkdayjobs.com","parseDescriptionHeader":false}'),
  ('Oak Valley Health', 'oak-valley-health', 'hospital', 'ON', 'Markham',
   'https://www.oakvalleyhealth.ca', 'workday',
   '{"tenant":"oakvalleyhealth","site":"OakValleyHealth","host":"oakvalleyhealth.wd10.myworkdayjobs.com","parseDescriptionHeader":false}');
```

- [ ] **Step 5: Apply the migrations**

```bash
npx supabase db push
```

- [ ] **Step 6: Verify the schema landed**

```bash
npx supabase db diff --schema public
```

Expected: no differences — local migrations match the remote schema.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add database schema, RLS policies, and employer registry"
```

---

### Task 6: Supabase clients and the RLS verification test

The RLS test is the most important test in the codebase, because a mistake here silently exposes the raw layer. There is also a static test that no file under `app/` imports the service-role client.

**Files:**
- Create: `lib/db/server.ts`, `lib/db/admin.ts`
- Test: `tests/db/rls.test.ts`, `tests/db/key-isolation.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `createServerClient(): SupabaseClient`, `createAdminClient(): SupabaseClient`

- [ ] **Step 1: Write the failing tests**

Create `tests/db/rls.test.ts`. It self-skips when credentials are absent so the suite still runs locally without a database.

```ts
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe.runIf(Boolean(url && anon))('row level security', () => {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });

  it.each(['raw_postings', 'ingest_runs', 'employers', 'job_sources'])(
    'returns no rows to anon from %s',
    async (table) => {
      const { data } = await client.from(table).select('*').limit(1);
      expect(data ?? []).toHaveLength(0);
    },
  );

  it('returns only active rows from jobs', async () => {
    const { data, error } = await client.from('jobs').select('id,is_active').limit(50);
    expect(error).toBeNull();
    for (const row of data ?? []) expect(row.is_active).toBe(true);
  });
});
```

Create `tests/db/key-isolation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('service role key isolation', () => {
  it('no file under app/ references the admin client or the service role key', () => {
    const offenders = walk('app')
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return src.includes('db/admin') || src.includes('SUPABASE_SERVICE_ROLE_KEY');
      });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test tests/db`
Expected: the RLS suite fails (or skips if env is unset); `key-isolation` fails only if `app/` does not exist yet — create an empty `app/` first if needed.

- [ ] **Step 3: Write `lib/db/server.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

/** Anon client for server components. Reads only what RLS permits. */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 4: Write `lib/db/admin.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. BYPASSES RLS.
 * Import only from workers/. Never from app/ — enforced by
 * tests/db/key-isolation.test.ts.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 5: Run the tests with real credentials**

Populate `.env.local` from `.env.local.example` with the project's values, then:

```bash
set -a && . ./.env.local && set +a && npm test tests/db
```

Expected: PASS. Private tables return zero rows to anon; `jobs` returns only active rows.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add supabase clients with RLS and key isolation tests"
```

---

### Task 7: Workday connector — fixtures and `normalize()`

`normalize()` is pure: payload in, `NormalizedPosting` out, no I/O. This is the safety net that catches Workday changing its response shape.

**Files:**
- Create: `fixtures/workday/shn-list.json`, `fixtures/workday/shn-detail.json`, `fixtures/workday/cheo-detail.json`, `fixtures/workday/oakvalley-detail.json`
- Create: `workers/connectors/types.ts`, `workers/connectors/workday.ts`
- Test: `tests/workers/workday-normalize.test.ts`

**Interfaces:**
- Consumes: `sanitizeDescription` (Task 3), `classify` (Task 4), `NormalizedPosting`/`JobStub` (Task 2)
- Produces:
  - `type WorkdayEmployer = { slug: string; name: string; province: ProvinceCode; defaultCity: string; config: { tenant: string; site: string; host: string; parseDescriptionHeader: boolean } }`
  - `parseWorkdayList(payload: unknown): { total: number; stubs: JobStub[] }`
  - `normalizeWorkday(detail: unknown, employer: WorkdayEmployer): NormalizedPosting`
  - `parseDescriptionHeader(rawDescription: string): HeaderFields`

- [ ] **Step 1: Record real fixtures**

```bash
mkdir -p fixtures/workday
UA="CarePortalBot/0.1 (+https://example.invalid/about)"

curl -s -X POST "https://shn.wd10.myworkdayjobs.com/wday/cxs/shn/SHN_External_Career_Site/jobs" \
  -H "Content-Type: application/json" -H "User-Agent: $UA" \
  -d '{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}' > fixtures/workday/shn-list.json

# Take the first externalPath from the list and fetch its detail.
P=$(node -e "console.log(require('./fixtures/workday/shn-list.json').jobPostings[0].externalPath)")
curl -s -H "User-Agent: $UA" \
  "https://shn.wd10.myworkdayjobs.com/wday/cxs/shn/SHN_External_Career_Site$P" > fixtures/workday/shn-detail.json

node -e "const d=require('./fixtures/workday/shn-detail.json'); console.log(d.jobPostingInfo.title)"
```

Expected: a job title prints. Repeat for `cheo` / `External_Site` and `oakvalleyhealth` / `OakValleyHealth`, saving `cheo-detail.json` and `oakvalley-detail.json`.

- [ ] **Step 2: Write the failing test**

Create `tests/workers/workday-normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import shnList from '@/fixtures/workday/shn-list.json';
import shnDetail from '@/fixtures/workday/shn-detail.json';
import cheoDetail from '@/fixtures/workday/cheo-detail.json';
import { parseWorkdayList, normalizeWorkday, parseDescriptionHeader } from '@/workers/connectors/workday';
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
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test tests/workers/workday-normalize.test.ts`
Expected: FAIL — cannot resolve `@/workers/connectors/workday`.

Add `"resolveJsonModule": true` to `tsconfig.json` `compilerOptions` if the fixture imports error.

- [ ] **Step 4: Write `workers/connectors/types.ts`**

```ts
import type { JobStub, NormalizedPosting } from '@/lib/types';

export interface Connector {
  readonly id: string;
  readonly kind: 'feed' | 'api' | 'ats';
  fetchPage(cursor?: string): Promise<{ items: JobStub[]; nextCursor?: string }>;
  /** Fetch the full record for a stub. Identity for sources returning complete rows. */
  hydrate(stub: JobStub): Promise<unknown>;
  /** Pure. No I/O. Throws on invalid input. */
  normalize(raw: unknown): NormalizedPosting;
}
```

- [ ] **Step 5: Write the parsing half of `workers/connectors/workday.ts`**

```ts
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode, ShiftType } from '@/lib/types';

export type WorkdayEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { tenant: string; site: string; host: string; parseDescriptionHeader: boolean };
};

const ListItemSchema = z.object({
  title: z.string(),
  externalPath: z.string().startsWith('/job/'),
  locationsText: z.string().default(''),
  bulletFields: z.array(z.string()).default([]),
});

const ListSchema = z.object({ total: z.number(), jobPostings: z.array(ListItemSchema) });

const DetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string(),
    location: z.string().optional(),
    startDate: z.string(),
    timeType: z.string().optional(),
    jobReqId: z.string(),
    externalUrl: z.string().url(),
  }),
  hiringOrganization: z.object({ name: z.string() }).optional(),
});

export function parseWorkdayList(payload: unknown): { total: number; stubs: JobStub[] } {
  const parsed = ListSchema.parse(payload);
  return {
    total: parsed.total,
    stubs: parsed.jobPostings.map((item) => ({
      sourceJobId: item.bulletFields[0] ?? item.externalPath,
      externalPath: item.externalPath,
      title: item.title,
      locationsText: item.locationsText,
    })),
  };
}

export type HeaderFields = {
  union?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'year';
  shiftType?: ShiftType;
  employmentType?: EmploymentType;
};

/** SHN authoring convention only. Must fail soft — a missing header yields {}. */
export function parseDescriptionHeader(rawDescription: string): HeaderFields {
  const text = rawDescription.replace(/&amp;#xa;|&#xa;/gi, '\n');
  const fields: HeaderFields = {};

  const union = text.match(/^Union:\s*(.+)$/m);
  if (union) fields.union = union[1].trim();

  const salary = text.match(/Minimum\s*-\s*Maximum\s+(Hourly|Annual)\s+(?:Rate|Salary):\s*\$?([\d.,]+)\s*-\s*\$?([\d.,]+)/i);
  if (salary) {
    fields.salaryPeriod = salary[1].toLowerCase() === 'hourly' ? 'hour' : 'year';
    fields.salaryMin = Number(salary[2].replace(/,/g, ''));
    fields.salaryMax = Number(salary[3].replace(/,/g, ''));
  }

  const hours = text.match(/^Hours:\s*(.+)$/m);
  if (hours) {
    const h = hours[1].toLowerCase();
    if (/night/.test(h)) fields.shiftType = 'night';
    else if (/evening/.test(h)) fields.shiftType = 'evening';
    else if (/rotat/.test(h)) fields.shiftType = 'rotating';
    else if (/day/.test(h)) fields.shiftType = 'day';
    else if (/weekend/.test(h)) fields.shiftType = 'weekend';
  }

  const jobType = text.match(/^Job Type:\s*(.+)$/m);
  if (jobType) {
    const t = jobType[1].toLowerCase();
    if (/casual/.test(t)) fields.employmentType = 'casual';
    else if (/temporary/.test(t)) fields.employmentType = 'temporary';
    else if (/full.?time/.test(t)) fields.employmentType = 'full_time';
    else if (/part.?time/.test(t)) fields.employmentType = 'part_time';
  }

  return fields;
}
```

Note the ordering in the `Hours:` block: `night` before `day` so `"Days, Nights"` classifies as `night`, and `weekend` last so `"Days, Weekends"` yields `day`.

- [ ] **Step 6: Add `normalizeWorkday` to the same file**

```ts
function employmentTypeFromTimeType(timeType?: string): EmploymentType | undefined {
  if (!timeType) return undefined;
  const t = timeType.toLowerCase();
  if (t.includes('full')) return 'full_time';
  if (t.includes('part')) return 'part_time';
  return undefined;
}

export function normalizeWorkday(detail: unknown, employer: WorkdayEmployer): NormalizedPosting {
  const parsed = DetailSchema.parse(detail);
  const info = parsed.jobPostingInfo;

  const header = employer.config.parseDescriptionHeader
    ? parseDescriptionHeader(info.jobDescription)
    : {};

  const postedAt = new Date(`${info.startDate}T00:00:00Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable startDate "${info.startDate}" for ${info.jobReqId}`);
  }

  return {
    sourceId: `workday:${employer.config.tenant}`,
    sourceJobId: info.jobReqId,
    sourceUrl: info.externalUrl,
    title: info.title,
    employerName: employer.name,
    facilityName: info.location,
    description: sanitizeDescription(info.jobDescription),
    // Workday exposes no city; location is a facility string. City comes from the registry.
    city: employer.defaultCity,
    province: employer.province,
    postedAt,
    employmentType: header.employmentType ?? employmentTypeFromTimeType(info.timeType),
    shiftType: header.shiftType,
    salaryMin: header.salaryMin,
    salaryMax: header.salaryMax,
    salaryPeriod: header.salaryPeriod,
    applyUrl: info.externalUrl,
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Workday connector parsing with recorded fixtures"
```

---

### Task 8: Rate limiter, structured logging, and the fetching half of the connector

The limiter is a **Global Constraint made executable**. Every outbound request goes through it.

**Files:**
- Create: `workers/ratelimit.ts`, `workers/logger.ts`
- Modify: `workers/connectors/workday.ts` (append the fetching half)
- Test: `tests/workers/ratelimit.test.ts`

**Interfaces:**
- Consumes: `SITE` (Task 1), `parseWorkdayList` / `normalizeWorkday` / `WorkdayEmployer` (Task 7), `Connector` (Task 7)
- Produces:
  - `createHostLimiter(minIntervalMs?: number): (host: string, fn: () => Promise<T>) => Promise<T>`
  - `fetchWithBackoff(url: string, init: RequestInit, opts?: { attempts?: number; baseDelayMs?: number }): Promise<Response>`
  - `log(ctx: LogContext, level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>): void`
  - `createWorkdayConnector(employer: WorkdayEmployer, ctx: LogContext): Connector`

- [ ] **Step 1: Write the failing test**

Create `tests/workers/ratelimit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createHostLimiter, fetchWithBackoff, MIN_INTERVAL_MS } from '@/workers/ratelimit';

describe('createHostLimiter', () => {
  it('defaults to at least one second between requests', () => {
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });

  it('spaces consecutive calls to the same host', async () => {
    const limit = createHostLimiter(60);
    const started: number[] = [];
    const mark = async () => { started.push(Date.now()); };
    await limit('a.test', mark);
    await limit('a.test', mark);
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(55);
  });

  it('does not delay calls to different hosts', async () => {
    const limit = createHostLimiter(200);
    const t0 = Date.now();
    await limit('a.test', async () => {});
    await limit('b.test', async () => {});
    expect(Date.now() - t0).toBeLessThan(150);
  });
});

describe('fetchWithBackoff', () => {
  it('retries on 429 and then succeeds', async () => {
    const responses = [
      new Response('', { status: 429 }),
      new Response('{"ok":true}', { status: 200 }),
    ];
    const stub = vi.fn(async () => responses.shift()!);
    vi.stubGlobal('fetch', stub);

    const res = await fetchWithBackoff('https://a.test/x', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(stub).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('gives up after the attempt budget and throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(fetchWithBackoff('https://a.test/x', {}, { attempts: 2, baseDelayMs: 1 }))
      .rejects.toThrow(/503/);
    vi.unstubAllGlobals();
  });

  it('refuses non-https URLs', async () => {
    await expect(fetchWithBackoff('http://a.test/x', {})).rejects.toThrow(/https/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/workers/ratelimit.test.ts`
Expected: FAIL — cannot resolve `@/workers/ratelimit`.

- [ ] **Step 3: Write `workers/ratelimit.ts`**

```ts
export const MIN_INTERVAL_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One limiter instance holds per-host timing state. */
export function createHostLimiter(minIntervalMs: number = MIN_INTERVAL_MS) {
  const lastAt = new Map<string, number>();
  const chain = new Map<string, Promise<unknown>>();

  return async function limit<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const previous = chain.get(host) ?? Promise.resolve();
    const run = previous.then(async () => {
      const wait = Math.max(0, (lastAt.get(host) ?? 0) + minIntervalMs - Date.now());
      if (wait > 0) await sleep(wait);
      lastAt.set(host, Date.now());
      return fn();
    });
    chain.set(host, run.catch(() => undefined));
    return run;
  };
}

export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  if (!url.startsWith('https://')) {
    throw new Error(`Refusing non-https outbound request: ${url}`);
  }
  const attempts = opts.attempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;

  let lastStatus = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status < 500) return res;
    lastStatus = res.status;
    if (attempt < attempts - 1) await sleep(baseDelayMs * 2 ** attempt);
  }
  throw new Error(`Gave up after ${attempts} attempts, last status ${lastStatus}: ${url}`);
}
```

- [ ] **Step 4: Write `workers/logger.ts`**

```ts
export type LogContext = { sourceId: string; runId: string };

export function log(
  ctx: LogContext,
  level: 'info' | 'warn' | 'error',
  message: string,
  extra: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    source_id: ctx.sourceId,
    run_id: ctx.runId,
    ...extra,
  }));
}
```

- [ ] **Step 5: Append the fetching half to `workers/connectors/workday.ts`**

```ts
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

const PAGE_SIZE = 20;
const limit = createHostLimiter();

export function createWorkdayConnector(employer: WorkdayEmployer, ctx: LogContext): Connector {
  const { tenant, site, host } = employer.config;
  const base = `https://${host}/wday/cxs/${tenant}/${site}`;
  const headers = { 'Content-Type': 'application/json', 'User-Agent': SITE.userAgent };

  return {
    id: `workday:${tenant}`,
    kind: 'ats',

    async fetchPage(cursor?: string) {
      const offset = cursor ? Number(cursor) : 0;
      const res = await limit(host, () => fetchWithBackoff(`${base}/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
      }));
      const { total, stubs } = parseWorkdayList(await res.json());
      const nextOffset = offset + PAGE_SIZE;
      log(ctx, 'info', 'fetched list page', { offset, returned: stubs.length, total });
      return { items: stubs, nextCursor: nextOffset < total ? String(nextOffset) : undefined };
    },

    async hydrate(stub) {
      const res = await limit(host, () => fetchWithBackoff(`${base}${stub.externalPath}`, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);
      return res.json();
    },

    normalize(raw: unknown) {
      return normalizeWorkday(raw, employer);
    },
  };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add rate limiter, structured logging, and Workday fetching"
```

---

### Task 9: Ingest orchestrator

Loads employers from the registry, runs each connector, and upserts `raw_postings`. Per-item failures are logged and skipped; one connector failing never aborts the others.

**Files:**
- Create: `workers/run.ts`
- Modify: `package.json` (add the `ingest` script)

**Interfaces:**
- Consumes: `createAdminClient` (Task 6), `createWorkdayConnector` (Task 8), `fingerprint` (Task 2), `log` (Task 8)
- Produces: `npm run ingest` — a runnable entry point

- [ ] **Step 1: Add the script to `package.json`**

```json
"ingest": "tsx workers/run.ts",
"dedupe": "tsx workers/dedupe.ts",
"expire": "tsx workers/expire.ts"
```

- [ ] **Step 2: Write `workers/run.ts`**

```ts
import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/db/admin';
import { createWorkdayConnector, type WorkdayEmployer } from '@/workers/connectors/workday';
import { fingerprint } from '@/lib/normalize/fingerprint';
import { log, type LogContext } from '@/workers/logger';
import type { ProvinceCode } from '@/lib/types';

const contentHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function ingestEmployer(admin: ReturnType<typeof createAdminClient>, employer: WorkdayEmployer) {
  const runId = randomUUID();
  const sourceId = `workday:${employer.config.tenant}`;
  const ctx: LogContext = { sourceId, runId };

  await admin.from('ingest_runs').insert({ id: runId, source_id: sourceId, status: 'running' });

  let fetched = 0;
  let inserted = 0;
  let updated = 0;

  try {
    const connector = createWorkdayConnector(employer, ctx);

    const { data: existing } = await admin
      .from('raw_postings')
      .select('source_job_id,content_hash')
      .eq('source_id', sourceId);
    const known = new Map((existing ?? []).map((r) => [r.source_job_id, r.content_hash]));

    let cursor: string | undefined;
    do {
      const page = await connector.fetchPage(cursor);
      cursor = page.nextCursor;

      for (const stub of page.items) {
        fetched += 1;
        try {
          const payload = await connector.hydrate(stub);
          const normalized = connector.normalize(payload);
          const hash = contentHash(normalized);
          const previous = known.get(normalized.sourceJobId);

          await admin.from('raw_postings').upsert(
            {
              source_id: sourceId,
              source_job_id: normalized.sourceJobId,
              source_url: normalized.sourceUrl,
              payload,
              normalized,
              content_hash: hash,
              fingerprint: fingerprint({
                title: normalized.title,
                employerKey: employer.slug,
                city: normalized.city,
                province: normalized.province,
              }),
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'source_id,source_job_id' },
          );

          if (previous === undefined) inserted += 1;
          else if (previous !== hash) updated += 1;
        } catch (error) {
          // One bad item must never abort the run.
          log(ctx, 'warn', 'skipped item', {
            source_job_id: stub.sourceJobId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } while (cursor);

    await admin.from('ingest_runs').update({
      status: 'success', finished_at: new Date().toISOString(), fetched, inserted, updated,
    }).eq('id', runId);

    log(ctx, 'info', 'run complete', { fetched, inserted, updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from('ingest_runs').update({
      status: 'failed', finished_at: new Date().toISOString(), fetched, inserted, updated, error: message,
    }).eq('id', runId);
    log(ctx, 'error', 'run failed', { error: message });
  }
}

async function main() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('employers')
    .select('slug,name,province,default_city,ats_config')
    .eq('is_active', true)
    .eq('ats_platform', 'workday');

  if (error) throw error;

  for (const row of rows ?? []) {
    const employer: WorkdayEmployer = {
      slug: row.slug,
      name: row.name,
      province: row.province as ProvinceCode,
      defaultCity: row.default_city,
      config: row.ats_config,
    };
    // Sequential on purpose: one connector failing must not affect the others,
    // and the shared limiter is per-host anyway.
    await ingestEmployer(admin, employer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Run the ingester against the real database**

```bash
set -a && . ./.env.local && set +a && npm run ingest
```

Expected: structured JSON log lines, then roughly 197 rows across three sources. Verify:

```bash
npx supabase db query "select source_id, count(*) from raw_postings group by 1 order by 1"
```

Expected: three rows — `workday:cheo`, `workday:oakvalleyhealth`, `workday:shn`.

- [ ] **Step 4: Prove idempotency by running it twice**

```bash
set -a && . ./.env.local && set +a && npm run ingest
npx supabase db query "select status, fetched, inserted, updated from ingest_runs order by started_at desc limit 3"
```

Expected: the second run reports `inserted = 0`. Row counts in `raw_postings` are unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ingest orchestrator with per-item error isolation"
```

---

### Task 10: Dedupe matcher

Projects `raw_postings` into the canonical `jobs` table. In Phase 1 there is nothing to merge — three hospitals do not post each other's jobs — so **any merge this produces is a bug**, which makes the component self-testing.

**Files:**
- Create: `workers/dedupe.ts`
- Test: `tests/workers/dedupe.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` (Task 6), `classify` (Task 4), `NormalizedPosting` (Task 2)
- Produces:
  - `sourcePriority(sourceId: string): number` — lower wins
  - `pickCanonical(rows: RawRow[]): RawRow`
  - `buildJobRow(row: RawRow, employerId: string | null): JobRow`

- [ ] **Step 1: Write the failing test**

Create `tests/workers/dedupe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sourcePriority, pickCanonical, buildJobRow, type RawRow } from '@/workers/dedupe';

const posting = {
  sourceId: 'workday:shn', sourceJobId: 'JR1', sourceUrl: 'https://x.test/1',
  title: 'RN - Emergency', employerName: 'SHN', description: '<p>x</p>',
  city: 'Toronto', province: 'ON', postedAt: '2026-09-04T00:00:00.000Z',
  applyUrl: 'https://x.test/1',
};

const row = (over: Partial<RawRow> = {}): RawRow => ({
  id: 'r1', source_id: 'workday:shn', fingerprint: 'f1', normalized: posting, ...over,
});

describe('sourcePriority', () => {
  it('ranks direct ATS above Job Bank above Adzuna', () => {
    expect(sourcePriority('workday:shn')).toBeLessThan(sourcePriority('jobbank'));
    expect(sourcePriority('jobbank')).toBeLessThan(sourcePriority('adzuna'));
  });
});

describe('pickCanonical', () => {
  it('prefers the direct ATS row over an aggregator row', () => {
    const chosen = pickCanonical([
      row({ id: 'agg', source_id: 'adzuna' }),
      row({ id: 'ats', source_id: 'workday:shn' }),
    ]);
    expect(chosen.id).toBe('ats');
  });

  it('returns the only row when there is one', () => {
    expect(pickCanonical([row()]).id).toBe('r1');
  });
});

describe('buildJobRow', () => {
  it('classifies the title and derives a unique slug', () => {
    const job = buildJobRow(row(), null);
    expect(job.category).toBe('nursing');
    expect(job.slug).toMatch(/^rn-emergency-[0-9a-f]{8}$/);
  });

  it('sets expires_at to 60 days after posted_at', () => {
    const job = buildJobRow(row(), null);
    const days = (Date.parse(job.expires_at) - Date.parse(job.posted_at)) / 86_400_000;
    expect(days).toBe(60);
  });

  it('carries the apply URL through unchanged', () => {
    expect(buildJobRow(row(), null).apply_url).toBe('https://x.test/1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/workers/dedupe.test.ts`
Expected: FAIL — cannot resolve `@/workers/dedupe`.

- [ ] **Step 3: Write `workers/dedupe.ts`**

```ts
import { createAdminClient } from '@/lib/db/admin';
import { classify } from '@/lib/taxonomy/classify';
import { log } from '@/workers/logger';

const EXPIRY_DAYS = 60;

export type RawRow = {
  id: string;
  source_id: string;
  fingerprint: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalized: any;
};

export type JobRow = {
  slug: string;
  fingerprint: string;
  title: string;
  employer_id: string | null;
  employer_name: string;
  facility_name: string | null;
  description: string;
  city: string;
  province: string;
  category: string | null;
  employment_type: string | null;
  shift_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  apply_url: string;
  canonical_source: string;
  posted_at: string;
  closes_at: string | null;
  expires_at: string;
  is_active: boolean;
  updated_at: string;
};

/** Lower number wins. Direct ATS beats Job Bank beats Adzuna. */
export function sourcePriority(sourceId: string): number {
  if (sourceId.startsWith('workday:') || sourceId.startsWith('taleo:')) return 0;
  if (sourceId === 'jobbank') return 1;
  return 2;
}

export function pickCanonical(rows: RawRow[]): RawRow {
  return [...rows].sort((a, b) => sourcePriority(a.source_id) - sourcePriority(b.source_id))[0];
}

function slugify(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function buildJobRow(row: RawRow, employerId: string | null): JobRow {
  const n = row.normalized;
  const postedAt = new Date(n.postedAt);
  const hardExpiry = new Date(postedAt.getTime() + EXPIRY_DAYS * 86_400_000);
  const closesAt = n.closesAt ? new Date(n.closesAt) : null;
  const expiresAt = closesAt && closesAt < hardExpiry ? closesAt : hardExpiry;

  return {
    slug: `${slugify(n.title)}-${row.fingerprint.slice(0, 8)}`,
    fingerprint: row.fingerprint,
    title: n.title,
    employer_id: employerId,
    employer_name: n.employerName,
    facility_name: n.facilityName ?? null,
    description: n.description,
    city: n.city,
    province: n.province,
    category: classify(n.title),
    employment_type: n.employmentType ?? null,
    shift_type: n.shiftType ?? null,
    salary_min: n.salaryMin ?? null,
    salary_max: n.salaryMax ?? null,
    salary_period: n.salaryPeriod ?? null,
    apply_url: n.applyUrl,
    canonical_source: row.source_id,
    posted_at: postedAt.toISOString(),
    closes_at: closesAt ? closesAt.toISOString() : null,
    expires_at: expiresAt.toISOString(),
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const admin = createAdminClient();
  const ctx = { sourceId: 'matcher', runId: 'dedupe' };

  const { data: raws, error } = await admin
    .from('raw_postings')
    .select('id,source_id,fingerprint,normalized');
  if (error) throw error;

  const { data: employers } = await admin.from('employers').select('id,slug,name');
  const employerIdByName = new Map((employers ?? []).map((e) => [e.name, e.id as string]));

  const groups = new Map<string, RawRow[]>();
  for (const row of (raws ?? []) as RawRow[]) {
    const bucket = groups.get(row.fingerprint) ?? [];
    bucket.push(row);
    groups.set(row.fingerprint, bucket);
  }

  let merged = 0;
  for (const [fp, rows] of groups) {
    if (rows.length > 1) {
      merged += 1;
      log(ctx, 'warn', 'fingerprint collision merged', { fingerprint: fp, count: rows.length });
    }
    const canonical = pickCanonical(rows);
    const jobRow = buildJobRow(canonical, employerIdByName.get(canonical.normalized.employerName) ?? null);

    const { data: job, error: upsertError } = await admin
      .from('jobs').upsert(jobRow, { onConflict: 'fingerprint' }).select('id').single();
    if (upsertError) {
      log(ctx, 'error', 'job upsert failed', { fingerprint: fp, error: upsertError.message });
      continue;
    }

    for (const row of rows) {
      await admin.from('job_sources')
        .upsert({ job_id: job.id, raw_posting_id: row.id }, { onConflict: 'job_id,raw_posting_id' });
    }
  }

  log(ctx, 'info', 'dedupe complete', { groups: groups.size, merged });
}

main().catch((error) => { console.error(error); process.exit(1); });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Run the matcher against real data**

```bash
set -a && . ./.env.local && set +a && npm run dedupe
npx supabase db query "select count(*) from jobs"
```

Expected: a job count close to the `raw_postings` count, and **zero** "fingerprint collision merged" warnings. Any collision at this stage is a bug in `normalizeTitle` — investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dedupe matcher projecting raw postings into jobs"
```

---

### Task 11: Expiry

The three freshness rules, implemented as a database function so the "unseen for 7 days" join happens server-side.

**Files:**
- Create: `supabase/migrations/0004_expire_fn.sql`, `workers/expire.ts`

**Interfaces:**
- Consumes: `createAdminClient` (Task 6)
- Produces: `npm run expire`, and the SQL function `expire_stale_jobs()`

- [ ] **Step 1: Write `supabase/migrations/0004_expire_fn.sql`**

```sql
create or replace function expire_stale_jobs()
returns table (hard_expired int, unseen_expired int)
language plpgsql
security definer
set search_path = public
as $$
declare h int; u int;
begin
  update jobs set is_active = false, updated_at = now()
   where is_active = true and expires_at <= now();
  get diagnostics h = row_count;

  update jobs j set is_active = false, updated_at = now()
   where j.is_active = true
     and not exists (
       select 1
         from job_sources js
         join raw_postings rp on rp.id = js.raw_posting_id
        where js.job_id = j.id
          and rp.last_seen_at > now() - interval '7 days'
     );
  get diagnostics u = row_count;

  return query select h, u;
end;
$$;

revoke all on function expire_stale_jobs() from anon;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Write `workers/expire.ts`**

```ts
import { createAdminClient } from '@/lib/db/admin';
import { log } from '@/workers/logger';

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('expire_stale_jobs');
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  log({ sourceId: 'expire', runId: 'expire' }, 'info', 'expiry complete', {
    hard_expired: result?.hard_expired ?? 0,
    unseen_expired: result?.unseen_expired ?? 0,
  });
}

main().catch((error) => { console.error(error); process.exit(1); });
```

- [ ] **Step 4: Run it**

```bash
set -a && . ./.env.local && set +a && npm run expire
```

Expected: a log line reporting both counts as 0 on freshly ingested data.

- [ ] **Step 5: Verify the anon role cannot call it**

```bash
npx supabase db query "select has_function_privilege('anon', 'expire_stale_jobs()', 'execute')"
```

Expected: `false`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add job expiry with freshness rules"
```

---

### Task 12: Search page

The home page **is** the search page. Server component, no client-side data fetching, no login wall. Filters are category and city only — the province filter is omitted because Ontario-only makes it a control that does nothing, and shift is omitted because coverage is partial.

**Files:**
- Create: `lib/schemas/search-params.ts`, `lib/format.ts`, `components/JobCard.tsx`, `components/SearchForm.tsx`, `components/Pagination.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Test: `tests/lib/search-params.test.ts`, `tests/lib/format.test.ts`

**Interfaces:**
- Consumes: `createServerClient` (Task 6), `CATEGORIES` / `CATEGORY_LABELS` (Task 4), `SITE` (Task 1)
- Produces: `parseSearchParams(...)`, `PAGE_SIZE`, `postedAgo(iso: string): string`, `formatSalary(min, max, period): string | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/search-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSearchParams, PAGE_SIZE, MAX_LIMIT } from '@/lib/schemas/search-params';

describe('parseSearchParams', () => {
  it('caps the page size below the hard limit', () => {
    expect(PAGE_SIZE).toBeLessThanOrEqual(MAX_LIMIT);
    expect(MAX_LIMIT).toBe(50);
  });

  it('defaults page to 1', () => {
    expect(parseSearchParams({}).page).toBe(1);
  });

  it('rejects an unknown category rather than passing it to the query', () => {
    expect(parseSearchParams({ category: 'wizardry' }).category).toBeUndefined();
  });

  it('accepts a known category', () => {
    expect(parseSearchParams({ category: 'nursing' }).category).toBe('nursing');
  });

  it('clamps a hostile page number', () => {
    expect(parseSearchParams({ page: '-5' }).page).toBe(1);
    expect(parseSearchParams({ page: '999999' }).page).toBe(1);
  });

  it('truncates an overlong keyword', () => {
    expect(parseSearchParams({ q: 'x'.repeat(500) }).q).toBeUndefined();
  });
});
```

Create `tests/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { postedAgo, formatSalary } from '@/lib/format';

describe('postedAgo', () => {
  const now = new Date('2026-09-08T12:00:00Z');
  it('reads as today for the same day', () => {
    expect(postedAgo('2026-09-08T09:00:00Z', now)).toBe('Posted today');
  });
  it('reads in days', () => {
    expect(postedAgo('2026-09-04T09:00:00Z', now)).toBe('Posted 4 days ago');
  });
  it('uses the singular for one day', () => {
    expect(postedAgo('2026-09-07T09:00:00Z', now)).toBe('Posted 1 day ago');
  });
});

describe('formatSalary', () => {
  it('formats an hourly range the way a job seeker reads it', () => {
    expect(formatSalary(38.84, 54.77, 'hour')).toBe('$38.84–$54.77/hr');
  });
  it('formats an annual range', () => {
    expect(formatSalary(80000, 95000, 'year')).toBe('$80,000–$95,000/yr');
  });
  it('returns null when no salary is known', () => {
    expect(formatSalary(null, null, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test tests/lib/search-params.test.ts tests/lib/format.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `lib/schemas/search-params.ts`**

```ts
import { z } from 'zod';
import { CATEGORIES, type Category } from '@/lib/taxonomy/categories';

export const PAGE_SIZE = 25;
export const MAX_LIMIT = 50;

const SearchParamsSchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  category: z.enum([...CATEGORIES] as [Category, ...Category[]]).optional(),
  page: z.coerce.number().int().min(1).max(400).catch(1),
});

export type SearchParams = z.infer<typeof SearchParamsSchema>;

/** Never trust the query string. Unparseable input degrades to defaults. */
export function parseSearchParams(
  input: Record<string, string | string[] | undefined>,
): SearchParams {
  const flat = Object.fromEntries(
    Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = SearchParamsSchema.safeParse(flat);
  if (parsed.success) return parsed.data;

  // Salvage the fields that are individually valid; drop the rest.
  const salvaged = SearchParamsSchema.safeParse({ page: flat.page });
  return salvaged.success ? salvaged.data : { page: 1 };
}
```

- [ ] **Step 4: Write `lib/format.ts`**

```ts
export function postedAgo(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

export function formatSalary(
  min: number | null,
  max: number | null,
  period: string | null,
): string | null {
  if (min === null || max === null || period === null) return null;
  const suffix = period === 'hour' ? '/hr' : '/yr';
  const money = (n: number) =>
    period === 'hour'
      ? `$${n.toFixed(2)}`
      : `$${n.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`;
  return `${money(min)}–${money(max)}${suffix}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Write the theme tokens into `app/globals.css`**

Replace the file contents. Values are copied verbatim from the Global Constraints.

```css
@import "tailwindcss";

@theme {
  --color-ink: #14181C;
  --color-paper: #FBFAF7;
  --color-slate: #5B6670;
  --color-rule: #E2E1DC;
  --color-signal: #0F5C4A;
  --color-flag: #C2410C;
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: 16px;
}

:focus-visible {
  outline: 2px solid var(--color-signal);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 7: Write `components/JobCard.tsx`**

```tsx
import Link from 'next/link';
import { postedAgo, formatSalary } from '@/lib/format';

export type JobCardData = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  casual: 'Casual',
  temporary: 'Temporary',
  contract: 'Contract',
};

export function JobCard({ job }: { job: JobCardData }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employment = job.employment_type ? EMPLOYMENT_LABELS[job.employment_type] : null;

  return (
    <li className="border-b border-[var(--color-rule)]">
      <Link href={`/jobs/${job.slug}`} className="block px-4 py-4 hover:bg-white focus-visible:bg-white">
        <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
        <p className="mt-1 text-[var(--color-slate)]">
          {job.employer_name}
          {job.facility_name ? ` · ${job.facility_name}` : ''}
        </p>
        <p className="text-[var(--color-slate)]">{job.city}, {job.province}</p>
        <p className="mt-2 text-sm tabular-nums text-[var(--color-slate)]">
          {[salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
        </p>
      </Link>
    </li>
  );
}
```

- [ ] **Step 8: Write `components/SearchForm.tsx`**

Real `<label>` elements, a GET form so results are linkable and the back button works.

```tsx
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import type { SearchParams } from '@/lib/schemas/search-params';

export function SearchForm({ params }: { params: SearchParams }) {
  return (
    <form method="get" action="/" className="flex flex-wrap gap-3 px-4 py-4">
      <div className="flex min-w-[200px] flex-1 flex-col">
        <label htmlFor="q" className="text-sm text-[var(--color-slate)]">Role or keyword</label>
        <input id="q" name="q" type="search" defaultValue={params.q ?? ''}
          className="mt-1 rounded border border-[var(--color-rule)] px-3 py-2" />
      </div>
      <div className="flex min-w-[160px] flex-col">
        <label htmlFor="city" className="text-sm text-[var(--color-slate)]">City</label>
        <input id="city" name="city" type="text" defaultValue={params.city ?? ''}
          className="mt-1 rounded border border-[var(--color-rule)] px-3 py-2" />
      </div>
      <div className="flex min-w-[160px] flex-col">
        <label htmlFor="category" className="text-sm text-[var(--color-slate)]">Category</label>
        <select id="category" name="category" defaultValue={params.category ?? ''}
          className="mt-1 rounded border border-[var(--color-rule)] px-3 py-2">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>
      <button type="submit"
        className="mt-6 rounded bg-[var(--color-signal)] px-5 py-2 font-semibold text-white">
        Search
      </button>
    </form>
  );
}
```

- [ ] **Step 9: Write `components/Pagination.tsx`**

```tsx
import Link from 'next/link';

export function Pagination({
  page, total, pageSize, query,
}: { page: number; total: number; pageSize: number; query: Record<string, string | undefined> }) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v);
    sp.set('page', String(p));
    return `/?${sp.toString()}`;
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between px-4 py-6">
      {page > 1
        ? <Link href={href(page - 1)} className="text-[var(--color-signal)] underline">Previous</Link>
        : <span className="text-[var(--color-slate)]">Previous</span>}
      <span className="text-sm text-[var(--color-slate)]">Page {page} of {lastPage}</span>
      {page < lastPage
        ? <Link href={href(page + 1)} className="text-[var(--color-signal)] underline">Next</Link>
        : <span className="text-[var(--color-slate)]">Next</span>}
    </nav>
  );
}
```

- [ ] **Step 10: Write `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-[var(--color-ink)] px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight text-[var(--color-paper)]">
            {SITE.name}
          </Link>
        </header>
        <main className="mx-auto max-w-3xl">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 py-8 text-sm text-[var(--color-slate)]">
          <Link href="/about" className="underline">About {SITE.name}</Link>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 11: Write `app/page.tsx`**

```tsx
import { createServerClient } from '@/lib/db/server';
import { parseSearchParams, PAGE_SIZE } from '@/lib/schemas/search-params';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { SearchForm } from '@/components/SearchForm';
import { Pagination } from '@/components/Pagination';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'slug,title,employer_name,facility_name,city,province,employment_type,salary_min,salary_max,salary_period,posted_at';

export default async function SearchPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseSearchParams(await searchParams);
  const from = (params.page - 1) * PAGE_SIZE;

  let query = createServerClient()
    .from('jobs')
    .select(COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .order('posted_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q) query = query.textSearch('search_vector', params.q, { type: 'websearch' });
  if (params.city) query = query.ilike('city', params.city);
  if (params.category) query = query.eq('category', params.category);

  const { data, count } = await query;
  const jobs = (data ?? []) as JobCardData[];

  return (
    <>
      <SearchForm params={params} />
      <p className="px-4 pb-2 text-sm text-[var(--color-slate)]">
        {count ?? 0} {count === 1 ? 'job' : 'jobs'} · Ontario
      </p>

      {jobs.length === 0 ? (
        <p className="px-4 py-10">
          No jobs match that search right now. Try a broader keyword, or clear the city filter to
          see everything in Ontario.
        </p>
      ) : (
        <ul className="border-t border-[var(--color-rule)]">
          {jobs.map((job) => <JobCard key={job.slug} job={job} />)}
        </ul>
      )}

      <Pagination
        page={params.page}
        total={count ?? 0}
        pageSize={PAGE_SIZE}
        query={{ q: params.q, city: params.city, category: params.category }}
      />
    </>
  );
}
```

- [ ] **Step 12: Run the app and confirm real jobs render**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: real Ontario hospital jobs listed, newest first, with a working count. Search "nurse", then filter by category. Narrow the browser to **360px** and confirm nothing overflows horizontally. Tab through the page and confirm every control shows a focus ring.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add search page with bounded server-side filtering"
```

---

### Task 13: Job detail page, JSON-LD, 410, and the about page

**Files:**
- Create: `app/jobs/[slug]/page.tsx`, `app/about/page.tsx`, `middleware.ts`
- Modify: `next.config.ts` (security headers)

**Interfaces:**
- Consumes: `createServerClient` (Task 6), `SITE` (Task 1), `postedAgo` / `formatSalary` (Task 12)
- Produces: routes `/jobs/[slug]`, `/about`

- [ ] **Step 1: Write `app/jobs/[slug]/page.tsx`**

The description column is already sanitized at ingest (Task 3), which is the only reason `dangerouslySetInnerHTML` is acceptable here.

```tsx
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/db/server';
import { postedAgo, formatSalary } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: job } = await createServerClient()
    .from('jobs')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (!job) notFound();

  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.posted_at,
    validThrough: job.expires_at,
    hiringOrganization: { '@type': 'Organization', name: job.employer_name },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city,
        addressRegion: job.province,
        addressCountry: 'CA',
      },
    },
    ...(job.employment_type ? { employmentType: job.employment_type.toUpperCase() } : {}),
    ...(job.salary_min && job.salary_max ? {
      baseSalary: {
        '@type': 'MonetaryAmount',
        currency: 'CAD',
        value: {
          '@type': 'QuantitativeValue',
          minValue: job.salary_min,
          maxValue: job.salary_max,
          unitText: job.salary_period === 'hour' ? 'HOUR' : 'YEAR',
        },
      },
    } : {}),
  };

  return (
    <article className="px-4 py-6">
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1 className="text-2xl font-semibold leading-tight">{job.title}</h1>
      <p className="mt-2 text-[var(--color-slate)]">
        {job.employer_name}{job.facility_name ? ` · ${job.facility_name}` : ''}
      </p>
      <p className="text-[var(--color-slate)]">{job.city}, {job.province}</p>
      <p className="mt-2 text-sm tabular-nums text-[var(--color-slate)]">
        {[salary, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
      </p>

      <a
        href={job.apply_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-6 inline-block rounded bg-[var(--color-signal)] px-5 py-3 font-semibold text-white"
      >
        Apply on {job.employer_name}
      </a>

      <div
        className="prose mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: job.description }}
      />

      <p className="mt-8 text-sm text-[var(--color-slate)]">
        Listed by {job.employer_name}. Applications are handled on their site.
      </p>
    </article>
  );
}
```

- [ ] **Step 2: Write `middleware.ts` for 410 Gone**

App Router pages cannot set an arbitrary status code, so expired job URLs are handled in middleware before the page renders.

**Known and accepted tradeoff:** RLS hides inactive jobs from the anon key, so a slug that never existed is indistinguishable from one that expired, and both return 410. Using the service role here would return a more precise 404 but would violate the Global Constraint that the service key never reaches the web runtime. For a job board, "gone" is the right answer for essentially all of these URLs.

```ts
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const slug = req.nextUrl.pathname.split('/')[2];
  if (!slug) return NextResponse.next();

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return NextResponse.next();

  const res = await fetch(
    `${base}/rest/v1/jobs?slug=eq.${encodeURIComponent(slug)}&select=slug&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const rows = await res.json().catch(() => null);

  if (Array.isArray(rows) && rows.length === 0) {
    return new NextResponse('This job posting has closed.', {
      status: 410,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.next();
}

export const config = { matcher: '/jobs/:slug' };
```

- [ ] **Step 3: Write `app/about/page.tsx`**

This page is **required**: it is the contact URL our connector User-Agent points at. An operator who notices our traffic must be able to reach us.

```tsx
import { SITE } from '@/lib/site';

export const metadata = { title: `About ${SITE.name}` };

export default function AboutPage() {
  return (
    <article className="px-4 py-8">
      <h1 className="text-2xl font-semibold">About {SITE.name}</h1>

      <p className="mt-4">
        {SITE.name} is a job search site for healthcare work in Ontario. Every listing links
        directly to the employer&rsquo;s own application page. We never take applications ourselves.
      </p>

      <h2 className="mt-8 text-xl font-semibold">How we collect listings</h2>
      <p className="mt-2">
        We read the public job feeds that employers&rsquo; own career sites use. We identify
        ourselves on every request as <code>{SITE.userAgent}</code>, we send no more than one
        request per second to any single site, and we respect <code>robots.txt</code>. We do not
        log in, submit applications, or attempt to reach anything that requires authentication.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Employers: removing your listings</h2>
      <p className="mt-2">
        Email <a className="text-[var(--color-signal)] underline"
        href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> and we will stop collecting
        from your site. No justification needed.
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Add security headers to `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    }];
  },
};

export default nextConfig;
```

- [ ] **Step 5: Verify all three routes**

```bash
npm run dev
```

- Click a job from the search page. Confirm the description renders, and that "Apply on …" names the employer.
- View source and confirm the `application/ld+json` block is present and parses.
- Visit `/jobs/definitely-not-a-real-slug` and confirm **410**:
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/jobs/definitely-not-a-real-slug
  ```
  Expected: `410`
- Visit `/about` and confirm the User-Agent string shown matches what the connector sends.

- [ ] **Step 6: Confirm the key-isolation test still passes**

Run: `npm test tests/db/key-isolation.test.ts`
Expected: PASS — no file under `app/` references the admin client.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add job detail page, JSON-LD, 410 handling, and about page"
```

---

### Task 14: Scheduled ingest and deploy

**Files:**
- Create: `.github/workflows/ingest.yml`

**Interfaces:**
- Consumes: `npm run ingest` / `dedupe` / `expire` (Tasks 9–11)
- Produces: a live site and a cron that keeps it fresh

- [ ] **Step 1: Write `.github/workflows/ingest.yml`**

The three steps run in order and each is allowed to fail without blocking the next, because a failed ingest must not prevent expiry from running.

```yaml
name: ingest

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SITE_URL: ${{ secrets.NEXT_PUBLIC_SITE_URL }}
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - name: Fetch postings
        run: npm run ingest
      - name: Rebuild canonical jobs
        if: always()
        run: npm run dedupe
      - name: Expire stale jobs
        if: always()
        run: npm run expire
```

- [ ] **Step 2: Add the repository secrets**

In GitHub → Settings → Secrets and variables → Actions, add the four secrets above. **`SUPABASE_SERVICE_ROLE_KEY` belongs here and only here** — never in Vercel's client-side env, never in the repo.

- [ ] **Step 3: Trigger the workflow manually and confirm it succeeds**

```bash
gh workflow run ingest
gh run watch
```

Expected: all three steps green, structured JSON logs visible in the run output.

- [ ] **Step 4: Deploy to Vercel**

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add NEXT_PUBLIC_SITE_URL production
npx vercel --prod
```

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel. The web app never needs it.

Phase 1 ships on the Vercel-provided URL; a custom domain is attached once the brand name is settled.

- [ ] **Step 5: Verify the deployment end to end**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>.vercel.app/
curl -s https://<deployment>.vercel.app/ | grep -c "job"
curl -sI https://<deployment>.vercel.app/ | grep -i "content-security-policy"
```

Then, on a phone or a 360px-wide window: search for a nursing job, open it, and confirm the "Apply on …" button lands on the hospital's own posting.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add scheduled ingest workflow"
```

---

## Definition of Done

Phase 1 is complete when all of the following hold:

- [ ] A stranger on a phone can search real Ontario hospital jobs at a public URL, with no account.
- [ ] "Apply on …" lands on the employer's own posting, not an aggregator.
- [ ] `npm test` passes, including the RLS test against the live database and the key-isolation test.
- [ ] Running `npm run ingest` twice reports `inserted = 0` on the second run.
- [ ] `npm run dedupe` reports **zero** fingerprint collisions.
- [ ] The anon key returns no rows from `raw_postings`, `ingest_runs`, `employers`, or `job_sources`.
- [ ] A non-existent job URL returns **410**.
- [ ] A job page emits valid `JobPosting` JSON-LD.
- [ ] The scheduled workflow has completed at least one unattended run.
- [ ] The site is usable at 360px with visible focus rings throughout.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: §3.2 crawling rules → Tasks 8 and 13 (User-Agent, limiter, about page); §4 connector contract → Tasks 7–8; §5 schema, dedupe, freshness → Tasks 5, 10, 11; §6.1–6.4 routes → Tasks 12–13; §6.5 SEO → Task 13; §6.6 security → Tasks 5, 6, 13; §6.7 accessibility → Tasks 12–13 verification steps; §7 error handling → Task 9; §8 testing → Tasks 2, 3, 6, 7, 10.

**Three deliberate deviations from the spec**, each recorded at its task:
1. `jobs.category` is **nullable** (Task 4) — Workday supplies no NOC codes, and a wrong category is worse than an absent one.
2. `employers.default_city` is **added** (Task 5) — Workday exposes no city field, only a facility string.
3. The `Connector` interface gains **`hydrate()`** (Task 7) — the list endpoint returns stubs.

**Deferred, as the spec requires:** Adzuna, Job Bank, Claude classification fallback, auth and alerts, wage grids, licensing and IEN facets, geocoding, sitemap and facet landing pages, LTC and home-care employers, the full design pass, and the shift band. Shift and salary data *are* captured where SHN's header supplies them, but nothing renders them yet.

**Known weak point to watch during execution:** `parseWorkdayList` uses `bulletFields[0]` as the source job id, falling back to `externalPath`. Confirm against the CHEO and Oak Valley fixtures that `bulletFields` is populated there too; if it is not, the fallback keeps ingestion correct but makes ids uglier.

