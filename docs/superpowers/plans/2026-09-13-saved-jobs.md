# Saved Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Browse by city" in the primary header/footer nav with a "Saved jobs" feature: a bookmark toggle on job listings, backed by `localStorage` (no accounts), and a `/saved` page that lists them.

**Architecture:** A pure, dependency-free `lib/saved-jobs.ts` module owns all `localStorage` read/write logic and fires a `window` custom event on every change. A `SaveButton` client component wraps that module and is dropped into the two primary job-browsing surfaces (`JobCard`, used on `/jobs`; and the job detail page). A new `/saved` route reads the saved slugs client-side and re-fetches those jobs from Supabase using a new browser-safe Supabase client, rendering them through the same `JobCard`. Nav links swap in `Header.tsx` / `Footer.tsx`; `/browse` and its sub-routes are left completely alone.

**Tech Stack:** Next.js App Router, React (client components for the interactive pieces), Supabase (`@supabase/supabase-js`), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-saved-jobs-design.md` — read it if anything below is ambiguous.

## Global Constraints

- No accounts, no login, no cross-device sync — saved jobs live only in the visitor's browser (`localStorage`).
- Do not delete, unlink internally, or otherwise modify `/browse`, `/browse/[city]`, `/browse/[city]/[discipline]`, or their supporting code (`lib/jobs/landing.ts`, `lib/jobs/city-slug.ts`, `components/LandingJobList.tsx`, `components/GlancePanel.tsx`, `components/LinkCountCard.tsx`, `components/DisciplineTile.tsx`). Only their entry points in primary header/footer nav are removed.
- No save button on the homepage "Posted today" cards (`components/PostedTodayCard.tsx`) or anywhere under `/browse`. Scope is `JobCard` (used only by `/jobs`) and the job detail page (`/jobs/[slug]`).
- `localStorage` key: `carepotal:saved-jobs`. Sync event name: `saved-jobs-changed`.
- Every existing page in this app sets `export const dynamic = 'force-dynamic'` because of the per-request CSP nonce in `proxy.ts` (see comments in `app/about/page.tsx`, `app/browse/page.tsx`). A page file cannot combine a `'use client'` directive with a `dynamic` export, so any new route needs a server `page.tsx` (with the `dynamic` export) rendering a separate client component for the interactive parts — do not put `'use client'` directly on a `page.tsx`.
- This project has no icon library (`grep` for lucide/heroicons/react-icons/@radix confirms this) — use hand-written inline SVG, not a new dependency.
- Tests live under `tests/lib/**/*.test.ts` (mirroring `lib/**`), run via `vitest run` (`npm test`). The Vitest environment is plain `node` (no jsdom) — `lib/saved-jobs.ts` must not assume `window` exists, and its tests stub `globalThis.localStorage` directly rather than relying on a DOM.

---

### Task 1: `lib/saved-jobs.ts` — localStorage data module

**Files:**
- Create: `lib/saved-jobs.ts`
- Test: `tests/lib/saved-jobs.test.ts`

**Interfaces:**
- Produces: `SAVED_JOBS_EVENT: string` (the event name constant), `getSavedSlugs(): string[]`, `isJobSaved(slug: string): boolean`, `toggleSavedJob(slug: string): string[]` (returns the full updated list after the flip).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/saved-jobs.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedSlugs, isJobSaved, toggleSavedJob } from '@/lib/saved-jobs';

function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSavedSlugs', () => {
  it('returns an empty array when nothing is saved', () => {
    expect(getSavedSlugs()).toEqual([]);
  });

  it('returns an empty array when the stored value is corrupt JSON', () => {
    localStorage.setItem('carepotal:saved-jobs', 'not json');
    expect(getSavedSlugs()).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', () => {
    localStorage.setItem('carepotal:saved-jobs', JSON.stringify({ not: 'an array' }));
    expect(getSavedSlugs()).toEqual([]);
  });

  it('drops non-string entries from a malformed array', () => {
    localStorage.setItem('carepotal:saved-jobs', JSON.stringify(['nurse-toronto', 42, null]));
    expect(getSavedSlugs()).toEqual(['nurse-toronto']);
  });
});

describe('isJobSaved', () => {
  it('is false for a slug that was never saved', () => {
    expect(isJobSaved('nurse-toronto')).toBe(false);
  });

  it('is true after the slug is saved', () => {
    toggleSavedJob('nurse-toronto');
    expect(isJobSaved('nurse-toronto')).toBe(true);
  });
});

describe('toggleSavedJob', () => {
  it('adds a slug that is not yet saved and returns the new list', () => {
    expect(toggleSavedJob('nurse-toronto')).toEqual(['nurse-toronto']);
  });

  it('removes a slug that is already saved', () => {
    toggleSavedJob('nurse-toronto');
    expect(toggleSavedJob('nurse-toronto')).toEqual([]);
  });

  it('keeps other saved slugs when toggling one off', () => {
    toggleSavedJob('nurse-toronto');
    toggleSavedJob('psw-ottawa');
    expect(toggleSavedJob('nurse-toronto')).toEqual(['psw-ottawa']);
  });

  it('persists across calls via localStorage', () => {
    toggleSavedJob('nurse-toronto');
    expect(getSavedSlugs()).toEqual(['nurse-toronto']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/saved-jobs.test.ts`
Expected: FAIL — `lib/saved-jobs.ts` does not exist yet (`Cannot find module '@/lib/saved-jobs'`).

- [ ] **Step 3: Write the implementation**

Create `lib/saved-jobs.ts`:

```ts
const STORAGE_KEY = 'carepotal:saved-jobs';

/** Fired on `window` after every save/unsave, so every mounted SaveButton
 * and the /saved page can react immediately. The native `storage` event
 * only fires in *other* tabs, never the tab that made the change. */
