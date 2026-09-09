# Canadian Healthcare Job Board — Build Plan

A job search site covering healthcare roles across Canada. Seeker-facing only for the MVP; jobs are aggregated from official APIs and direct health-authority ATS feeds. No employer posting yet.

This document is the spec. Work through it phase by phase. Do not build phases out of order — each one depends on the spine built before it.

---

## 1. Product definition

**Who it's for:** nurses, PSWs, physicians, allied health (lab, imaging, rehab, pharmacy), and healthcare admin staff looking for work anywhere in Canada.

**The single job of the site:** let someone find a relevant, *still-open* healthcare job near them in under a minute, on a phone, and get to the real application page in one click.

**What makes it better than the generalist boards:**
- Canada-only and healthcare-only, so no filtering through noise.
- Jobs pulled directly from health authorities, so listings are fresher and link to the real ATS, not a scraper's re-post.
- Structured on healthcare-specific facets the big boards ignore: NOC code, shift type, union/non-union, casual vs. permanent, facility type.

**Explicit non-goals for MVP:** employer accounts, paid postings, resume hosting, in-app applications, US jobs, non-healthcare jobs.

**Ruled out permanently — automated application submission.** Do not build a bot that fills and submits applications on employer ATS sites. It violates those sites' terms, fights active bot detection, risks getting our *ingestion* connectors blocked from the same domains, and can submit wrong credential or licensing data under a real person's name. The supported path, if this is built later, is **autofill assist**: store the seeker's profile, pre-fill the employer's real form, and require the human to review and submit.

---

## 2. Stack

- **Next.js (App Router, TypeScript)** on **Vercel** — server components for search and job pages so everything is SEO-indexable.
- **Supabase (Postgres)** — data, full-text search, auth (later, for saved searches/alerts).
- **Ingestion workers** — GitHub Actions on a cron schedule, running standalone TypeScript scripts. *Not* Vercel serverless functions: ingest runs are long, bursty, and occasionally need retries; Actions handle that better and keep the web app's runtime clean.
- **Tailwind** for styling. No component library — the design direction in §8 is specific and a library will fight it.
- **Zod** for validating every external payload at the boundary.

---

## 3. Architecture

Three layers, strictly separated. The rule: **raw data is never mutated, canonical data is never written by hand.**

```
  sources (Job Bank XML, Adzuna API, Workday/Taleo/SF endpoints)
        │
        ▼
  [ connector ]  fetch → validate (zod) → normalize → hash
        │
        ▼
  raw_postings   ← immutable, one row per source-observation
        │
        ▼
  [ matcher ]    fingerprint → group → pick canonical → merge
        │
        ▼
  jobs           ← canonical, deduped, what the site reads
        │
        ▼
  Next.js (RSC search + job pages + JSON-LD)
```

Why the raw layer exists: when the dedupe logic is wrong (it will be, repeatedly), you re-run the matcher over stored raw rows instead of re-hitting every source. This is the single most important architectural decision here — do not skip it to save a table.

### Connector contract

Every source implements the same interface. Adding a new health authority should mean writing config, not code.

```ts
interface Connector {
  readonly id: string;              // 'jobbank' | 'adzuna' | 'workday:ahs'
  readonly kind: 'feed' | 'api' | 'ats';
  fetchPage(cursor?: string): Promise<{ items: unknown[]; nextCursor?: string }>;
  normalize(raw: unknown): NormalizedPosting;   // throws on invalid
}
```

`NormalizedPosting` is the one shape the rest of the system knows about:

```ts
type NormalizedPosting = {
  sourceId: string;
  sourceJobId: string;        // stable id from the source
  sourceUrl: string;
  title: string;
  employerName: string;
  facilityName?: string;
  description: string;        // sanitized HTML, see §7
  city: string;
  province: ProvinceCode;     // 'ON' | 'BC' | ...
  postedAt: Date;
  closesAt?: Date;
  employmentType?: 'full_time' | 'part_time' | 'casual' | 'temporary' | 'contract';
  shiftType?: 'day' | 'evening' | 'night' | 'rotating' | 'weekend';
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'year';
  nocCode?: string;
  applyUrl: string;
};
```

Run the ATS connectors as a **platform connector + employer registry**: one Workday connector, one Taleo connector, one SuccessFactors connector, each driven by rows in an `employers` table holding the tenant/site identifiers. Registering Alberta Health Services or Vancouver Coastal Health then costs one insert, not a new file.

---

## 4. Data sources

Build in this order. Phase 1 is the spine; do not start ATS work before Job Bank is flowing.

