# MedCareer v2 "Apple style" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the four existing MedCareer routes into the v2 Apple visual system and add three new `/browse` landing routes, without inventing any data the database does not hold.

**Architecture:** All pages stay React Server Components with no client-side data fetching and no JavaScript requirement. A single `@theme` token block in `app/globals.css` plus a shared class-constant module (`lib/ui/styles.ts`) carry the design system so no hex value is scattered through JSX. New landing routes read the same `jobs` table through the existing anon-key server client; all derived facts flow through two new pure modules (`lib/jobs/city-slug.ts`, `lib/jobs/glance.ts`) that are unit-tested in isolation.

**Tech Stack:** Next.js 16.3.4 (App Router, typed routes), React 19.2.8, Tailwind CSS v4 (`@theme`), TypeScript strict, Supabase (`@supabase/supabase-js`), Zod v4, Vitest 5 (node environment).

**Spec:** `docs/superpowers/specs/2026-09-12-medcareer-v2-apple-design.md`. Read it before starting. Section references below (§3, §6.3 …) point at it.

## Global Constraints

Every task's requirements implicitly include this section.

- **Read `node_modules/next/dist/docs/` before writing route code.** This is Next.js 16; APIs differ from training data. `params` and `searchParams` are `Promise`s and must be awaited.
- **TypeScript strict. No `any` at module boundaries.**
- **Check the `error` channel on every Supabase call.** `supabase-js` resolves `{ data, error }` rather than rejecting. An unchecked call renders a false "0 jobs". This defect has shipped four times in this project — do not make it five.
- **Every new route needs `export const dynamic = 'force-dynamic';`** A statically prerendered route bakes its bootstrap `<script>` tags at build time, before any per-request nonce exists, and the nonce CSP in `proxy.ts` then blocks them so the page never hydrates. Precedent and reasoning: `app/about/page.tsx`.
- **`target="_blank" rel="noopener noreferrer nofollow"`** on every apply link.
- **No auth code, no email capture, no account.** That absence is a product guarantee.
- **No webfonts.** `next/font` must not appear anywhere after Task 1. Do not add a Google Fonts `<link>` — `font-src 'self'` would block it.
- **Design tokens are referenced as `[var(--color-x)]` arbitrary values**, matching the existing codebase convention. Do not use Tailwind's generated `bg-slate` style utilities — `slate` and `meta` would collide with Tailwind's default palette names.
- **Colour literals belong in `app/globals.css` only.** No raw hex in a component after Task 1.
- **Accessibility floor:** usable at 360px with no horizontal overflow, visible focus rings, WCAG AA contrast, real `<label>`s, keyboard navigable, real form controls inside GET forms.
- **Never render a placeholder where data is missing.** Omit the element. No "—", no "null", no invented value.
- **Commit after every task.** Use `git add <exact paths>`, never `git add -A`.
- **`.env.local` must never be deleted or overwritten.** Tests need it loaded.

## File Structure

**New files**

| Path | Responsibility |
|---|---|
| `lib/ui/styles.ts` | Shared Tailwind class-string constants (container, card, pill, chip, field). Single source for repeated design-system classes. |
| `lib/taxonomy/blurbs.ts` | Ten per-discipline description strings (§6.3A). Isolated so copy can be reviewed and corrected in one place. |
| `lib/jobs/city-slug.ts` | `slugifyCity`, `resolveCity` — URL slug ↔ stored city name. Pure. |
| `lib/jobs/glance.ts` | `buildGlance` — derives the "At a glance" rows from a job row set (§6.3B). Pure. |
| `lib/jobs/landing.ts` | Shared Supabase reads for the landing routes (city set, pair set, counts). |
| `components/LinkCountCard.tsx` | White aside card of label + right-aligned count links. Used by both landing routes and the hub. |
| `components/LandingJobList.tsx` | Capped white list of jobs plus the "See all N jobs" link. |
| `components/GlancePanel.tsx` | Renders `buildGlance` output as a white card. |
| `app/browse/page.tsx` | Hub (§6.4). |
| `app/browse/[city]/page.tsx` | City landing (§6.5). |
| `app/browse/[city]/[discipline]/page.tsx` | City × discipline landing (§6.5). |
| `tests/lib/city-slug.test.ts` | Slug round-trip and rejection cases. |
| `tests/lib/glance.test.ts` | Derivation, especially pay-row absence. |
| `tests/lib/query-string.test.ts` | `buildJobsQuery` round-trip, including `employer`. |

**Modified files**

| Path | Change |
|---|---|
| `app/globals.css` | Replace the v1 palette wholesale with v2 tokens; new font stack. |
| `app/layout.tsx` | Remove both `next/font/google` imports and their wiring. |
| `components/Header.tsx` | Dark bar → sticky translucent light bar. |
| `components/Footer.tsx` | Dark → light. |
| `components/JobCard.tsx` | Bordered row → white-list row. |
| `components/FacetGroup.tsx` | Restyle to the v2 sidebar group. |
| `components/SearchForm.tsx` | Add city select; restyle to the v2 top bar. |
| `components/Pagination.tsx` | Restyle to outline pills. |
| `components/HiddenFilterFields.tsx` | Carry `employer`. |
| `components/Stat.tsx` | Restyle for the dark rounded panel. |
| `components/DisciplineTile.tsx` | Restyle to the v2 tile. |
| `components/PostedTodayRow.tsx` | **Renamed** to `components/PostedTodayCard.tsx`; row → card. |
| `lib/schemas/search-params.ts` | Add `employer` facet. |
| `lib/jobs/query-string.ts` | Add `employer` to `JobsQuery` and the builder. |
| `app/page.tsx` | Re-skin; drop the cut sections. |
| `app/jobs/page.tsx` | Re-skin; add employer facet and the `<details>` disclosure. |
| `app/jobs/[slug]/page.tsx` | Re-skin. |
| `app/about/page.tsx` | Re-skin. |
| `app/not-found.tsx` | Re-skin. |
| `tests/lib/search-params.test.ts` | Cover `employer`. |

**Task order and dependencies**

```
Task 1 (tokens + shell) ─┬─> Task 3 (/jobs)      ─> Task 12 (verify)
                         ├─> Task 4 (/)          ─> Task 12
                         ├─> Task 5 (/jobs/slug) ─> Task 12
                         └─> Task 6 (/about,404) ─> Task 12
Task 2 (employer param) ──> Task 3
Task 7 (city-slug, blurbs) ─┬─> Task 9 (hub) ─> Task 10 (/browse/[city]) ─> Task 11 (pair)
Task 8 (glance) ────────────┘
```

Tasks 2, 7 and 8 are pure logic and can be done in any order relative to the re-skin tasks.

---

### Task 1: Design tokens, typeface and shell

Establishes the whole visual system. Every later task depends on the tokens and class
constants defined here.

**Files:**
- Modify: `app/globals.css` (replace entire file)
- Modify: `app/layout.tsx` (replace entire file)
- Modify: `components/Header.tsx` (replace entire file)
- Modify: `components/Footer.tsx` (replace entire file)
- Create: `lib/ui/styles.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--color-canvas`, `--color-surface`,
  `--color-surface-hover`, `--color-ink`, `--color-slate`, `--color-meta`, `--color-rule`,
  `--color-divider`, `--color-chip`, `--color-chip-hover`, `--color-signal`,
  `--color-signal-hover`, `--color-link`, `--color-dark-muted`, `--color-header-bg`,
  `--color-header-rule`. From `lib/ui/styles.ts`, the exported string constants
  `CONTAINER`, `SECTION`, `CARD`, `TILE`, `FIELD`, `PILL_PRIMARY`, `PILL_OUTLINE`,
  `CHIP`, `EYEBROW`, `H1`, `H2`, `H3`, `LIST`, `LIST_ROW`.

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  /* Palette from the v2 design canvas ("MedCareer v2 - Apple style.dc.html").
     Do not let these drift and do not add raw hex to components.
     --color-signal is the MedCareer brand green, deliberately kept in place of
     the canvas's Apple blue for primary actions (spec section 1, decision 4). */
  --color-canvas: #f5f5f7;
  --color-surface: #ffffff;
  --color-surface-hover: #fbfbfd;
  --color-ink: #1d1d1f;
  --color-slate: #6e6e73;
  --color-meta: #86868b;
  --color-rule: #d2d2d7;
  --color-divider: #ececf0;
  --color-chip: #e8e8ed;
  --color-chip-hover: #dcdce1;
  --color-signal: #0F5C4A;
  --color-signal-hover: #0B4437;
  --color-link: #0066cc;
  --color-dark-muted: #a1a1a6;
  --color-header-bg: rgba(251, 251, 253, 0.82);
  --color-header-rule: rgba(0, 0, 0, 0.08);

  /* The canvas asks for -apple-system/SF Pro. On Windows that chain falls
     through to Arial, which is what the design was reviewed and approved in,
     so the approved rendering wins over the canvas's stated intent (spec 2.1).
     No webfont is loaded; font-src 'self' stays trivially met. */
  --font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif;
}

body {
  background: var(--color-canvas);
  color: var(--color-ink);
  font-size: 17px;
  line-height: 1.47;
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--color-link);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}

input,
select,
button {
  font-family: inherit;
  font-size: inherit;
  letter-spacing: inherit;
}