export const SAVED_JOBS_EVENT = 'saved-jobs-changed';

function readSlugs(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeSlugs(slugs: string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // localStorage unavailable (private browsing, disabled, quota) — saved
    // state just won't persist; nothing to recover from here.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAVED_JOBS_EVENT));
  }
}

export function getSavedSlugs(): string[] {
  return readSlugs();
}

export function isJobSaved(slug: string): boolean {
  return readSlugs().includes(slug);
}

export function toggleSavedJob(slug: string): string[] {
  const current = readSlugs();
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
  writeSlugs(next);
  return next;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/saved-jobs.test.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/saved-jobs.ts tests/lib/saved-jobs.test.ts
git commit -m "$(cat <<'EOF'
feat(saved-jobs): add localStorage-backed saved jobs data module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `SaveButton` component, wired into `JobCard`

**Files:**
- Create: `components/SaveButton.tsx`
- Modify: `components/JobCard.tsx`

**Interfaces:**
- Consumes: `SAVED_JOBS_EVENT`, `isJobSaved(slug)`, `toggleSavedJob(slug)` from `lib/saved-jobs.ts` (Task 1).
- Produces: `SaveButton({ slug: string })` — a client component, used by Task 3 (job detail page) and Task 4 (`SavedJobsView`, via `JobCard`).

- [ ] **Step 1: Create `components/SaveButton.tsx`**

```tsx
'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { SAVED_JOBS_EVENT, isJobSaved, toggleSavedJob } from '@/lib/saved-jobs';

/** Bookmark toggle. Defaults to "not saved" on first render so server and
 * client markup match — localStorage isn't available during SSR — then
 * corrects itself from the real stored value once mounted. Listens for
 * SAVED_JOBS_EVENT so it stays in sync if the same job is toggled from
 * elsewhere on the page (e.g. from /saved while a search-results card for
 * the same job is also open in another tab). */
export function SaveButton({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isJobSaved(slug));
    const onChange = () => setSaved(isJobSaved(slug));
    window.addEventListener(SAVED_JOBS_EVENT, onChange);
    return () => window.removeEventListener(SAVED_JOBS_EVENT, onChange);
  }, [slug]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleSavedJob(slug).includes(slug));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved jobs' : 'Save job'}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-slate)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
    >
      {saved ? (
        <svg viewBox="0 0 24 24" fill="var(--color-signal)" className="h-5 w-5" aria-hidden="true">
          <path d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
          />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Wire it into `components/JobCard.tsx`**

Current file (`components/JobCard.tsx`) wraps the entire row in one `<Link>`. A `<button>` cannot legally nest inside an `<a>`, so restructure so the `<li>` carries the row's padding and hover background, `<Link>` covers just the text content, and `SaveButton` sits beside it as a sibling.

Replace:

```tsx
import Link from 'next/link';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { LIST_ROW } from '@/lib/ui/styles';
```

with:

```tsx
import Link from 'next/link';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { LIST_ROW } from '@/lib/ui/styles';
import { SaveButton } from '@/components/SaveButton';
```

Then replace the whole return statement:

```tsx
  return (
    <li className={LIST_ROW}>
      <Link
        href={`/jobs/${job.slug}`}
        className="flex flex-wrap items-start gap-3 px-5 py-[18px] text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] hover:no-underline"
      >
        <div className="min-w-0 flex-1 basis-[300px]">
          <h2 className="m-0 text-[21px] font-semibold leading-[1.22] tracking-[-0.015em]">{job.title}</h2>
          <p className="mt-1 text-base">
            {employerLine(job.employer_name, job.facility_name, job.city)}
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
```

with:

```tsx
  return (
    <li className={`${LIST_ROW} flex items-start gap-3 px-5 py-[18px] hover:bg-[var(--color-surface-hover)]`}>
      <Link
        href={`/jobs/${job.slug}`}
        className="flex min-w-0 flex-1 flex-wrap items-start gap-3 text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:no-underline"
      >
        <div className="min-w-0 flex-1 basis-[300px]">
          <h2 className="m-0 text-[21px] font-semibold leading-[1.22] tracking-[-0.015em]">{job.title}</h2>
          <p className="mt-1 text-base">
            {employerLine(job.employer_name, job.facility_name, job.city)}
          </p>
          <p className="mt-px text-base text-[var(--color-slate)]">{job.city}, {job.province}</p>
          <p className="mt-2 text-[15px] tabular-nums text-[var(--color-slate)]">{meta}</p>
        </div>
        {categoryLabel && (
          <span className="whitespace-nowrap text-sm text-[var(--color-meta)]">{categoryLabel}</span>
        )}
      </Link>
      <SaveButton slug={job.slug} />
    </li>
  );
```

(The padding and hover background moved from `<Link>` to `<li>` so the whole row — including the button's own footprint — still highlights as one unit, and the row's click target no longer contains an invalid nested `<button>`.)

- [ ] **Step 3: Run typecheck, lint, and the full test suite**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: all clean/passing — this step touches no test files, so this is a regression check, not new coverage.

- [ ] **Step 4: Commit**

```bash
git add components/SaveButton.tsx components/JobCard.tsx
git commit -m "$(cat <<'EOF'
feat(saved-jobs): add SaveButton and wire it into the job search results list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire `SaveButton` into the job detail page

**Files:**
- Modify: `app/jobs/[slug]/page.tsx:159-166`

**Interfaces:**
- Consumes: `SaveButton` from Task 2.

- [ ] **Step 1: Add the import**

In `app/jobs/[slug]/page.tsx`, replace:

```tsx
import { CARD, CONTAINER, H3, PILL_PRIMARY } from '@/lib/ui/styles';
```

with:

```tsx
import { SaveButton } from '@/components/SaveButton';
import { CARD, CONTAINER, H3, PILL_PRIMARY } from '@/lib/ui/styles';
```

- [ ] **Step 2: Add the button beside the title**

Replace:

```tsx
        <article className="min-w-0 flex-[3_1_400px]">
          <h1 className="m-0 text-balance text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.08] tracking-[-0.025em]">
            {job.title}
          </h1>
          <p className="mt-3 text-[19px]">
```

with:

```tsx
        <article className="min-w-0 flex-[3_1_400px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="m-0 text-balance text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.08] tracking-[-0.025em]">
              {job.title}
            </h1>
            <SaveButton slug={job.slug} />
          </div>
          <p className="mt-3 text-[19px]">
```

- [ ] **Step 3: Run typecheck, lint, and the full test suite**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: all clean/passing.

- [ ] **Step 4: Commit**

```bash
git add "app/jobs/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(saved-jobs): add SaveButton to the job detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `/saved` page

**Files:**
- Create: `lib/db/browser.ts`
- Create: `components/SavedJobsView.tsx`
- Create: `app/saved/page.tsx`

**Interfaces:**
- Consumes: `getSavedSlugs`, `SAVED_JOBS_EVENT` from `lib/saved-jobs.ts` (Task 1); `JobCard`, `type JobCardData` from `components/JobCard.tsx`; `CARD`, `LIST`, `PILL_PRIMARY`, `EYEBROW`, `SECTION` from `lib/ui/styles.ts`; `SITE` from `lib/site.ts`.
- Produces: route `/saved`.

- [ ] **Step 1: Create `lib/db/browser.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Anon client for client components. Same public key as the server client
 * (lib/db/server.ts) — NEXT_PUBLIC_* env vars are safe to ship to the
 * browser — kept as a separate file because it's called from a different
 * runtime, matching this project's existing admin.ts / server.ts split. */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 2: Create `components/SavedJobsView.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/db/browser';
import { getSavedSlugs, SAVED_JOBS_EVENT } from '@/lib/saved-jobs';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { CARD, LIST, PILL_PRIMARY } from '@/lib/ui/styles';

const COLUMNS =
  'slug,title,employer_name,facility_name,city,province,category,employment_type,salary_min,salary_max,salary_period,posted_at';

type Status = 'loading' | 'empty' | 'ready';

/** Client-rendered by design: it needs localStorage, which only exists in
 * the browser. app/saved/page.tsx (the server wrapper) carries the
 * `dynamic = 'force-dynamic'` export this file can't, since a 'use client'
 * page can't also export route-segment config. */
export function SavedJobsView() {
  const [status, setStatus] = useState<Status>('loading');
  const [jobs, setJobs] = useState<JobCardData[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const slugs = getSavedSlugs();
      if (slugs.length === 0) {
        if (!cancelled) {
          setJobs([]);
          setStatus('empty');
        }
        return;
      }

      const db = createBrowserClient();
      const { data, error } = await db
        .from('jobs')
        .select(COLUMNS)
        .in('slug', slugs)
        .eq('is_active', true);
      if (cancelled) return;
      if (error) throw error;

      const rows = (data ?? []) as JobCardData[];
      setJobs(rows);
      setStatus(rows.length === 0 ? 'empty' : 'ready');
    }

    load();
    window.addEventListener(SAVED_JOBS_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SAVED_JOBS_EVENT, load);
    };
  }, []);

  if (status === 'loading') return null;

  if (status === 'empty') {
    return (
      <div className={`${CARD} mt-4 px-7 py-12 text-center`}>
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">No saved jobs yet</h2>
        <p className="mx-auto mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
          Tap the bookmark icon on any listing to save it here for later.
        </p>
        <Link href="/jobs" className={`${PILL_PRIMARY} mt-4.5`}>Browse open jobs</Link>
      </div>
    );
  }

  return (
    <ul className={`${LIST} mt-4`}>
      {jobs.map((job) => <JobCard key={job.slug} job={job} />)}
    </ul>
  );
}
```

- [ ] **Step 3: Create `app/saved/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { SavedJobsView } from '@/components/SavedJobsView';
import { EYEBROW, SECTION } from '@/lib/ui/styles';