### 4.1 Job Bank (jobbank.gc.ca) — the backbone, but gated
Canada's national employment service, run by ESDC. Broadest Canadian coverage, government-run, free, and **already tagged with NOC codes** — which seeds the entire taxonomy in §6.

**Two different feed programs exist. Don't confuse them:**
- *"Send us an XML feed"* — your jobs go **to** Job Bank. Not what we want.
- *"Request our XML feed"* — Job Bank's jobs come **to us**. This is the one.

**Stated requirements for requesting their feed:**
- An active Canadian Business Number.
- An **established** employment website aimed at a Canadian audience.
- Job seekers can access the jobs free and without an account.
- A direct link back to Job Bank for every posting received through the feed.

**The prerequisite that shapes the build order:** "established employment website" means they expect to see a live site, not a proposal. So Job Bank cannot be the first connector — the site has to exist first. Apply at `jobbank.gc.ca/survey/14` once Phase 1 is live, and state the Canada-only, healthcare-only scope plus the link-back commitment explicitly, since those map onto their conditions.

Two hard constraints to design in from day one, because they're conditions of access and are painful to retrofit:
1. **No login wall, ever.** Job search and job detail pages must work for anonymous users. Accounts may only ever gate optional extras (saved searches, alerts).
2. **Every Job Bank–sourced job renders a visible direct link back to its Job Bank posting.** Store that URL on the canonical job and surface it in the UI.

### 4.2 Adzuna API — build this connector first
A legitimate aggregator API intended for exactly this use, with instant self-serve keys. Register, filter to `country=ca` and the healthcare/nursing categories.

**It goes first purely because it unblocks everything else** — it's the fastest path to a live site with real jobs on it, which is what the Job Bank application requires. It is *not* the long-term backbone: the free tier is roughly 1,000 calls a month (~33/day), descriptions are excerpts rather than full text, and links route through Adzuna rather than the employer. Paid tiers are sales-negotiated, not listed.

So: use it to bootstrap and as thin backfill afterwards. Never treat it as canonical when a direct employer listing exists, and never let the architecture depend on its volume.

### 4.3 Direct health-authority ATS feeds — priority 3, the differentiator
Most large Canadian health employers run Workday, Taleo, or SuccessFactors, and these expose public JSON endpoints that power their own career-site search. Consuming those is far more stable and far more defensible than scraping rendered HTML.

- **Workday** — consistent pattern: `POST /wday/cxs/{tenant}/{site}/jobs` with a JSON body of `{ appliedFacets, limit, offset, searchText }`. One connector covers every Workday employer.
- **Taleo / SuccessFactors** — each has its own request shape; one connector per platform.