:focus-visible {
  outline: 3px solid rgb(15 92 74 / 0.5);
  outline-offset: 2px;
  border-radius: 4px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Create `lib/ui/styles.ts`**

```ts
/** Shared Tailwind class strings for the v2 design system.
 *
 * These exist so the repeated geometry of the canvas — the 1024px container,
 * the 18px card, the 980px pill — is written once. Colour always goes through
 * a [var(--color-*)] token; no component carries a raw hex value. */

/** 1024px measure with the canvas's 22px gutter. */
export const CONTAINER = 'mx-auto w-full max-w-[1024px] px-[22px]';

/** A home-page band: container plus the canvas's fluid top padding. */
export const SECTION = `${CONTAINER} pt-[clamp(40px,6vw,64px)]`;

/** White 18px-radius surface — cards, result lists, panels. */
export const CARD = 'rounded-[18px] bg-[var(--color-surface)]';

/** White 14px-radius surface — the smaller discipline/city tiles. */
export const TILE =
  'flex min-h-[56px] items-center justify-between gap-3 rounded-[14px] bg-[var(--color-surface)] px-[18px] py-4 text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:no-underline';

/** Text input / select shell. */
export const FIELD =
  'min-h-[46px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-surface)] px-[15px] py-[11px] text-[var(--color-ink)]';

/** Primary action. Brand green, 980px pill. */
export const PILL_PRIMARY =
  'inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--color-signal)] px-[23px] py-3 text-[17px] text-white no-underline hover:bg-[var(--color-signal-hover)] hover:text-white hover:no-underline';

/** Secondary action — white pill with a hairline. */
export const PILL_OUTLINE =
  'inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-[14px] py-2 text-sm text-[var(--color-ink)] no-underline hover:border-[var(--color-meta)] hover:text-[var(--color-ink)] hover:no-underline';

/** Removable active-filter chip. */
export const CHIP =
  'inline-flex min-h-[36px] items-center gap-[7px] rounded-full bg-[var(--color-chip)] py-2 pl-[14px] pr-3 text-sm text-[var(--color-ink)] no-underline hover:bg-[var(--color-chip-hover)] hover:text-[var(--color-ink)] hover:no-underline';

/** Hero kicker above an h1. */
export const EYEBROW = 'text-[19px] text-[var(--color-slate)]';

export const H1 =
  'text-balance font-semibold leading-[1.06] tracking-[-0.025em] text-[clamp(34px,5.6vw,56px)]';
export const H2 = 'font-semibold tracking-[-0.02em] text-[clamp(26px,3.6vw,36px)]';
export const H3 = 'font-semibold tracking-[-0.015em] text-[17px]';

/** White result list and its divided rows. */
export const LIST = `${CARD} m-0 list-none overflow-hidden p-0`;
export const LIST_ROW = 'border-t border-[var(--color-divider)] first:border-t-0';
```

- [ ] **Step 3: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

// No next/font. The v2 design uses a Helvetica/Arial stack (see globals.css
// and spec 2.1), so there is no webfont to self-host and nothing for the
// CSP's font-src 'self' to permit. Do not reintroduce next/font/google here.

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[var(--color-canvas)] font-sans text-[var(--color-ink)]">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Replace `components/Header.tsx`**

```tsx
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { CONTAINER } from '@/lib/ui/styles';

// Sticky translucent bar from the v2 canvas. Two deliberate departures, both
// recorded in spec 2.3:
//
//  - The canvas's fourth nav item is a green "Get job alerts" pill. There is
//    no alerts backend and no decision to store email addresses, so the slot
//    is left EMPTY rather than refilled with a substitute CTA.
//  - The canvas labels its second item "Save jobs", but that item's handler
//    opens a landing page — there is no save feature to build. The slot keeps
//    its position and destination; the label says what it actually does.
export function Header() {
  const navLink =
    'py-[11px] text-[var(--color-ink)] opacity-[.88] no-underline hover:opacity-100 hover:no-underline';

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-header-rule)] bg-[var(--color-header-bg)] backdrop-blur-[20px] backdrop-saturate-[180%]">
      <div className={`${CONTAINER} flex min-h-[48px] flex-wrap items-center gap-x-[26px] gap-y-1.5`}>
        <Link
          href="/"
          className="py-[11px] text-[19px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:no-underline"
        >
          {SITE.name}
        </Link>
        <nav
          aria-label="Primary"
          className="ml-auto flex flex-wrap items-center gap-x-[26px] gap-y-1.5 text-[13px] tracking-[-0.005em]"
        >
          <Link href="/jobs" className={navLink}>Search</Link>
          <Link href="/browse" className={navLink}>Browse by city</Link>
          <Link href="/about" className={navLink}>About</Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Replace `components/Footer.tsx`**

```tsx
import Link from 'next/link';
import { SITE } from '@/lib/site';
import { CONTAINER } from '@/lib/ui/styles';

// Light footer from the v2 canvas (v1's was dark). All four destinations are
// real: "Browse by city" now has landing pages behind it, and "Employer
// removal requests" goes to the live section on /about rather than the
// canvas's dead onClick.
export function Footer() {
  const link =
    'text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:underline';

  return (
    <footer className="mt-auto border-t border-[var(--color-rule)] bg-[var(--color-canvas)]">
      <div className={`${CONTAINER} pb-10 pt-7 text-[13px] text-[var(--color-slate)]`}>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-[26px] gap-y-1">
          <Link href="/jobs" className={link}>Search jobs</Link>
          <Link href="/browse" className={link}>Browse by city</Link>
          <Link href="/about" className={link}>About</Link>
          <Link href="/about#employer-removal" className={link}>Employer removal requests</Link>
        </nav>
        <p className="mt-4 border-t border-[var(--color-rule)] pt-4">
          Healthcare jobs across Ontario. Listings belong to the employers who posted them;{' '}
          {SITE.name} links, it does not republish applications.
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Survey the now-dead `font-display` classes**

`--font-display` no longer exists, so every `font-display` class is a no-op that silently
renders in the body face.

Run: `grep -rn "font-display" app components`

Expected: matches across `app/page.tsx`, `app/about/page.tsx`, `app/not-found.tsx`,
`app/jobs/page.tsx`, `app/jobs/[slug]/page.tsx`, and several components. Leave them —
Tasks 3 to 6 rewrite each of those files and drop them in passing. This step exists so the
implementer knows the intermediate state is expected, not broken.

- [ ] **Step 7: Verify types and lint**

Run: `npx tsc --noEmit && npx eslint`
Expected: no errors. An unused-import error in `app/layout.tsx` means the font imports
were not fully removed.

- [ ] **Step 8: Verify the build**

Run: `npx next build`
Expected: build succeeds; the same route list as before, no new routes yet.

- [ ] **Step 9: Commit**

```bash
git add app/globals.css app/layout.tsx components/Header.tsx components/Footer.tsx lib/ui/styles.ts
git commit -m "feat(design): v2 Apple tokens, Helvetica stack, translucent shell"
```

---

### Task 2: `employer` search parameter

Pure logic, TDD. The v2 canvas's filter sidebar has an Employer group; the schema has no
such field yet.

> **Known redundancy, do not "fix" it (spec section 4):** employer and city are 1:1 in
> current data (SHN to Toronto, Oak Valley to Markham, CHEO to Ottawa), so this facet
> returns exactly what the city control returns. It ships because the canvas has it and
> because the overlap is a property of today's narrow data, not of the design.

**Files:**
- Modify: `lib/schemas/search-params.ts`
- Modify: `lib/jobs/query-string.ts`
- Modify: `components/HiddenFilterFields.tsx`
- Test: `tests/lib/search-params.test.ts` (extend)
- Test: `tests/lib/query-string.test.ts` (create)

**Interfaces:**
- Consumes: existing `parseSearchParams`, `SearchParams`, `buildJobsQuery`, `JobsQuery`.
- Produces: `SearchParams.employer?: string[]`, `JobsQuery.employer?: string[]`, and
  `HiddenFilterFields` accepting `employer?: string[]`. Task 3 relies on all three.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('parseSearchParams', ...)` block in
`tests/lib/search-params.test.ts`:

```ts
  it('accepts multiple employers and de-duplicates them', () => {
    expect(
      parseSearchParams({ employer: ['CHEO', 'Oak Valley Health', 'CHEO'] }).employer,
    ).toEqual(['CHEO', 'Oak Valley Health']);
  });

  it('accepts a single employer as a one-element array', () => {
    expect(parseSearchParams({ employer: 'CHEO' }).employer).toEqual(['CHEO']);
  });

  it('trims surrounding whitespace on an employer name', () => {
    expect(parseSearchParams({ employer: '  CHEO  ' }).employer).toEqual(['CHEO']);
  });

  it('drops an over-long employer name rather than querying with it', () => {
    expect(parseSearchParams({ employer: 'x'.repeat(200) }).employer).toBeUndefined();
  });

  it('drops an empty employer value', () => {
    expect(parseSearchParams({ employer: '   ' }).employer).toBeUndefined();
  });

  it('caps a flood of employer values at the facet limit', () => {
    const flood = Array.from({ length: 500 }, (_, i) => `Employer ${i}`);
    expect(parseSearchParams({ employer: flood }).employer).toHaveLength(20);
  });
```

Create `tests/lib/query-string.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { parseSearchParams } from '@/lib/schemas/search-params';

describe('buildJobsQuery', () => {
  it('returns bare /jobs for an empty query', () => {
    expect(buildJobsQuery({})).toBe('/jobs');
  });

  it('repeats the key for each employer', () => {
    expect(buildJobsQuery({ employer: ['CHEO', 'Oak Valley Health'] })).toBe(
      '/jobs?employer=CHEO&employer=Oak+Valley+Health',
    );
  });

  it('omits the default sort and the first page', () => {
    expect(buildJobsQuery({ sort: 'newest', page: 1, city: ['Ottawa'] })).toBe(
      '/jobs?city=Ottawa',
    );
  });

  it('round-trips scalars and the employer facet through parseSearchParams', () => {
    const url = buildJobsQuery({
      q: 'nurse',
      employer: ['CHEO'],
      sort: 'salary',
      page: 3,
    });
    const parsed = parseSearchParams(
      Object.fromEntries(new URL(url, 'http://x').searchParams.entries()),
    );
    expect(parsed.q).toBe('nurse');
    expect(parsed.sort).toBe('salary');
    expect(parsed.page).toBe(3);
    expect(parsed.employer).toEqual(['CHEO']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/search-params.test.ts tests/lib/query-string.test.ts`
Expected: FAIL. The `employer` assertions report `undefined`; `query-string.test.ts` fails
on the `employer=` expectation.

- [ ] **Step 3: Add `employer` to `lib/schemas/search-params.ts`**

Employer names are free-text data, not an enum, so they validate exactly like `city`.
Generalise the city-specific pieces.

Replace the `MAX_CITY_LENGTH` constant and `CitySchema`:

```ts
const MAX_FACET_VALUES = 20;
const MAX_NAME_LENGTH = 80;
```

```ts
const NameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
```

Replace `parseCityArray` entirely:

```ts
/** Validates a free-text facet (city, employer) whose values are data rather
 * than a fixed enum: trims, drops empty and over-long entries individually,
 * and de-duplicates. One hostile value must not clear a good one. */
function parseNameArray(value: string | string[] | undefined): string[] | undefined {
  const arr = toArray(value);
  if (!arr) return undefined;
  const kept = [
    ...new Set(
      arr
        .map((v) => NameSchema.safeParse(v))
        .filter((r) => r.success)
        .map((r) => r.data),
    ),
  ];
  return kept.length ? kept : undefined;
}
```

Add the field to `SearchParams`:

```ts
export type SearchParams = {
  q?: string;
  city?: string[];
  category?: Category[];
  employment_type?: EmploymentType[];
  employer?: string[];
  sort: Sort;
  page: number;
};
```

And to the object returned by `parseSearchParams`:

```ts
    city: parseNameArray(input.city),
    category: parseEnumArray(input.category, CATEGORIES),
    employment_type: parseEnumArray(input.employment_type, EMPLOYMENT_TYPES),
    employer: parseNameArray(input.employer),
```

- [ ] **Step 4: Add `employer` to `lib/jobs/query-string.ts`**

```ts
export type JobsQuery = {
  q?: string;
  city?: string[];
  category?: Category[];
  employment_type?: EmploymentType[];
  employer?: string[];
  sort?: Sort;
  page?: number;
};
```

Inside `buildJobsQuery`, immediately after the `employment_type` loop:

```ts
  for (const e of params.employer ?? []) sp.append('employer', e);
```

- [ ] **Step 5: Carry `employer` in `components/HiddenFilterFields.tsx`**

Add to the destructured props, the prop type, and the output, following the existing
pattern exactly:

```tsx
  employer,
```

```tsx
  employer?: string[];
```

```tsx
      {employer?.map((v) => <input key={`employer-${v}`} type="hidden" name="employer" value={v} />)}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/search-params.test.ts tests/lib/query-string.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Run the full suite and type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green. `parseCityArray` no longer exists — a `tsc` error naming it means a
call site was missed in Step 3.

- [ ] **Step 8: Commit**

```bash
git add lib/schemas/search-params.ts lib/jobs/query-string.ts components/HiddenFilterFields.tsx tests/lib/search-params.test.ts tests/lib/query-string.test.ts
git commit -m "feat(search): add employer facet parameter"
```

---

### Task 3: `/jobs` search re-skin, employer facet, mobile disclosure

**Files:**
- Modify: `lib/jobs/facets.ts`
- Modify: `components/SearchForm.tsx` (replace entire file)
- Modify: `components/FacetGroup.tsx` (replace entire file)
- Modify: `components/JobCard.tsx` (replace entire file)
- Modify: `components/Pagination.tsx` (replace entire file)
- Modify: `app/jobs/page.tsx`

**Interfaces:**
- Consumes: `SearchParams.employer`, `JobsQuery.employer`, `HiddenFilterFields` with
  `employer` (Task 2); `CARD`, `CONTAINER`, `FIELD`, `PILL_PRIMARY`, `PILL_OUTLINE`,
  `CHIP`, `LIST`, `LIST_ROW`, `H2` (Task 1).
- Produces: `FacetRow` gains `employer_name: string`. Task 4 relies on that widened type.

> **One deviation from the canvas, by necessity.** The canvas collapses the filter panel
> on narrow screens via client state. The no-JS equivalent is `<details>`, but CSS cannot
> force a `<details>` open on wide screens — `::details-content` overrides are not yet
> cross-browser. So the panel renders as `<details open>` with its `<summary>` hidden from
> `md` upward: always open on desktop, open-but-collapsible on mobile. Do not replace this
> with a JavaScript toggle; `/jobs` must work with scripting disabled.

- [ ] **Step 1: Widen `FacetRow` in `lib/jobs/facets.ts`**

```ts
export type FacetRow = {
  category: string | null;
  city: string;
  employment_type: string | null;
  employer_name: string;
};
```

`tally` is unchanged — it already accepts any `keyof FacetRow`.

- [ ] **Step 2: Replace `components/SearchForm.tsx`**

The v2 top bar carries three controls. City moves up from the sidebar to match the canvas;
it is single-select here, while `SearchParams.city` stays an array so existing multi-city
links and chips keep working.

```tsx
import { SORTS, type SearchParams } from '@/lib/schemas/search-params';
import { HiddenFilterFields } from '@/components/HiddenFilterFields';
import { CONTAINER, FIELD, PILL_PRIMARY } from '@/lib/ui/styles';

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  newest: 'Newest first',
  salary: 'Highest pay',
};

/** Keyword + city + sort bar on /jobs, matching the v2 canvas's three-control
 * header. A real GET form: submitting reloads /jobs with a new query string,
 * so results stay linkable and back/forward work with no client-side script.
 *
 * The facet checkboxes live in a separate form in the sidebar, so the hidden
 * fields here replicate the facet selections this form does not render
 * (category, employment type, employer) and the sidebar form replicates the
 * ones it does not render (q, sort, city). Without that, submitting either
 * form would silently clear the other's selections. */
export function SearchForm({ params, cities }: { params: SearchParams; cities: string[] }) {
  return (
    <form method="get" action="/jobs" className={`${CONTAINER} flex flex-wrap items-center gap-2.5 py-4`}>
      <HiddenFilterFields
        category={params.category}
        employment_type={params.employment_type}
        employer={params.employer}
      />

      <div className={`${FIELD} flex flex-1 basis-60 items-center gap-2.5 py-0`}>
        <span aria-hidden="true" className="text-[15px] text-[var(--color-meta)]">⌕</span>
        <label htmlFor="q" className="sr-only">Role or keyword</label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Registered nurse, PSW, MLT…"
          defaultValue={params.q ?? ''}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-offset-[6px]"
        />
      </div>

      <label htmlFor="city" className="sr-only">City</label>
      <select id="city" name="city" defaultValue={params.city?.[0] ?? ''} className={`${FIELD} flex-1 basis-[150px]`}>
        <option value="">All of Ontario</option>
        {cities.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <label htmlFor="sort" className="sr-only">Sort by</label>
      <select id="sort" name="sort" defaultValue={params.sort} className={`${FIELD} flex-1 basis-[150px]`}>
        {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
      </select>

      <button type="submit" className={PILL_PRIMARY}>Search</button>
    </form>
  );
}
```

- [ ] **Step 3: Replace `components/FacetGroup.tsx`**

```tsx
export type FacetItem = { value: string; label: string; count: number; checked: boolean };

/** One checkbox group in the /jobs filter sidebar, styled to the v2 canvas.
 * Real <input type="checkbox"> controls rather than a JS widget, so the
 * enclosing GET form works with scripting disabled and the back button
 * behaves correctly. */
export function FacetGroup({
  label,
  name,
  items,
}: {
  label: string;
  name: string;
  items: FacetItem[];
}) {
  if (items.length === 0) return null;

  return (
    <fieldset className="w-full border-0 border-t border-[var(--color-rule)] px-0 pb-1 pt-3.5">
      <legend className="w-full px-0 text-[13px] font-semibold uppercase tracking-[.02em] text-[var(--color-slate)]">
        {label}
      </legend>
      <div className="mt-2.5 flex flex-col gap-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex min-h-[34px] cursor-pointer items-center gap-2.5 text-base text-[var(--color-ink)]"
          >
            <input
              type="checkbox"
              name={name}
              value={item.value}
              defaultChecked={item.checked}
              className="m-0 h-5 w-5 flex-none cursor-pointer accent-[var(--color-signal)]"
            />
            <span className="flex-1">{item.label}</span>
            <span className="text-sm tabular-nums text-[var(--color-meta)]">{item.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 4: Replace `components/JobCard.tsx`**

```tsx
import Link from 'next/link';
import { postedAgo, formatSalary } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { LIST_ROW } from '@/lib/ui/styles';

export type JobCardData = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  category: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

function isCategory(value: string | null): value is Category {
  return value !== null && value in CATEGORY_LABELS;
}

function isEmploymentType(value: string | null): value is EmploymentType {
  return value !== null && value in EMPLOYMENT_LABELS;
}

/** One row inside the white result list. The v2 canvas has no closes-badge
 * counterpart here: jobs.closes_at is null on every row, so there is no
 * deadline to show (spec section 8). */
export function JobCard({ job }: { job: JobCardData }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employment = isEmploymentType(job.employment_type) ? EMPLOYMENT_LABELS[job.employment_type] : null;
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;
  const meta = [salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ');

  return (
    <li className={LIST_ROW}>
      <Link
        href={`/jobs/${job.slug}`}
        className="flex flex-wrap items-start gap-3 px-5 py-[18px] text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] hover:no-underline"
      >
        <div className="min-w-0 flex-1 basis-[300px]">
          <h2 className="m-0 text-[21px] font-semibold leading-[1.22] tracking-[-0.015em]">{job.title}</h2>
          <p className="mt-1 text-base">
            {job.employer_name}
            {job.facility_name ? ` · ${job.facility_name}` : ''}
          </p>
          <p className="mt-px text-base text-[var(--color-slate)]">{job.city}, {job.province}</p>
          <p className="mt-2 text-[15px] tabular-nums text-[var(--color-slate)]">{meta}</p>
        </div>
        {categoryLabel && (
          <span className="whitespace-nowrap text-sm text-[var(--color-meta)]">{categoryLabel}</span>
        )}
      </Link>
    </li>
  );
}
```

- [ ] **Step 5: Replace `components/Pagination.tsx`**

```tsx
import Link from 'next/link';
import { buildJobsQuery, type JobsQuery } from '@/lib/jobs/query-string';
import { PILL_OUTLINE } from '@/lib/ui/styles';

export function Pagination({
  page,
  total,
  pageSize,
  query,
}: {
  page: number;
  total: number;
  pageSize: number;
  query: JobsQuery;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => buildJobsQuery({ ...query, page: p });
  const pill = `${PILL_OUTLINE} min-h-[44px] px-5 text-base`;
  const disabled =
    'inline-flex min-h-[44px] items-center rounded-full border border-[var(--color-rule)] px-5 py-2 text-base text-[var(--color-meta)]';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-5">
      {page > 1 ? <Link href={href(page - 1)} className={pill}>Previous</Link> : <span className={disabled}>Previous</span>}
      <span className="text-[15px] text-[var(--color-slate)]">Page {page} of {lastPage}</span>
      {page < lastPage ? <Link href={href(page + 1)} className={pill}>Next</Link> : <span className={disabled}>Next</span>}
    </nav>
  );
}
```

- [ ] **Step 6: Update the queries in `app/jobs/page.tsx`**

Add the employer filter to the results query, directly after the `employment_type` line:

```ts
  if (params.employer?.length) resultsQuery = resultsQuery.in('employer_name', params.employer);
```

Widen the facet query's column list:

```ts
  let facetQuery = db.from('jobs').select('category,city,employment_type,employer_name').eq('is_active', true);
```

Add the employer match predicate alongside the existing three, and widen the other three so
each group still counts against the *other* groups' selections:

```ts
  const matchesEmployer = (r: FacetRow) => !params.employer?.length || params.employer.includes(r.employer_name);
```

Replace the four count lines:

```ts
  const categoryCounts = tally(rows.filter((r) => matchesCity(r) && matchesType(r) && matchesEmployer(r)), 'category');
  const cityCounts = tally(rows.filter((r) => matchesCategory(r) && matchesType(r) && matchesEmployer(r)), 'city');
  const typeCounts = tally(rows.filter((r) => matchesCategory(r) && matchesCity(r) && matchesEmployer(r)), 'employment_type');
  const employerCounts = tally(rows.filter((r) => matchesCategory(r) && matchesCity(r) && matchesType(r)), 'employer_name');
```

Add the employer facet items next to the existing three, and drop `cityItems` (city is now
the top-bar select, not a sidebar group):

```ts
  const employerItems: FacetItem[] = [...new Set(rows.map((r) => r.employer_name))].sort().map((e) => ({
    value: e,
    label: e,
    count: employerCounts[e] ?? 0,
    checked: params.employer?.includes(e) ?? false,
  }));
```

Add the cities list for the top-bar select:

```ts
  const cities = [...new Set(rows.map((r) => r.city))].sort();
```

- [ ] **Step 7: Add employer chips in `app/jobs/page.tsx`**

Inside `buildChips`, after the `employment_type` loop:

```ts
  for (const e of params.employer ?? []) {
    chips.push({
      key: `employer-${e}`,
      label: e,
      href: buildJobsQuery({ ...params, employer: (params.employer ?? []).filter((x) => x !== e) }),
    });
  }
```

- [ ] **Step 8: Replace the returned JSX in `app/jobs/page.tsx`**

Everything from `return (` to the closing `);` becomes:

```tsx
  return (
    <>
      <div className="border-b border-[var(--color-rule)] bg-[var(--color-surface)]">
        <SearchForm params={params} cities={cities} />
      </div>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-7 pb-[72px] pt-6`}>
        <aside className="w-full flex-1 basis-[232px] md:sticky md:top-16 md:max-w-[320px]">
          <form method="get" action="/jobs" className={`${CARD} px-[18px] pb-3.5 pt-1.5`}>
            <HiddenFilterFields q={params.q} sort={params.sort} city={params.city} />

            {/* Open by default and collapsible only below md. CSS cannot force a
                <details> open on wide screens, so the summary is hidden there
                instead and the panel simply stays open. A JS toggle would break
                the no-script guarantee. */}
            <details open className="[&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 md:hidden">
                <span className="text-[17px] font-semibold tracking-[-0.015em]">Filters</span>
                <span className={PILL_OUTLINE}>Show or hide</span>
              </summary>

              <div className="hidden items-center justify-between gap-3 py-3.5 md:flex">
                <span className="text-[17px] font-semibold tracking-[-0.015em]">Filters</span>
                <Link href="/jobs" className="text-[15px]">Clear all</Link>
              </div>

              <FacetGroup label="Discipline" name="category" items={disciplineItems} />
              <FacetGroup label="Employment type" name="employment_type" items={typeItems} />
              <FacetGroup label="Employer" name="employer" items={employerItems} />

              <button type="submit" className={`${PILL_PRIMARY} mt-3.5 w-full`}>Apply filters</button>
              <Link href="/jobs" className="mt-3 block text-center text-[15px] md:hidden">Clear all</Link>
            </details>
          </form>
        </aside>

        <main className="min-w-0 flex-[4_1_420px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h1 className={`m-0 ${H2} leading-[1.1]`}>{resultsHeading}</h1>
            <span className="text-[15px] tabular-nums text-[var(--color-slate)]">
              {total} {total === 1 ? 'job' : 'jobs'} · {citySummary}
            </span>
          </div>

          {chips.length > 0 && (
            <ul className="flex list-none flex-wrap gap-2 p-0 pt-3.5">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link href={chip.href} className={CHIP}>
                    <span>{chip.label}</span>
                    <span aria-hidden="true" className="text-[15px] leading-none text-[var(--color-slate)]">×</span>
                    <span className="sr-only">Remove filter</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {jobs.length === 0 ? (
            <div className={`${CARD} mt-4 px-7 py-12 text-center`}>
              <h2 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">
                Nothing open for that right now
              </h2>
              <p className="mx-auto mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
                Try a broader keyword, or widen the city filter to all of Ontario. New postings land
                every six hours.
              </p>
              <Link href="/jobs" className={`${PILL_PRIMARY} mt-4.5`}>Show all Ontario jobs</Link>
            </div>
          ) : (
            <>
              <ul className={`${LIST} mt-4`}>
                {jobs.map((job) => <JobCard key={job.slug} job={job} />)}
              </ul>
              <Pagination page={params.page} total={total} pageSize={PAGE_SIZE} query={params} />
            </>
          )}
        </main>
      </div>
    </>
  );
```

Update the imports at the top of the file to match — remove `FacetItem`'s now-unused
`cityItems` construction, and add:

```ts
import { CARD, CHIP, CONTAINER, H2, LIST, PILL_OUTLINE, PILL_PRIMARY } from '@/lib/ui/styles';
```

- [ ] **Step 9: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean. A `FacetRow` error means Step 1 was skipped; an unused-variable error for
`cityItems` or `cityCounts` means Step 6 left them behind — delete them.

- [ ] **Step 10: Verify against live data**

Run: `npx next dev`, then in a browser:
- `/jobs` lists real jobs in one white rounded list.
- Tick a Discipline box, press **Apply filters** — the count narrows and a chip appears.
- Tick an Employer box — narrows correctly. (It will mirror the city filter; that is the
  known 1:1 redundancy, not a bug.)
- Change the city select and press **Search** — filters, and the discipline facet counts
  update.
- Change sort to *Highest pay* — order changes.
- Click a chip's × — that one filter is removed, the others survive.
- At 360px the sidebar stacks above results and the Filters summary appears; collapsing it
  hides the groups. No horizontal scrollbar.
- Disable JavaScript entirely and repeat the first three checks — all must still work.

- [ ] **Step 11: Commit**

```bash
git add lib/jobs/facets.ts components/SearchForm.tsx components/FacetGroup.tsx components/JobCard.tsx components/Pagination.tsx app/jobs/page.tsx
git commit -m "feat(jobs): v2 search re-skin with employer facet"
```

---

### Task 4: `/` home re-skin

**Files:**
- Delete: `components/PostedTodayRow.tsx`
- Create: `components/PostedTodayCard.tsx`
- Modify: `components/Stat.tsx` (replace entire file)
- Modify: `components/DisciplineTile.tsx` (replace entire file)
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `FacetRow` with `employer_name` (Task 3); style constants (Task 1).
- Produces: `PostedTodayCard` taking `{ job: PostedTodayJob }` where `PostedTodayJob` keeps
  its current shape. Nothing later depends on this task.

> **Cut sections (spec section 8).** The canvas's "Closing this week" band and its
> email-alert band are both omitted, and per decision 1.2 **nothing replaces them** — the
> page ends on the discipline tiles. The hero's secondary link "Set up job alerts ›" is
> omitted too, leaving the primary pill alone on its row. Do not invent filler.

- [ ] **Step 1: Create `components/PostedTodayCard.tsx` and delete the row version**

```tsx
import Link from 'next/link';
import { formatSalary } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { CARD } from '@/lib/ui/styles';

export type PostedTodayJob = {
  slug: string;
  title: string;
  employer_name: string;
  city: string;
  category: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
};

function isCategory(value: string | null): value is Category {
  return value !== null && value in CATEGORY_LABELS;
}

/** One card in the v2 home page's four-up "Posted today" grid. Salary is
 * pinned to the bottom with margin-top:auto so cards of differing title
 * lengths still align — and is omitted entirely when absent (60 of 153
 * listings carry no band). */
export function PostedTodayCard({ job }: { job: PostedTodayJob }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className={`${CARD} flex flex-col gap-1.5 p-5 text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] hover:no-underline`}
    >
      {categoryLabel && (
        <span className="text-xs font-semibold uppercase tracking-[.02em] text-[var(--color-slate)]">
          {categoryLabel}
        </span>
      )}
      <span className="text-[21px] font-semibold leading-[1.2] tracking-[-0.015em]">{job.title}</span>
      <span className="text-[15px] text-[var(--color-slate)]">{job.employer_name} · {job.city}</span>
      {salary && <span className="mt-auto pt-2 text-[15px] tabular-nums">{salary}</span>}
    </Link>
  );
}
```

Then: `git rm components/PostedTodayRow.tsx`

- [ ] **Step 2: Replace `components/Stat.tsx`**

```tsx
/** One figure inside the home page's dark rounded stats panel. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[clamp(34px,4.6vw,46px)] font-semibold leading-none tracking-[-0.025em] tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[15px] text-[var(--color-dark-muted)]">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `components/DisciplineTile.tsx`**

```tsx
import Link from 'next/link';
import { TILE } from '@/lib/ui/styles';

export function DisciplineTile({
  href,
  label,
  count,
}: {
  href: string;
  label: string;
  count: number;
}) {
  return (
    <Link href={href} className={TILE}>
      <span className="text-[17px] font-medium tracking-[-0.012em]">{label}</span>
      <span className="text-[15px] tabular-nums text-[var(--color-meta)]">{count}</span>
    </Link>
  );
}
```

- [ ] **Step 4: Update the query in `app/page.tsx`**

`PostedTodayCard` shows a category label, so widen the column list:

```ts
const TODAY_COLUMNS = 'slug,title,employer_name,city,category,salary_min,salary_max,salary_period';
```

`FacetRow` now includes `employer_name`, so the local intersection type is redundant:

```ts
type OverviewRow = FacetRow;
```

Leave every other query, the error checks, and the "nothing posted today" fallback exactly
as they are — they are correct and this task is a re-skin.

- [ ] **Step 5: Replace the returned JSX in `app/page.tsx`**

Everything from `return (` to the closing `);`:

```tsx
  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[820px] px-[22px] pb-[clamp(40px,6vw,64px)] pt-[clamp(56px,9vw,96px)]">
          <div className={EYEBROW}>Ontario · updated every 6 hours</div>
          <h1 className="mt-1.5 text-balance text-[clamp(38px,6.4vw,64px)] font-semibold leading-[1.06] tracking-[-0.025em]">
            Healthcare jobs across CANADA.
            <br />
            One click to apply.
          </h1>
          <p className="mx-auto mt-3.5 max-w-[30em] text-pretty text-[clamp(19px,2.4vw,25px)] leading-[1.32] tracking-[-0.015em] text-[var(--color-slate)]">
            Pulled straight from hospital career systems. Every listing applies on the employer&rsquo;s
            own page — no account, no résumé upload.
          </p>

          <div className="mt-5.5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/jobs" className={PILL_PRIMARY}>Browse {totalActive} open jobs</Link>
          </div>

          <form
            method="get"
            action="/jobs"
            className="mx-auto mt-8.5 flex max-w-[660px] flex-wrap gap-2 rounded-[18px] bg-[var(--color-canvas)] p-2.5 text-left"
          >
            <div className={`${FIELD} flex basis-full items-center gap-2.5 py-0`}>
              <span aria-hidden="true" className="text-[15px] text-[var(--color-meta)]">⌕</span>
              <label htmlFor="hero-q" className="sr-only">Role or keyword</label>
              <input
                id="hero-q"
                name="q"
                type="search"
                placeholder="Registered nurse, PSW, MLT…"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[17px] outline-offset-[6px]"
              />
            </div>
            <label htmlFor="hero-city" className="sr-only">City</label>
            <select id="hero-city" name="city" className={`${FIELD} flex-1 basis-[150px]`}>
              <option value="">All of Ontario</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" className={`${PILL_PRIMARY} flex-1 basis-[130px] rounded-xl`}>
              Search
            </button>
          </form>

          {popularSearches.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-[var(--color-meta)]">Popular:</span>
              {popularSearches.map((p) => (
                <Link key={p.label} href={p.href} className={PILL_OUTLINE}>{p.label}</Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-3.5">
          <h2 className={`m-0 ${H2}`}>Posted today</h2>
          <Link href="/jobs" className="text-[17px]">See all {totalActive} jobs ›</Link>
        </div>
        {todayJobs.length > 0 ? (
          <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3.5">
            {todayJobs.map((job) => <PostedTodayCard key={job.slug} job={job} />)}
          </div>
        ) : (
          <p className="mt-4.5 text-[17px] text-[var(--color-slate)]">
            No new postings yet — check back soon.
          </p>
        )}
        {postedToday === 0 && todayJobs.length > 0 && (
          <p className="mt-3.5 text-[15px] text-[var(--color-slate)]">
            Nothing new since midnight yet. These are the most recent postings.
          </p>
        )}
      </section>

      <section className={SECTION}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-7 rounded-[18px] bg-[var(--color-ink)] p-[clamp(28px,4vw,44px)] text-[var(--color-canvas)]">
          {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} />)}
        </div>
      </section>

      <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
        <h2 className={`m-0 ${H2}`}>Browse by discipline</h2>
        <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {disciplineTiles.map((tile) => (
            <DisciplineTile
              key={tile.category}
              href={buildJobsQuery({ category: [tile.category] })}
              label={tile.label}
              count={tile.count}
            />
          ))}
        </div>
      </section>
    </>
  );
```

Update imports: swap `PostedTodayRow` for `PostedTodayCard`, and add

```ts
import { EYEBROW, FIELD, H2, PILL_OUTLINE, PILL_PRIMARY, SECTION } from '@/lib/ui/styles';
```

- [ ] **Step 6: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean. An error naming `PostedTodayRow` means an import was missed.

- [ ] **Step 7: Verify against live data**

`npx next dev`, then check `/`:
- Hero shows the CANADA headline with the "Ontario · updated every 6 hours" eyebrow above it.
- The pill reads **Browse 153 open jobs** (or whatever the live count is), not a placeholder.
- Posted today shows four cards; because nothing is posted today right now, the
  "Nothing new since midnight yet" line must appear beneath them.
- The stats panel is dark, rounded, and shows four real figures.
- Discipline tiles show real counts and link into filtered `/jobs`.
- The page ends on the tiles. **There is no closing-soon band and no email form** — that is
  correct.
- At 360px nothing overflows horizontally.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx components/PostedTodayCard.tsx components/Stat.tsx components/DisciplineTile.tsx
git rm --cached components/PostedTodayRow.tsx 2>/dev/null || true
git commit -m "feat(home): v2 home re-skin"
```

---

### Task 5: `/jobs/[slug]` detail re-skin

**Files:**
- Modify: `app/jobs/[slug]/page.tsx`

**Interfaces:**
- Consumes: style constants (Task 1).
- Produces: nothing later depends on this task.

> Leave the data layer alone. The query, the `error` checks, the similar-jobs fallback, the
> JSON-LD object and the nonce wiring are all correct — this task changes presentation
> only. The canvas's "Closes X · apply soon" badge is omitted (spec section 8), and the
> description stays a single sanitized blob rather than the canvas's intro/duties/quals
> split, because that is what the database holds.

- [ ] **Step 1: Replace the returned JSX in `app/jobs/[slug]/page.tsx`**

Everything from `return (` to the closing `);`:

```tsx
  return (
    <>
      <script
        nonce={nonce ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="border-b border-[var(--color-rule)] bg-[var(--color-surface)]">
        <div className={`${CONTAINER} flex flex-wrap items-center py-[11px] text-sm text-[var(--color-slate)]`}>
          <Link href="/jobs">All jobs</Link>
          {categoryLabel && (
            <>
              <span className="px-[7px]">›</span>
              <Link href={buildJobsQuery({ category: [job.category as Category] })}>{categoryLabel}</Link>
            </>
          )}
          <span className="px-[7px]">›</span>
          <span className="text-[var(--color-ink)]">{job.title}</span>
        </div>
      </div>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <article className="min-w-0 flex-[3_1_400px]">
          <h1 className="m-0 text-balance text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.08] tracking-[-0.025em]">
            {job.title}
          </h1>
          <p className="mt-3 text-[19px]">
            {job.employer_name}
            {job.facility_name ? ` · ${job.facility_name}` : ''}
          </p>
          <p className="mt-0.5 text-[19px] text-[var(--color-slate)]">{job.city}, {job.province}</p>

          <div className={`${CARD} mt-6 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] px-5 py-2`}>
            {facts.map((f) => (
              <div key={f.label} className="py-3.5 pr-4">
                <div className="text-[13px] text-[var(--color-slate)]">{f.label}</div>
                <div className="mt-0.5 text-[17px] font-medium tabular-nums">{f.value}</div>
              </div>
            ))}
          </div>

          {/* Sanitized at ingest (allow-list p/br/ul/ol/li/strong/em/h3/h4, no
              attributes) — that sanitization is the only reason
              dangerouslySetInnerHTML is acceptable here. The store holds one
              blob, not the canvas's separate intro/duties/quals fields, so it
              renders as one block rather than fabricated section splits. */}
          <div
            className="mt-7 text-[17px] leading-[1.6] [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:tracking-[-0.02em] [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-xl [&_h4]:font-semibold [&_li]:mb-[7px] [&_ol]:pl-[22px] [&_p]:mb-4 [&_ul]:pl-[22px]"
            dangerouslySetInnerHTML={{ __html: job.description }}
          />

          <p className="mt-7 border-t border-[var(--color-rule)] pt-4 text-[15px] text-[var(--color-slate)]">
            Listed by {job.employer_name}. Applications are handled on their site — {SITE.name} never
            takes applications itself.
          </p>
        </article>

        <aside className="flex min-w-0 flex-1 basis-[270px] flex-col gap-3.5 md:sticky md:top-16 md:max-w-[340px]">
          <div className={`${CARD} p-5`}>
            {salary && (
              <div className="text-[clamp(24px,3.4vw,30px)] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums [overflow-wrap:anywhere]">
                {salary}
              </div>
            )}
            <div className={`text-[15px] text-[var(--color-slate)] ${salary ? 'mt-1' : ''}`}>
              {[employmentLabel, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
            </div>
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`${PILL_PRIMARY} mt-4 w-full [overflow-wrap:anywhere]`}
            >
              Apply on {job.employer_name}
            </a>
            {host && (
              <div className="mt-2.5 text-center text-[13px] text-[var(--color-meta)] [overflow-wrap:anywhere]">
                Opens {host} in a new tab
              </div>
            )}
          </div>

          {similar.length > 0 && (
            <div className={`${CARD} p-5`}>
              <div className={H3}>Similar openings</div>
              <div className="mt-3 flex flex-col gap-3.5">
                {similar.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/jobs/${s.slug}`}
                    className="block text-[var(--color-ink)] no-underline hover:text-[var(--color-link)] hover:no-underline"
                  >
                    <div className="text-base font-medium leading-[1.25]">{s.title}</div>
                    <div className="text-sm text-[var(--color-slate)]">{s.employer_name} · {s.city}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
```

Add imports:

```ts
import { SITE } from '@/lib/site';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { CARD, CONTAINER, H3, PILL_PRIMARY } from '@/lib/ui/styles';
```

The breadcrumb's category link previously hand-built `/jobs?category=...`; routing it
through `buildJobsQuery` keeps every link on the site producing the exact query string
`parseSearchParams` expects back.

- [ ] **Step 2: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean.

- [ ] **Step 3: Verify against live data**

`npx next dev`, open any job from `/jobs`:
- Breadcrumb, headline, employer line and place render; the facts card shows only facts
  that exist (a job with no salary shows no Pay band row).
- The description renders as formatted HTML, not escaped tags.
- The apply pill is green, names the employer, and opens in a new tab.
- View source: the JSON-LD `<script>` carries a `nonce` attribute.
- At 360px the aside stacks below the article and nothing overflows.

- [ ] **Step 4: Commit**

```bash
git add "app/jobs/[slug]/page.tsx"
git commit -m "feat(job): v2 detail page re-skin"
```

---

### Task 6: `/about` and `not-found` re-skin

**Files:**
- Modify: `app/about/page.tsx`
- Modify: `app/not-found.tsx`

**Interfaces:**
- Consumes: style constants (Task 1).
- Produces: nothing later depends on this task.

- [ ] **Step 1: Replace the returned JSX in `app/about/page.tsx`**

Leave the query and its `error` check untouched. Everything from `return (` to `);`:

```tsx
  return (
    <article className="mx-auto max-w-[720px] px-[22px] pb-20 pt-[clamp(44px,7vw,72px)]">
      <h1 className="m-0 text-[clamp(34px,5.4vw,52px)] font-semibold leading-[1.06] tracking-[-0.025em]">
        About {SITE.name}
      </h1>

      <p className="mt-4 text-[21px] leading-[1.42] text-[var(--color-slate)]">
        {SITE.name} is a job search site for healthcare work in Ontario. Every listing links
        directly to the employer&rsquo;s own application page. We never take applications ourselves,
        and there is no account or login anywhere in the product.
      </p>

      <h2 className="mt-10 text-[28px] font-semibold tracking-[-0.02em]">How we collect listings</h2>
      <p className="mt-2.5 text-[17px] leading-[1.6]">
        We read the public job feeds that employers&rsquo; own career sites use. We identify
        ourselves on every request as <code className={CODE}>{SITE.userAgent}</code>, we send no more
        than one request per second to any single site, and we respect{' '}
        <code className={CODE}>robots.txt</code>. We do not log in, submit applications, or attempt
        to reach anything that requires authentication.
      </p>

      <h2 className="mt-10 text-[28px] font-semibold tracking-[-0.02em]">Where the jobs come from</h2>
      {employers.length > 0 ? (
        <div className={`${CARD} mt-3.5 overflow-hidden`}>
          {employers.map((e) => (
            <div
              key={e.name}
              className="flex justify-between gap-4 border-t border-[var(--color-divider)] px-5 py-[15px] first:border-t-0"
            >
              <div>
                <div className="text-[17px] font-medium">{e.name}</div>
                <div className="text-[15px] text-[var(--color-slate)]">{e.cities.join(', ')}</div>
              </div>
              <div className="whitespace-nowrap text-[15px] tabular-nums text-[var(--color-meta)]">
                {e.count} {e.count === 1 ? 'job' : 'jobs'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3.5 text-[17px] text-[var(--color-slate)]">
          No active listings right now — check back after the next refresh.
        </p>
      )}

      <h2 id="employer-removal" className="mt-10 scroll-mt-16 text-[28px] font-semibold tracking-[-0.02em]">
        Employers: removing your listings
      </h2>
      <p className="mt-2.5 text-[17px] leading-[1.6]">
        Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> and we will stop
        collecting from your site. No justification needed.
      </p>
    </article>
  );
```

Add above the component, and import `CARD`:

```ts
import { CARD } from '@/lib/ui/styles';

// The canvas's inline <code> treatment: chip-grey, rounded, monospace.
const CODE =
  'rounded-md bg-[var(--color-chip)] px-1.5 py-0.5 font-mono text-[15px]';
```

Note `scroll-mt-16` rather than `scroll-mt-6`: the header is now sticky, so the anchor
target must clear it.

- [ ] **Step 2: Replace the returned JSX in `app/not-found.tsx`**

```tsx
  return (
    <article className="mx-auto max-w-[720px] px-[22px] py-16 text-center">
      <h1 className="m-0 text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.08] tracking-[-0.025em]">
        Page not found
      </h1>
      <p className="mx-auto mt-3 max-w-[34em] text-[17px] text-[var(--color-slate)]">
        We couldn&rsquo;t find that page.
      </p>
      <Link href="/jobs" className={`${PILL_PRIMARY} mt-5`}>Back to job search</Link>
    </article>
  );
```

Add the import:

```ts
import { PILL_PRIMARY } from '@/lib/ui/styles';
```

- [ ] **Step 3: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean.

- [ ] **Step 4: Verify against live data**

`npx next dev`:
- `/about` renders at the narrower 720px measure with the grey code chips and a white
  rounded employer list showing three employers with live counts.
- Click the footer's "Employer removal requests" — the heading lands below the sticky
  header, not hidden behind it.
- `/does-not-exist` renders the styled 404 with a green pill.

- [ ] **Step 5: Commit**

```bash
git add app/about/page.tsx app/not-found.tsx
git commit -m "feat(about): v2 about and 404 re-skin"
```

---

### Task 7: City slugs and discipline blurbs

Pure logic and static copy, TDD. No rendering.

**Files:**
- Create: `lib/jobs/city-slug.ts`
- Create: `lib/taxonomy/blurbs.ts`
- Test: `tests/lib/city-slug.test.ts`

**Interfaces:**
- Consumes: `Category`, `CATEGORY_LABELS` from `lib/taxonomy/categories`.
- Produces:
  - `slugifyCity(city: string): string`
  - `resolveCity(slug: string, cities: string[]): string | null`
  - `slugifyDiscipline` is **not** needed — `Category` keys are already URL-safe.
  - `isCategorySlug(value: string): value is Category`
  - `CATEGORY_BLURBS: Record<Category, string>`
  Tasks 9, 10 and 11 rely on all of these.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/city-slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugifyCity, resolveCity, isCategorySlug } from '@/lib/jobs/city-slug';

const CITIES = ['Toronto', 'Markham', 'Ottawa'];

describe('slugifyCity', () => {
  it('lowercases a single-word city', () => {
    expect(slugifyCity('Toronto')).toBe('toronto');
  });

  it('hyphenates whitespace', () => {
    expect(slugifyCity('Richmond Hill')).toBe('richmond-hill');
  });

  it('strips punctuation rather than encoding it', () => {
    expect(slugifyCity("St. Catharines")).toBe('st-catharines');
  });

  it('collapses repeated separators and trims the edges', () => {
    expect(slugifyCity('  New   Tecumseth  ')).toBe('new-tecumseth');
  });
});

describe('resolveCity', () => {
  it('resolves a slug back to the stored city name', () => {
    expect(resolveCity('toronto', CITIES)).toBe('Toronto');
  });

  it('is case-insensitive about the incoming slug', () => {
    expect(resolveCity('TORONTO', CITIES)).toBe('Toronto');
  });

  it('returns null for a city we do not carry', () => {
    expect(resolveCity('hamilton', CITIES)).toBeNull();
  });

  it('returns null for an empty slug', () => {
    expect(resolveCity('', CITIES)).toBeNull();
  });

  it('round-trips every stored city', () => {
    for (const city of CITIES) {
      expect(resolveCity(slugifyCity(city), CITIES)).toBe(city);
    }
  });
});

describe('isCategorySlug', () => {
  it('accepts a real category key', () => {
    expect(isCategorySlug('nursing')).toBe(true);
  });

  it('rejects an unknown discipline', () => {
    expect(isCategorySlug('wizardry')).toBe(false);
  });

  it('rejects a label rather than a key', () => {
    expect(isCategorySlug('Nursing')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/city-slug.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/jobs/city-slug'".

- [ ] **Step 3: Create `lib/jobs/city-slug.ts`**

```ts
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';

/** City names come from employer feeds, not from a fixed list, so landing-page
 * URLs are derived from the stored value rather than a hand-maintained map.
 * Keep this lossy-but-stable: two cities that slugify identically would
 * collide, which is why resolveCity returns the first exact slug match and the
 * caller 404s on null rather than guessing. */
export function slugifyCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Maps a URL slug back to the exact stored city name, or null when we carry
 * no such city. Null must become notFound() at the call site — never a query
 * with an unvalidated string. */
export function resolveCity(slug: string, cities: string[]): string | null {
  const wanted = slugifyCity(slug);
  if (!wanted) return null;
  return cities.find((c) => slugifyCity(c) === wanted) ?? null;
}

/** Category keys are already URL-safe, so a discipline slug is just a key.
 * Validates before it reaches a query. */
export function isCategorySlug(value: string): value is Category {
  return value in CATEGORY_LABELS;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/city-slug.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Create `lib/taxonomy/blurbs.ts`**

```ts
import type { Category } from '@/lib/taxonomy/categories';

/** One or two sentences per discipline, shown as the subhead on
 * /browse/[city]/[discipline] landing pages.
 *
 * These are the only hand-written claims on the site, which is why they live
 * in one file: they describe what a discipline covers and which Ontario body
 * regulates it, and nothing else. Deliberately no pay figures, no demand or
 * market commentary, and nothing city-specific — those would be unverifiable
 * across eighteen landing pages, and per-page facts come from live data via
 * lib/jobs/glance.ts instead.
 *
 * Review these before release; they publish under the site owner's name. */
export const CATEGORY_BLURBS: Record<Category, string> = {
  nursing:
    'Registered nurse, registered practical nurse and nurse practitioner roles. All require a certificate of registration with the College of Nurses of Ontario.',
  physicians:
    'Staff physician, hospitalist and specialist appointments. Practice in Ontario requires registration with the College of Physicians and Surgeons of Ontario.',
  allied_health:
    'Occupational therapy, physiotherapy, respiratory therapy, speech-language pathology and related roles. Each is regulated by its own Ontario college.',
  mental_health:
    'Social work, psychology, psychotherapy and addictions roles across inpatient and community programs, regulated by the OCSWSSW, the CPO and the CRPO respectively.',
  support_care:
    'Personal support worker and health care aide roles. PSW is not a regulated profession in Ontario, so employers set their own certificate requirements.',
  diagnostics_lab:
    'Medical laboratory technologist, medical radiation technologist and sonographer roles, regulated by the CMLTO and the CMRITO.',
  pharmacy:
    'Hospital pharmacist and pharmacy technician roles. Both are regulated by the Ontario College of Pharmacists.',
  admin_clerical:
    'Unit clerk, scheduling, registration and administrative support roles. No college registration is required; employers usually ask for medical terminology.',
  management:
    'Program manager, director and clinical leadership roles. Most postings expect a clinical background alongside leadership experience.',
  research:
    'Clinical research coordinator, data and trial support roles, usually attached to a hospital research institute and often on fixed-term contracts.',
};
```

- [ ] **Step 6: Full suite, type check, lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all green. `CATEGORY_BLURBS` being `Record<Category, string>` means `tsc` fails
if any of the ten categories is missing — that is intentional.

- [ ] **Step 7: Commit**

```bash
git add lib/jobs/city-slug.ts lib/taxonomy/blurbs.ts tests/lib/city-slug.test.ts
git commit -m "feat(browse): city slug resolution and discipline blurbs"
```

---

### Task 8: "At a glance" derivation

Pure logic, TDD. This is what makes each landing page factually distinct rather than a
template with a noun swapped.

**Files:**
- Create: `lib/jobs/glance.ts`
- Test: `tests/lib/glance.test.ts`

**Interfaces:**
- Consumes: `formatSalary`, `postedAgo` from `lib/format`; `EMPLOYMENT_LABELS` from
  `lib/taxonomy/employment`.
- Produces:
  - `type GlanceRow = { label: string; value: string }`
  - `type GlanceJob = { employer_name: string; employment_type: string | null; salary_min: number | null; salary_max: number | null; salary_period: string | null; posted_at: string }`
  - `buildGlance(jobs: GlanceJob[]): GlanceRow[]`
  Tasks 10 and 11 render the result.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/glance.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGlance, type GlanceJob } from '@/lib/jobs/glance';

const base: GlanceJob = {
  employer_name: 'CHEO',
  employment_type: 'full_time',
  salary_min: null,
  salary_max: null,
  salary_period: null,
  posted_at: new Date().toISOString(),
};

const labelled = (rows: { label: string; value: string }[]) =>
  Object.fromEntries(rows.map((r) => [r.label, r.value]));

describe('buildGlance', () => {
  it('returns no rows for an empty set', () => {
    expect(buildGlance([])).toEqual([]);
  });

  it('counts listings', () => {
    const rows = labelled(buildGlance([base, base, base]));
    expect(rows['Active listings']).toBe('3');
  });

  it('lists distinct employers', () => {
    const rows = labelled(
      buildGlance([base, { ...base, employer_name: 'Oak Valley Health' }, base]),
    );
    expect(rows['Hiring here']).toBe('CHEO, Oak Valley Health');
  });

  it('lists employment types by their user-facing labels', () => {
    const rows = labelled(buildGlance([base, { ...base, employment_type: 'casual' }]));
    expect(rows['Employment']).toBe('Full time, Casual');
  });

  it('omits employment entirely when no listing declares a type', () => {
    const rows = labelled(buildGlance([{ ...base, employment_type: null }]));
    expect(rows['Employment']).toBeUndefined();
  });

  // The Markham and Ottawa case: 88 of 153 active rows publish no band at all.
  // A placeholder here would be worse than silence.
  it('omits the pay row entirely when no listing publishes a band', () => {
    const rows = labelled(buildGlance([base, base]));
    expect(rows['Published pay']).toBeUndefined();
  });

  it('reports pay coverage and the outer bounds when some listings publish a band', () => {
    const rows = labelled(
      buildGlance([
        { ...base, salary_min: 39.07, salary_max: 56, salary_period: 'hour' },
        { ...base, salary_min: 32.14, salary_max: 48.8, salary_period: 'hour' },
        base,
      ]),
    );
    expect(rows['Published pay']).toBe('2 of 3 listings, from $32.14 to $56.00/hr');
  });

  it('describes a single listing in the singular', () => {
    const rows = labelled(
      buildGlance([{ ...base, salary_min: 30, salary_max: 40, salary_period: 'hour' }]),
    );
    expect(rows['Active listings']).toBe('1');
    expect(rows['Published pay']).toBe('1 of 1 listing, from $30.00 to $40.00/hr');
  });

  it('reports the most recent posting', () => {
    const rows = labelled(buildGlance([{ ...base, posted_at: new Date().toISOString() }]));
    expect(rows['Most recent']).toBe('Posted today');
  });

  it('always states the refresh cadence', () => {
    const rows = labelled(buildGlance([base]));
    expect(rows['Refreshed']).toBe('Every 6 hours');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/glance.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/jobs/glance'".

- [ ] **Step 3: Create `lib/jobs/glance.ts`**

```ts
import { formatSalary, postedAgo } from '@/lib/format';
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES } from '@/lib/taxonomy/employment';

export type GlanceRow = { label: string; value: string };

export type GlanceJob = {
  employer_name: string;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

/** Derives the "At a glance" rows for a landing page from its own job set.
 *
 * Every row is omitted rather than placeheld when its datum is missing. The
 * pay row matters most: all 65 Toronto listings publish a band and all 88
 * Markham and Ottawa listings publish none, so two landing cities in three
 * legitimately show no pay information at all.
 *
 * Pay is deliberately phrased as coverage plus outer bounds — "2 of 3
 * listings, from X to Y" — because a min/max across a category is a range of
 * ranges. Rendering it as "this role pays X to Y" would misstate what the
 * employer published. */
export function buildGlance(jobs: GlanceJob[]): GlanceRow[] {
  if (jobs.length === 0) return [];

  const rows: GlanceRow[] = [{ label: 'Active listings', value: String(jobs.length) }];

  const employers = [...new Set(jobs.map((j) => j.employer_name))].sort();
  if (employers.length > 0) rows.push({ label: 'Hiring here', value: employers.join(', ') });

  // Ordered by the taxonomy rather than by appearance, so two pages with the
  // same set of types read identically.
  const types = EMPLOYMENT_TYPES.filter((t) => jobs.some((j) => j.employment_type === t));
  if (types.length > 0) {
    rows.push({ label: 'Employment', value: types.map((t) => EMPLOYMENT_LABELS[t]).join(', ') });
  }

  const paid = jobs.filter(
    (j) => j.salary_min !== null && j.salary_max !== null && j.salary_period !== null,
  );
  if (paid.length > 0) {
    const min = Math.min(...paid.map((j) => j.salary_min as number));
    const max = Math.max(...paid.map((j) => j.salary_max as number));
    const period = paid[0].salary_period;
    const band = formatSalary(min, max, period);
    if (band) {
      const noun = jobs.length === 1 ? 'listing' : 'listings';
      rows.push({
        label: 'Published pay',
        value: `${paid.length} of ${jobs.length} ${noun}, from ${band.replace('–', ' to ')}`,
      });
    }
  }

  const newest = jobs.reduce((a, b) => (Date.parse(a.posted_at) >= Date.parse(b.posted_at) ? a : b));
  rows.push({ label: 'Most recent', value: postedAgo(newest.posted_at) });

  // Ingest cadence is fixed in .github/workflows/ingest.yml (cron '0 */6 * * *')
  // — an operational fact, not user data, so it is safe as a constant.
  rows.push({ label: 'Refreshed', value: 'Every 6 hours' });

  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/glance.test.ts`
Expected: PASS. If "Published pay" comes back with an en dash rather than " to ", the
`.replace('–', ' to ')` is missing — note that character is U+2013, the one `formatSalary`
emits.

- [ ] **Step 5: Full suite, type check, lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/jobs/glance.ts tests/lib/glance.test.ts
git commit -m "feat(browse): derive at-a-glance facts from live listings"
```

---

### Task 9: Shared landing components and the `/browse` hub

**Files:**
- Create: `lib/jobs/landing.ts`
- Create: `components/LinkCountCard.tsx`
- Create: `components/LandingJobList.tsx`
- Create: `components/GlancePanel.tsx`
- Create: `app/browse/page.tsx`

**Interfaces:**
- Consumes: `slugifyCity` (Task 7), `buildGlance`/`GlanceRow` (Task 8), style constants
  (Task 1), `buildJobsQuery` (Task 2).
- Produces:
  - `loadLandingRows(): Promise<LandingRow[]>` where
    `type LandingRow = { city: string; category: string | null }`
  - `countsByCity(rows)`, `countsByCategory(rows)`, `pairCount(rows, city, category)`
  - `LinkCountCard({ title, items })` with `items: { href: string; label: string; count: number }[]`
  - `LandingJobList({ jobs, seeAllHref, seeAllLabel })`
  - `GlancePanel({ rows })`
  Tasks 10 and 11 use all of these.

- [ ] **Step 1: Create `lib/jobs/landing.ts`**

```ts
import { createServerClient } from '@/lib/db/server';

export type LandingRow = { city: string; category: string | null };

/** One unfiltered read of every active job's city and category. Every count on
 * every /browse page derives from this, the same approach the home page and
 * the /jobs facets already take. Cheap at current scale (a few hundred rows).
 * If active volume ever nears PostgREST's default 1000-row cap this needs an
 * explicit count query instead. */
export async function loadLandingRows(): Promise<LandingRow[]> {
  // supabase-js resolves { data, error } rather than rejecting; an unchecked
  // error here would render every landing page as an empty "0 jobs".
  const { data, error } = await createServerClient()
    .from('jobs')
    .select('city,category')
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []) as LandingRow[];
}

export function countsByCity(rows: LandingRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.city] = (out[r.city] ?? 0) + 1;
  return out;
}

export function countsByCategory(rows: LandingRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.category) continue;
    out[r.category] = (out[r.category] ?? 0) + 1;
  }
  return out;
}

export function pairCount(rows: LandingRow[], city: string, category: string): number {
  return rows.filter((r) => r.city === city && r.category === category).length;
}

/** Landing pages below this count still render — a link must never go stale
 * between refreshes — but are not linked from the hub or the asides, so we do
 * not parade one-job pages (spec section 6.1). */
export const LINK_THRESHOLD = 3;
```

- [ ] **Step 2: Create `components/LinkCountCard.tsx`**

```tsx
import Link from 'next/link';
import { CARD, H3 } from '@/lib/ui/styles';

export type CountLink = { href: string; label: string; count: number };

/** The v2 canvas's aside card: a title over rows of label + right-aligned
 * count. Renders nothing at all when it has no links, rather than an empty
 * card. */
export function LinkCountCard({ title, items }: { title: string; items: CountLink[] }) {
  if (items.length === 0) return null;

  return (
    <div className={`${CARD} p-5`}>
      <div className={H3}>{title}</div>
      <div className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-[36px] items-center justify-between gap-2.5 text-base"
          >
            <span>{item.label}</span>
            <span className="tabular-nums text-[var(--color-meta)]">{item.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/LandingJobList.tsx`**

```tsx
import Link from 'next/link';
import { postedAgo, formatSalary } from '@/lib/format';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { LIST, LIST_ROW } from '@/lib/ui/styles';

export type LandingJob = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

function isEmploymentType(value: string | null): value is EmploymentType {
  return value !== null && value in EMPLOYMENT_LABELS;
}

/** The capped job list on a landing page. Landing pages deliberately do not
 * paginate — /jobs already owns pagination, filtering and sorting, and
 * duplicating it across three routes would buy nothing. The overflow goes to
 * the equivalent filtered search instead. */
export function LandingJobList({
  jobs,
  seeAllHref,
  seeAllLabel,
}: {
  jobs: LandingJob[];
  seeAllHref: string;
  seeAllLabel: string;
}) {
  return (
    <>
      <ul className={`${LIST} mt-4`}>
        {jobs.map((job) => {
          const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
          const employment = isEmploymentType(job.employment_type)
            ? EMPLOYMENT_LABELS[job.employment_type]
            : null;
          const meta = [salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ');

          return (
            <li key={job.slug} className={LIST_ROW}>
              <Link
                href={`/jobs/${job.slug}`}
                className="block px-5 py-[17px] text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] hover:no-underline"
              >
                <h3 className="m-0 text-[20px] font-semibold leading-[1.22] tracking-[-0.015em]">
                  {job.title}
                </h3>
                <p className="mt-1 text-base">
                  {job.employer_name}
                  {job.facility_name ? ` · ${job.facility_name}` : ''}
                </p>
                <p className="mt-1.5 text-[15px] tabular-nums text-[var(--color-slate)]">{meta}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[17px]">
        <Link href={seeAllHref}>{seeAllLabel} ›</Link>
      </p>
    </>
  );
}
```

- [ ] **Step 4: Create `components/GlancePanel.tsx`**

```tsx
import { CARD, H3 } from '@/lib/ui/styles';
import type { GlanceRow } from '@/lib/jobs/glance';

/** Renders buildGlance output. Rows are already filtered by the builder — a
 * missing datum produces no row, never a placeholder. */
export function GlancePanel({ rows }: { rows: GlanceRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className={`${CARD} mt-8 p-5`}>
      <div className={H3}>At a glance</div>
      <dl className="m-0 mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-3.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[13px] text-[var(--color-slate)]">{row.label}</dt>
            <dd className="m-0 mt-0.5 text-[17px] font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/browse/page.tsx`**

```tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { slugifyCity } from '@/lib/jobs/city-slug';
import {
  loadLandingRows,
  countsByCity,
  countsByCategory,
  pairCount,
  LINK_THRESHOLD,
} from '@/lib/jobs/landing';
import { DisciplineTile } from '@/components/DisciplineTile';
import { SITE } from '@/lib/site';
import { EYEBROW, H2, SECTION, TILE } from '@/lib/ui/styles';

// Nonce-based CSP requires dynamic rendering — a prerendered route bakes its
// bootstrap <script> tags before any per-request nonce exists and the CSP then
// blocks them. Same reasoning as app/about/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Browse healthcare jobs in Ontario | ${SITE.name}`,
  description:
    'Every active healthcare listing on MedCareer, grouped by city and by discipline.',
};

export default async function BrowsePage() {
  const rows = await loadLandingRows();
  const cityCounts = countsByCity(rows);
  const categoryCounts = countsByCategory(rows);

  const cities = Object.keys(cityCounts).sort();
  const disciplines = CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0).sort(
    (a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0),
  );

  // Only pairs above the threshold are linked. Thinner pairs still render if
  // reached directly; they are simply not advertised here.
  const pairs = cities
    .flatMap((city) =>
      disciplines.map((category) => ({ city, category, count: pairCount(rows, city, category) })),
    )
    .filter((p) => p.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
          <div className={EYEBROW}>{SITE.name}</div>
          <h1 className="mt-1.5 text-balance text-[clamp(34px,5.6vw,56px)] font-semibold leading-[1.06] tracking-[-0.025em]">
            Browse healthcare jobs in Ontario
          </h1>
          <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
            {rows.length} active listings, grouped by city and by discipline.
          </p>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={`m-0 ${H2}`}>By city</h2>
        <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {cities.map((city) => (
            <Link key={city} href={`/browse/${slugifyCity(city)}`} className={TILE}>
              <span className="text-[17px] font-medium tracking-[-0.012em]">{city}</span>
              <span className="text-[15px] tabular-nums text-[var(--color-meta)]">
                {cityCounts[city]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={`m-0 ${H2}`}>By discipline</h2>
        <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {disciplines.map((c) => (
            <DisciplineTile
              key={c}
              href={buildJobsQuery({ category: [c] })}
              label={CATEGORY_LABELS[c]}
              count={categoryCounts[c] ?? 0}
            />
          ))}
        </div>
      </section>

      {pairs.length > 0 && (
        <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
          <h2 className={`m-0 ${H2}`}>Popular combinations</h2>
          <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {pairs.map((p) => (
              <Link
                key={`${p.city}-${p.category}`}
                href={`/browse/${slugifyCity(p.city)}/${p.category}`}
                className={TILE}
              >
                <span className="text-[17px] font-medium tracking-[-0.012em]">
                  {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS]} in {p.city}
                </span>
                <span className="text-[15px] tabular-nums text-[var(--color-meta)]">{p.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 6: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean, and the route list now includes `/browse` marked as dynamic (`ƒ`), not
static (`○`). If it shows `○`, the `dynamic` export is missing.

- [ ] **Step 7: Verify against live data**

`npx next dev`, open `/browse`:
- Three city tiles with real counts summing to the total in the subhead.
- Discipline tiles with real counts, linking into filtered `/jobs`.
- Popular combinations shows 14 tiles (at current data), none with a count below 3.
- The header's "Browse by city" link reaches this page.

- [ ] **Step 8: Commit**

```bash
git add lib/jobs/landing.ts components/LinkCountCard.tsx components/LandingJobList.tsx components/GlancePanel.tsx app/browse/page.tsx
git commit -m "feat(browse): landing components and hub page"
```

---

### Task 10: `/browse/[city]` city landing

**Files:**
- Create: `app/browse/[city]/page.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 7, 8 and 9.
- Produces: nothing later depends on this task, but Task 11 mirrors its structure closely.

- [ ] **Step 1: Create `app/browse/[city]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/db/server';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { resolveCity, slugifyCity } from '@/lib/jobs/city-slug';
import { buildGlance, type GlanceJob } from '@/lib/jobs/glance';
import { loadLandingRows, countsByCity, pairCount, LINK_THRESHOLD } from '@/lib/jobs/landing';
import { LandingJobList, type LandingJob } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { GlancePanel } from '@/components/GlancePanel';
import { SITE } from '@/lib/site';
import { CONTAINER, EYEBROW, H1, H2 } from '@/lib/ui/styles';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 10;
const JOB_COLUMNS =
  'slug,title,employer_name,facility_name,employment_type,salary_min,salary_max,salary_period,posted_at';

async function resolve(citySlug: string) {
  const rows = await loadLandingRows();
  const city = resolveCity(citySlug, Object.keys(countsByCity(rows)));
  return { rows, city };
}

export async function generateMetadata(props: PageProps<'/browse/[city]'>): Promise<Metadata> {
  const { city: citySlug } = await props.params;
  const { rows, city } = await resolve(citySlug);
  if (!city) return { title: `Not found | ${SITE.name}` };

  const count = countsByCity(rows)[city] ?? 0;
  return {
    title: `Healthcare jobs in ${city}, Ontario | ${SITE.name}`,
    description: `${count} active healthcare listings in ${city}, pulled from hospital career systems and refreshed every six hours.`,
  };
}

export default async function CityLandingPage(props: PageProps<'/browse/[city]'>) {
  const { city: citySlug } = await props.params;
  const { rows, city } = await resolve(citySlug);

  // An unrecognised city, or one with no active jobs, is a 404 — never an
  // empty landing page.
  if (!city) notFound();
  const total = countsByCity(rows)[city] ?? 0;
  if (total === 0) notFound();

  const db = createServerClient();
  // supabase-js resolves { data, error }; an unchecked error here would render
  // a real database failure as a legitimately empty city.
  const { data, error } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('is_active', true)
    .eq('city', city)
    .order('posted_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  const jobs = (data ?? []) as LandingJob[];

  const { data: glanceData, error: glanceError } = await db
    .from('jobs')
    .select('employer_name,employment_type,salary_min,salary_max,salary_period,posted_at')
    .eq('is_active', true)
    .eq('city', city);
  if (glanceError) throw glanceError;
  const glance = buildGlance((glanceData ?? []) as GlanceJob[]);

  const employers = [...new Set((glanceData ?? []).map((r) => r.employer_name))].sort();

  const disciplineLinks: CountLink[] = CATEGORIES.map((c) => ({
    href: `/browse/${slugifyCity(city)}/${c}`,
    label: CATEGORY_LABELS[c],
    count: pairCount(rows, city, c),
  }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  const otherCityLinks: CountLink[] = Object.entries(countsByCity(rows))
    .filter(([name]) => name !== city)
    .map(([name, count]) => ({ href: `/browse/${slugifyCity(name)}`, label: name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
          <div className={EYEBROW}>Ontario · {city}</div>
          <h1 className={`mt-1.5 ${H1}`}>Healthcare jobs in {city}</h1>
          <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
            {total} active {total === 1 ? 'listing' : 'listings'} from{' '}
            {employers.length === 1 ? employers[0] : `${employers.length} employers`}, refreshed
            every six hours.
          </p>
        </div>
      </section>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Open roles in {city}</h2>
          <LandingJobList
            jobs={jobs}
            seeAllHref={buildJobsQuery({ city: [city] })}
            seeAllLabel={`See all ${total} ${total === 1 ? 'job' : 'jobs'} in ${city}`}
          />
          <GlancePanel rows={glance} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title={`Disciplines in ${city}`} items={disciplineLinks} />
          <LinkCountCard title="Other cities" items={otherCityLinks} />
        </aside>
      </div>
    </>
  );
}
```

> The aside's second card is titled **Other cities**, not the canvas's "Nearby cities": we
> hold Toronto, Markham and Ottawa, and Ottawa is not near Toronto. The canvas's
> Mississauga/Oshawa/Hamilton entries were placeholder data (spec section 6.5).

- [ ] **Step 2: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean, `/browse/[city]` listed as dynamic (`ƒ`).

- [ ] **Step 3: Verify against live data**

`npx next dev`:
- `/browse/toronto` renders with the real Toronto count and Scarborough Health Network named.
- The "At a glance" panel shows a **Published pay** row (all Toronto listings carry bands).
- `/browse/markham` renders and shows **no Published pay row** — that is correct, not a bug.
- `/browse/hamilton` returns 404.
- `/browse/TORONTO` resolves to the same page as `/browse/toronto`.
- Page source shows a `<title>` of "Healthcare jobs in Toronto, Ontario | MedCareer", not
  the site default.
- At 360px the aside stacks below the list, nothing overflows.

- [ ] **Step 4: Commit**

```bash
git add "app/browse/[city]/page.tsx"
git commit -m "feat(browse): city landing pages"
```

---

### Task 11: `/browse/[city]/[discipline]` landing

**Files:**
- Create: `app/browse/[city]/[discipline]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 7, 8 and 9.
- Produces: nothing later depends on this task.

- [ ] **Step 1: Create `app/browse/[city]/[discipline]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/db/server';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { CATEGORY_BLURBS } from '@/lib/taxonomy/blurbs';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { resolveCity, slugifyCity, isCategorySlug } from '@/lib/jobs/city-slug';
import { buildGlance, type GlanceJob } from '@/lib/jobs/glance';
import { loadLandingRows, countsByCity, pairCount, LINK_THRESHOLD } from '@/lib/jobs/landing';
import { LandingJobList, type LandingJob } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { GlancePanel } from '@/components/GlancePanel';
import { SITE } from '@/lib/site';
import { CONTAINER, EYEBROW, H1, H2 } from '@/lib/ui/styles';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 10;
const JOB_COLUMNS =
  'slug,title,employer_name,facility_name,employment_type,salary_min,salary_max,salary_period,posted_at';

async function resolve(citySlug: string, disciplineSlug: string) {
  const rows = await loadLandingRows();
  const city = resolveCity(citySlug, Object.keys(countsByCity(rows)));
  const category = isCategorySlug(disciplineSlug) ? disciplineSlug : null;
  const count = city && category ? pairCount(rows, city, category) : 0;
  return { rows, city, category, count };
}

export async function generateMetadata(
  props: PageProps<'/browse/[city]/[discipline]'>,
): Promise<Metadata> {
  const { city: citySlug, discipline } = await props.params;
  const { city, category, count } = await resolve(citySlug, discipline);
  if (!city || !category || count === 0) return { title: `Not found | ${SITE.name}` };

  const label = CATEGORY_LABELS[category];
  return {
    title: `${label} jobs in ${city}, Ontario | ${SITE.name}`,
    description: `${count} active ${label.toLowerCase()} ${count === 1 ? 'listing' : 'listings'} in ${city}, pulled from hospital career systems and refreshed every six hours.`,
  };
}

export default async function PairLandingPage(props: PageProps<'/browse/[city]/[discipline]'>) {
  const { city: citySlug, discipline } = await props.params;
  const { rows, city, category, count } = await resolve(citySlug, discipline);

  // Unknown city, unknown discipline, or a valid pair with nothing active —
  // all 404. No empty landing pages.
  if (!city || !category || count === 0) notFound();

  const label = CATEGORY_LABELS[category];

  const db = createServerClient();
  // supabase-js resolves { data, error }; both reads are checked so a database
  // failure never renders as a legitimately empty discipline.
  const { data, error } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('is_active', true)
    .eq('city', city)
    .eq('category', category)
    .order('posted_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  const jobs = (data ?? []) as LandingJob[];

  const { data: glanceData, error: glanceError } = await db
    .from('jobs')
    .select('employer_name,employment_type,salary_min,salary_max,salary_period,posted_at')
    .eq('is_active', true)
    .eq('city', city)
    .eq('category', category);
  if (glanceError) throw glanceError;
  const glance = buildGlance((glanceData ?? []) as GlanceJob[]);

  const otherDisciplines: CountLink[] = CATEGORIES.filter((c) => c !== category)
    .map((c) => ({
      href: `/browse/${slugifyCity(city)}/${c}`,
      label: CATEGORY_LABELS[c],
      count: pairCount(rows, city, c),
    }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  const sameDisciplineElsewhere: CountLink[] = Object.keys(countsByCity(rows))
    .filter((name) => name !== city)
    .map((name) => ({
      href: `/browse/${slugifyCity(name)}/${category}`,
      label: `${label} in ${name}`,
      count: pairCount(rows, name, category),
    }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
          <div className={EYEBROW}>Ontario · {city} · {label}</div>
          <h1 className={`mt-1.5 ${H1}`}>{label} jobs in {city}</h1>
          <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
            {CATEGORY_BLURBS[category]}
          </p>
        </div>
      </section>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Open {label.toLowerCase()} roles in {city}</h2>
          <LandingJobList
            jobs={jobs}
            seeAllHref={buildJobsQuery({ city: [city], category: [category] })}
            seeAllLabel={`See all ${count} ${count === 1 ? 'job' : 'jobs'}`}
          />
          <GlancePanel rows={glance} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title={`Other disciplines in ${city}`} items={otherDisciplines} />
          <LinkCountCard title={`${label} in other cities`} items={sameDisciplineElsewhere} />
        </aside>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type check, lint, build**

Run: `npx tsc --noEmit && npx eslint && npx next build`
Expected: clean, `/browse/[city]/[discipline]` listed as dynamic (`ƒ`).

- [ ] **Step 3: Verify against live data**

`npx next dev`:
- `/browse/toronto/nursing` renders with the nursing blurb as its subhead, 10 job rows, a
  "See all 16 jobs" link, and a **Published pay** row reading like
  "16 of 16 listings, from $25.38 to $78.59/hr".
- `/browse/markham/nursing` renders 21 jobs and **no Published pay row**.
- `/browse/toronto/wizardry` returns 404.
- `/browse/ottawa/management` returns 404 (Ottawa carries no management listings).
- Both aside cards show only links with counts of 3 or more; a card with no qualifying
  links does not render at all.
- The `<title>` is discipline- and city-specific.
- At 360px nothing overflows.

- [ ] **Step 4: Commit**

```bash
git add "app/browse/[city]/[discipline]/page.tsx"
git commit -m "feat(browse): city and discipline landing pages"
```

---

### Task 12: Full verification sweep

Cross-cutting checks that cannot be done per-task. Nothing here changes behaviour; if a
check fails, fix it in the file it belongs to and re-run.

**Files:** none created. Fixes land in whichever file the failure points at.

- [ ] **Step 1: Confirm no webfont or dead token survived**

Run: `grep -rn "next/font\|font-display\|--font-display\|color-paper\|color-band\|color-flag\|color-footer" app components lib`
Expected: **no matches.** Any hit is a v1 leftover that now renders as a silent no-op.

- [ ] **Step 2: Confirm no raw hex leaked into components**

Run: `grep -rnE "#[0-9a-fA-F]{6}\b" app components | grep -v globals.css`
Expected: no matches. Colour belongs in `app/globals.css` only.

- [ ] **Step 3: Full test suite and static checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint && npx next build`
Expected: all green. In the build output every route must be marked dynamic (`ƒ`); a
static (`○`) route will silently fail to hydrate under the nonce CSP.

- [ ] **Step 4: Verify the CSP nonce end to end**

Start the production server: `npx next start`

Then, for each of `/`, `/jobs`, `/jobs/<a real slug>`, `/about`, `/browse`,
`/browse/toronto`, `/browse/toronto/nursing`:

```bash
curl -si http://localhost:3000/browse/toronto | tee /tmp/page.txt | grep -i "content-security-policy"
grep -o 'nonce="[^"]*"' /tmp/page.txt | head -3
```

Expected: the `nonce-...` value inside the CSP header and the `nonce="..."` attributes in
the body are **identical within that single response**. They will differ between separate
requests — that is correct, each request mints a fresh nonce. Compare within one response
only.

- [ ] **Step 5: Verify the no-JavaScript guarantee**

In the browser, disable JavaScript entirely, then:
- `/` — hero search submits and lands on `/jobs` with the right query string.
- `/jobs` — the keyword, city and sort bar submits; ticking facets and pressing
  **Apply filters** narrows results; a chip's × removes exactly that filter.
- `/browse/toronto/nursing` — every link navigates.

- [ ] **Step 6: Verify the 360px floor**

Set the viewport to 360×740 and walk all seven routes. Expected: no horizontal scrollbar
anywhere; tap targets at least 44px; the `/jobs` filter panel collapses; long employer
names and salary figures wrap rather than overflowing their cards.

- [ ] **Step 7: Confirm the cut features are genuinely absent**

Run: `grep -rni "closing soon\|closes_at\|job alert\|save this search\|save jobs" app components lib`
Expected: no matches outside comments that explain the omission. Finding live UI here means
a cut feature was reintroduced.

- [ ] **Step 8: Commit any fixes**

```bash
git add -u
git commit -m "fix: verification sweep corrections"
```

If nothing needed fixing, skip this step — do not create an empty commit.

---

## Done

All seven routes render the v2 design, the three `/browse` landing routes are live, and no
feature is shown that the data cannot support.

**Owner review still outstanding:** `lib/taxonomy/blurbs.ts` holds the only hand-written
claims on the site — ten discipline descriptions naming Ontario regulatory colleges. They
publish under the site owner's name and should be read before release.