// Same nonce-based-CSP reasoning as app/about/page.tsx and app/browse/page.tsx:
// a prerendered route bakes its bootstrap <script> nonce at build time, and
// proxy.ts hands out a fresh nonce per request, so this must stay dynamic.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Saved jobs | ${SITE.name}`,
  description: 'Healthcare jobs you have bookmarked, kept in this browser.',
};

export default function SavedPage() {
  return (
    <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
      <div className={EYEBROW}>{SITE.name}</div>
      <h1 className="mt-1.5 text-balance text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">
        Saved jobs
      </h1>
      <p className="mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
        Saved on this device only — there is no account to sign into.
      </p>
      <SavedJobsView />
    </section>
  );
}
```

- [ ] **Step 4: Run typecheck, lint, and the full test suite**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: all clean/passing.

- [ ] **Step 5: Build the app**

Run: `npm run build`
Expected: succeeds, route list includes `/saved` marked dynamic (`ƒ`), same as `/jobs`, `/about`, `/browse`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/browser.ts components/SavedJobsView.tsx app/saved/page.tsx
git commit -m "$(cat <<'EOF'
feat(saved-jobs): add /saved page listing bookmarked jobs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Nav wiring — Header and Footer

**Files:**
- Modify: `components/Header.tsx`
- Modify: `components/Footer.tsx`

**Interfaces:**
- Consumes: route `/saved` from Task 4.

- [ ] **Step 1: Update `components/Header.tsx`**

Replace the file's leading comment block:

```tsx
// Sticky translucent bar from the v2 canvas. One deliberate departure,
// recorded in spec 2.3:
//
//  - The canvas labels its second item "Save jobs", but that item's handler
//    opens a landing page — there is no save feature to build. The slot keeps
//    its position and destination; the label says what it actually does.
export function Header() {
```

with:

```tsx
// Sticky translucent bar from the v2 canvas. The nav's "Save jobs" slot
// (spec 2.3) was a stub for a long time — no save feature existed, so it
// pointed at /browse instead. It now points at the real thing; see
// docs/superpowers/specs/2026-09-13-saved-jobs-design.md. /browse itself
// (and its city/discipline sub-pages) is untouched and still reachable
// directly — it's just no longer in primary nav.
export function Header() {
```

Then replace:

```tsx
          <Link href="/jobs" className={navLink}>Search</Link>
          <Link href="/browse" className={navLink}>Browse by city</Link>
          <Link href="/about" className={navLink}>About</Link>
```

with:

```tsx
          <Link href="/jobs" className={navLink}>Search</Link>
          <Link href="/saved" className={navLink}>Saved jobs</Link>
          <Link href="/about" className={navLink}>About</Link>
```

- [ ] **Step 2: Update `components/Footer.tsx`**

Replace:

```tsx
// Light footer from the v2 canvas (v1's was dark). All four destinations are
// real: "Browse by city" now has landing pages behind it, and "Employer
// removal requests" goes to the live section on /about rather than the
// canvas's dead onClick.
export function Footer() {
```

with:

```tsx
// Light footer from the v2 canvas (v1's was dark). All four destinations are
// real: "Saved jobs" reads from the browser's own localStorage — no account
// — and "Employer removal requests" goes to the live section on /about
// rather than the canvas's dead onClick. "Browse by city" was dropped from
// here and from the header nav (docs/superpowers/specs/2026-09-13-saved-jobs-design.md),
// but its pages under /browse are untouched and still reachable directly.
export function Footer() {
```

Then replace:

```tsx
          <Link href="/jobs" className={link}>Search jobs</Link>
          <Link href="/browse" className={link}>Browse by city</Link>
          <Link href="/about" className={link}>About</Link>
```

with:

```tsx
          <Link href="/jobs" className={link}>Search jobs</Link>
          <Link href="/saved" className={link}>Saved jobs</Link>
          <Link href="/about" className={link}>About</Link>
```

- [ ] **Step 3: Run typecheck, lint, and the full test suite**

Run: `npx tsc --noEmit && npx eslint && npx vitest run`
Expected: all clean/passing.

- [ ] **Step 4: Commit**

```bash
git add components/Header.tsx components/Footer.tsx
git commit -m "$(cat <<'EOF'
feat(saved-jobs): swap Browse by city for Saved jobs in header and footer nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full verification in a real browser

**Files:** none (verification only).

This project's own history has burned it on this exact gap before: type-checking, linting, and the build have all passed while a page still rendered wrong. Do not report this feature done on green CI output alone.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npx tsc --noEmit && npx eslint && npx vitest run && npm run build`
Expected: all green; `/saved` present in the build's route list as dynamic (`ƒ`).

- [ ] **Step 2: Start the dev server**

Run: `npm run dev` (leave it running)

- [ ] **Step 3: Manual check — save from search results**

Open `/jobs` in a real browser. Click the bookmark icon on a couple of listings. Confirm:
- The icon fills in green immediately, no page reload.
- No layout shift or overlap with the discipline label on the right of the card.
- The whole row still hover-highlights, including under the bookmark icon.

- [ ] **Step 4: Manual check — save from the detail page**

Open one of the saved jobs' `/jobs/[slug]` pages. Confirm the bookmark icon appears beside the title, already filled in (it was saved in Step 3), and toggling it there also updates the icon on `/jobs` without a reload if that tab is still open.

- [ ] **Step 5: Manual check — `/saved` page**

Navigate to `/saved` via the header link. Confirm:
- Both jobs saved in Step 3 appear, rendered the same as on `/jobs`.
- Unsaving one from this page removes it from the list immediately.
- Clearing all saved jobs (unsave the rest) shows the empty state with a working link back to `/jobs`.

- [ ] **Step 6: Manual check — nav and `/browse` untouched**

Confirm "Saved jobs" appears in both the header and footer nav in place of "Browse by city", and that navigating directly to `/browse` still renders the full hub page correctly (it's just no longer linked from nav).

- [ ] **Step 7: Report results**

If every check in Steps 3–6 passes, the feature is complete. If any check fails, fix the underlying code (not the test) and re-run the full check from Step 1.