Starter employer list (verify each one's current ATS before writing config): Alberta Health Services, Vancouver Coastal Health, Fraser Health, Provincial Health Services Authority (BC), Ontario Health and the large Toronto hospital networks, Nova Scotia Health, Horizon Health (NB), Winnipeg Regional Health Authority.

**Rules for ATS connectors — enforce these in code, not in comments:**
- One shared rate limiter, conservative (≈1 request/sec/host), with exponential backoff on 429/5xx.
- A descriptive `User-Agent` including a contact URL.
- Respect `robots.txt` and check each career site's terms before adding it to the registry.
- If an endpoint requires auth, a token, or a login to reach, **it is out of scope** — do not use it.
- Never bypass a CAPTCHA or a bot-protection challenge. If one appears, disable that connector and log it for manual review.

### 4.4 Do not build on Indeed
Indeed's public Publisher API and XML feed were retired; what remains is partner-gated behind a long approval process. Any "unofficial Indeed API" resells scraped data and is both legally and operationally fragile. Leave it out entirely.

---

## 5. Database schema

Supabase/Postgres. Use migrations from day one (`supabase/migrations/`), never the dashboard SQL editor for schema changes.

```sql
-- Employers / facilities and their ATS configuration
create table employers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  facility_type   text,              -- 'hospital' | 'long_term_care' | 'clinic' | 'public_health' | ...
  province        text,
  website         text,
  ats_platform    text,              -- 'workday' | 'taleo' | 'successfactors' | null
  ats_config      jsonb,             -- { tenant, site, ... }
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Immutable record of what each source told us
create table raw_postings (
  id              uuid primary key default gen_random_uuid(),
  source_id       text not null,
  source_job_id   text not null,
  source_url      text not null,
  payload         jsonb not null,        -- untouched source response
  normalized      jsonb not null,        -- NormalizedPosting
  content_hash    text not null,         -- detects real changes vs. re-observations
  fingerprint     text not null,         -- dedupe key, see §5.1
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (source_id, source_job_id)
);

-- Canonical, deduplicated, user-facing
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  fingerprint     text not null unique,
  title           text not null,
  employer_id     uuid references employers(id),
  employer_name   text not null,
  facility_name   text,
  description     text not null,         -- sanitized HTML
  city            text not null,
  province        text not null,
  latitude        double precision,
  longitude       double precision,
  noc_code        text,
  category        text not null,         -- see §6
  employment_type text,
  shift_type      text,
  salary_min      numeric,
  salary_max      numeric,
  salary_period   text,
  apply_url       text not null,
  canonical_source text not null,
  posted_at       timestamptz not null,
  closes_at       timestamptz,
  expires_at      timestamptz not null,  -- see §5.2
  is_active       boolean not null default true,
  search_vector   tsvector generated always as (
                    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                    setweight(to_tsvector('english', coalesce(employer_name,'')), 'B') ||
                    setweight(to_tsvector('english', coalesce(description,'')), 'C')
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on jobs using gin (search_vector);
create index on jobs (province, category, is_active, posted_at desc);
create index on jobs (is_active, posted_at desc);

-- Which raw rows rolled up into which canonical job
create table job_sources (
  job_id          uuid references jobs(id) on delete cascade,
  raw_posting_id  uuid references raw_postings(id) on delete cascade,
  primary key (job_id, raw_posting_id)
);

create table ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null,           -- 'running' | 'success' | 'failed'
  fetched     int default 0,
  inserted    int default 0,
  updated     int default 0,
  error       text
);
```

### 5.1 Deduplication

The same posting will arrive from Job Bank, Adzuna, and the hospital's own Workday feed. Getting this right is what makes the site feel trustworthy.

**Fingerprint** = `sha256(normalizedTitle | employerKey | city | province)` where:
- `normalizedTitle` is lowercased, accent-stripped, punctuation-stripped, with req-number noise removed (`"RN - Emergency (Req #12345)"` → `"registered nurse emergency"`), and common abbreviations expanded (`rn` → `registered nurse`, `psw` → `personal support worker`, `lpn`, `rpn`, `np`, and so on via a shared alias map). Do **not** strip seniority — see the Phase 1 design spec: seniority distinguishes real jobs at different pay grades, and removing it causes wrong merges. Ambiguous two-letter abbreviations (`pt`, `ot`, `rt`) are excluded from the alias map because they collide with shift language.
- `employerKey` is the employer slug when it resolves to an `employers` row, otherwise a normalized employer name.

Exact fingerprint match groups postings. Then apply a **source priority** to pick the canonical row: `direct ATS > Job Bank > Adzuna`. The canonical `apply_url` always points at the employer's own posting when one exists — that's the single highest-value thing this site does for a user.

Keep every source URL in `job_sources` so the job page can show "also listed on…" and so a bad merge is diagnosable.

Start with exact-fingerprint matching only. Add fuzzy matching (trigram similarity on title within the same employer+city) only once you have real data showing exact matching misses — premature fuzzy matching creates wrong merges, which are much worse than duplicates.

### 5.2 Freshness

Stale listings are how job boards die. Enforce all three:
1. Every connector run stamps `last_seen_at` on the raw rows it observed.
2. A job not seen in its source for **7 days** gets `is_active = false`.
3. Every job gets `expires_at = posted_at + 60 days` at minimum, and `closes_at` when the source provides it. Hard-expire on that date no matter what.

Show a relative "Posted 3 days ago" on every card. Never display a job older than 60 days.

---

## 6. Taxonomy — build on NOC

Use **NOC (National Occupational Classification)** codes as the backbone. It's the Canadian standard, Job Bank already tags with it, and it maps cleanly to user-facing categories.

Ship these top-level categories, each backed by a set of NOC codes:
`nursing` · `physicians` · `allied_health` · `mental_health` · `support_care` (PSW/HCA) · `diagnostics_lab` · `pharmacy` · `admin_clerical` · `management` · `research`

For ATS postings with no NOC code, classify in two steps:
1. **Rule-based first** — a keyword/alias map handles the large majority of healthcare titles deterministically, for free, and reproducibly.
2. **Claude API fallback** — only for titles the rules miss. Send title + employer + first 500 chars of description, require a single category slug from the fixed list as output, and cache the result keyed by normalized title so you never pay twice for the same title. Validate the response against the enum before storing; never trust it blindly.

---

## 7. Security

Non-negotiable. Most of this is cheap if done from the start and expensive to retrofit.

**Supabase keys and RLS**
- The **service role key exists only in GitHub Actions secrets and Vercel server-side env vars.** It must never appear in any file under `app/` that could ship to the client, and never in `NEXT_PUBLIC_*`.
- Enable **Row Level Security on every table.** `jobs` gets a public read policy restricted to `is_active = true`; `raw_postings`, `ingest_runs`, and `employers` get no anon policy at all. Verify by querying with the anon key and confirming the private tables return nothing.
- Ingestion writes only through the service role, only from workers.

**Untrusted input**
- Job descriptions are third-party HTML and are the main attack surface. **Sanitize server-side at ingest time** with an allow-list (`p, br, ul, ol, li, strong, em, h3, h4` — no `script`, `style`, `iframe`, `a` with non-http schemes, no event handlers). Store sanitized output. If you ever render with `dangerouslySetInnerHTML`, it must be reading an already-sanitized column.
- Validate every external payload with Zod at the connector boundary. A malformed source response should fail that one item and get logged, not crash the run or write garbage.

**Outbound requests (SSRF)**
- Connector target URLs come from the `employers` registry, never from user input.
- Allow-list schemes to `https:` only, set request timeouts, and cap response sizes.

**Web app**
- All search/filter params parsed and bounded server-side with Zod: clamp `limit` (max 50), clamp `offset`, validate `province` against the enum. Never interpolate user input into SQL — use the query builder or parameterized RPC.
- Rate-limit any public API routes by IP.
- Security headers: strict CSP (no `unsafe-inline` scripts), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS.
- External `apply_url` links get `rel="noopener noreferrer nofollow"` and `target="_blank"`.
- No secrets in error messages or client-visible logs.

**Data hygiene**
- Store no personal data in MVP. When saved searches arrive, email addresses are the only PII — keep them in their own table, RLS-scoped to the owning user.
- Attribute sources and keep the outbound link intact. Don't republish full descriptions from any source whose terms forbid it — link out instead.

---

## 8. Frontend design direction

The brief: a phone-first job board for people who are frequently tired, often mid-shift or just off one, scanning for something specific. Clarity beats personality — but the site should still not look like a generic Tailwind template. The design lives in the vernacular of the world it serves: **hospital wayfinding and shift boards**, not corporate healthcare marketing.

Deliberately avoid: the sterile-blue-and-white "hospital website" look, stock photos of smiling clinicians, and the cream/serif/terracotta AI-default palette.

**Palette** — draw from wayfinding signage rather than scrubs.
```
--ink        #14181C   near-black, primary text and header bar
--paper      #FBFAF7   warm off-white page ground
--slate      #5B6670   secondary text, metadata
--rule       #E2E1DC   hairlines and card borders
--signal     #0F5C4A   deep pine green — links, focus rings, primary action
--flag       #C2410C   burnt orange — used *only* for urgency (closing soon)
```
Two accents total. `--signal` carries every interactive element; `--flag` appears at most once per card and often not at all, so it retains meaning.

**Type**
- Display/UI: a condensed grotesque with signage character (Roboto Condensed, Barlow Condensed, or Archivo). Job titles are the loudest thing on the page.
- Body: a high-x-height, highly legible sans (Inter or Source Sans 3) at a generous 16–17px base — this audience reads on phones in bad light.
- Data/metadata: tabular figures for salary and dates so columns align in the list.

**Signature element — the shift band.** Every job card carries a thin vertical band on its leading edge, coded by shift type (day / evening / night / rotating / casual). It's the one piece of information healthcare workers filter on hardest and that no generalist board surfaces, and it turns the results list into something scannable at a glance. Encode it with **both** color and a short text label — never color alone. This is the page's memorable element; keep everything around it quiet.

**Layout**
```
┌──────────────────────────────────────┐
│ [wordmark]              Search  Alerts│  ← ink bar, thin
├──────────────────────────────────────┤
│  Search: [ role or keyword        ]   │
│          [ city / province   ▾ ]      │
├───────────────┬──────────────────────┤
│ Filters       │ 412 jobs · Ontario    │
│ ─────         │ ┌──────────────────┐  │
│ Category      │ ┃ Registered Nurse │  │  ┃ = shift band
│ Shift         │ ┃ Sinai Health     │  │
│ Type          │ ┃ Toronto, ON      │  │
│ Province      │ ┃ $39–52/hr · Nights│ │
│               │ └──────────────────┘  │
└───────────────┴──────────────────────┘
```
Mobile: filters collapse into a bottom sheet; the results list is the whole screen.

**Copy rules.** Label things the way a job seeker says them, not the way the database stores them: "Nights", not `shift_type: night`. Empty state is an instruction, not an apology: "No nursing jobs in Thunder Bay right now. Try widening to all of Ontario." Buttons name their outcome: "Apply on Sinai Health" beats "Apply now" because it tells you where you're about to land.

**Quality floor, unannounced:** responsive to 360px, visible keyboard focus rings on every interactive element, WCAG AA contrast throughout, `prefers-reduced-motion` respected, real `<label>`s on filters, and the results list navigable by keyboard. This audience includes people with disabilities and people on old phones — accessibility here is product quality, not compliance theatre.

---

## 9. SEO

Free acquisition, and for a job board it's most of the acquisition.

- Server-render every job page at `/jobs/[slug]` with **`JobPosting` JSON-LD** — `title`, `description`, `datePosted`, `validThrough`, `hiringOrganization`, `jobLocation`, `baseSalary`, `employmentType`. This is what gets you into Google for Jobs.
- Build landing pages on the facets people actually search: `/jobs/[province]/[category]` (e.g. "nursing jobs in Alberta"), plus `/jobs/[city]/[category]` for the top 25 cities. Give each real content, not just a filtered list.
- `sitemap.xml` generated from active jobs, regenerated on each ingest.
- Return **410 Gone** for expired job pages, not a soft 404 — Google penalizes stale job listings hard.

---

## 10. Code standards

- TypeScript strict mode. No `any` at module boundaries; parse external data into types with Zod rather than casting.
- Connectors are pure where possible: `normalize()` takes a payload and returns a `NormalizedPosting` with no I/O, which makes it unit-testable against recorded fixtures.
- **Save real source responses as fixtures** in `fixtures/{source}/`. Every connector gets tests that run `normalize()` against them. When a source changes its shape — and it will — the tests tell you before production does.
- Ingestion is idempotent: running the same connector twice changes nothing. Upsert on `(source_id, source_job_id)`, compare `content_hash` to decide whether anything actually changed.
- Every run writes an `ingest_runs` row. One connector failing never aborts the others.
- Structured logging with `source_id` and `run_id` on every line.
- Migrations checked into git and applied by CI. Never edit schema through the dashboard.
- Conventional file layout:
  ```
  app/                    # Next.js routes (RSC)
  components/
  lib/
    db/                   # supabase clients — server.ts, admin.ts, browser.ts
    schemas/              # zod
    taxonomy/             # NOC map, title aliases, categories
  workers/
    connectors/           # jobbank.ts, adzuna.ts, workday.ts, taleo.ts
    dedupe.ts
    expire.ts
    run.ts
  supabase/migrations/
  fixtures/
  ```

---

## 11. Build phases

**Phase 1 — spine (get something real on screen)**
1. Repo, Next.js + TS + Tailwind, Supabase project, migrations for all tables in §5, RLS policies.
2. Adzuna connector + `run.ts` + `ingest_runs` logging, on a GitHub Actions cron every 6 hours.
3. Minimal search page: keyword + province, reading `jobs` server-side. No login wall.
4. Deploy to a real domain.
   *Done when:* real Canadian healthcare jobs are searchable in a browser at a public URL.

**Phase 2 — unlock Job Bank and raise quality**
5. Confirm the Canadian Business Number, then submit the Job Bank feed request at `jobbank.gc.ca/survey/14`. Do this the day Phase 1 is live — approval is the long pole and everything else can proceed in parallel.
6. Fingerprinting + dedupe matcher + `job_sources`.
7. NOC taxonomy and rule-based categorization; Claude fallback with caching.
8. Expiry job (`expire.ts`) on a daily cron.
9. Job Bank connector once approved, plus the mandatory link-back rendering.

**Phase 3 — the differentiator**
9. `employers` registry + Workday platform connector; register 3 large health authorities.
10. Taleo and SuccessFactors connectors; expand the registry.
11. Shift-type extraction from titles and descriptions (this powers the signature UI element).

**Phase 4 — polish and growth**
12. Full design pass per §8; job detail pages.
13. JSON-LD, sitemap, facet landing pages, 410s.
14. Email alerts for saved searches (introduces Supabase Auth — revisit RLS at that point).

---

## 12. Start here

Begin with Phase 1, steps 1 and 2: the migrations and the Adzuna connector with its fixture tests. Build the raw → canonical pipeline correctly even while only one source feeds it — everything after depends on that shape being right, and Job Bank slots in as a second connector with no rework.

Two things to have ready in parallel, since neither blocks coding: an Adzuna app ID/key, and a Canadian Business Number for the Job Bank application in Phase 2.
