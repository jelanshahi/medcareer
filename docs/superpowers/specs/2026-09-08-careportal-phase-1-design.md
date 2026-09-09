# CarePortal — Phase 1 Design

**Date:** 2026-09-08
**Status:** Approved, ready for implementation planning
**Relationship to `healthcare-job-board-plan.md`:** that document remains the long-range spec. Where the two disagree about Phase 1, this one wins.

---

## 1. Product

A Canada-focused, healthcare-only job search site. Seeker-facing only. Jobs are aggregated from employers' own applicant tracking systems; employers never post here.

**The single job of the site:** let someone find a relevant, still-open healthcare job near them in under a minute, on a phone, and reach the employer's real application page in one click.

**Phase 1 launch scope:** Ontario only. Three hospital employers.

**Done when:** a stranger on a phone can search real Ontario healthcare jobs at a public URL and land on a hospital's own posting, and a scheduled ingest has run unattended long enough to prove listings stay fresh.

### Business context

This is a commercial project, not a portfolio piece. No Canadian Business Number exists yet; one will be registered during the build. That gates Job Bank access (§3.3) but blocks nothing else.

### Brand name — unresolved

`careportal.ca` and `careportal.com` are both taken. The final name is deferred until the build is underway.

**Design response:** every brand reference — site name, wordmark text, canonical URL, contact email — is read from a single `lib/site.ts` module. No brand string is hardcoded in a component, a page, or a connector's User-Agent. Renaming becomes one file edit plus DNS.

The project directory stays `carepotal` until the final name is chosen, so it gets renamed once rather than twice.

---

## 2. Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | **Direct ATS feeds are the Phase 1 source, not Adzuna** | Adzuna's free tier (~1,000 calls/month) cannot carry a real catalog, returns excerpt-only descriptions, and links through Adzuna rather than the employer — violating the site's core promise. A single Workday connector against a large hospital returns thousands of full, direct-apply postings for free. |
| 2 | **Adzuna dropped entirely** | It existed in the original plan only to bootstrap a live site quickly. Direct ATS does that better. |
| 3 | **Job Bank deferred** | Requires an active CBN plus an "established employment website". Revisit once the CBN clears and the site has traffic. |
| 4 | **Ontario only at launch** | Depth beats breadth. Job boards die of thinness. A nurse searching Thunder Bay must find real results, which requires owning one market before spreading. |
| 5 | **Hospitals + long-term care + home care; agencies excluded** | PSWs are the largest healthcare job category in Ontario by headcount and work almost entirely outside hospitals; hospital-only would quietly fail a named target user. Agencies post evergreen "always hiring" listings with no real vacancy behind them — the exact thing that makes generalist boards feel untrustworthy. |
| 6 | **Phase 1 is hospitals only; LTC and home care follow in Phase 2** | Hospitals cluster on a small number of enterprise ATS platforms and are fastest to connect. LTC and home care are a different tier of organization and may require additional connectors. |
| 7 | **Vertical slice, deployed early** | Every architectural assumption is currently untested. Discovering deployment, RLS, and payload-shape problems is cheap at 400 lines and expensive at 4,000. |
| 8 | **No `language` column, no monetization columns** | Both are premature. Adding a nullable column to Postgres later is a one-line migration, and `jobs` is a rebuildable projection (§4). |
| 9 | **Build dedupe in Phase 1 despite having nothing to dedupe** | It must exist before source #2, and it is easiest to verify when the correct answer is known to be "no duplicates" — any merge it produces in Phase 1 is a bug, which makes it self-testing. |
| 10 | **JSON-LD and 410-on-expired ship in Phase 1** | Both are nearly free on pages already being built, and both compound: indexing time cannot be recovered, and Google penalizes stale job listings hard. |

### Ruled out permanently

**Automated application submission.** No bot that fills and submits applications on employer ATS sites. It violates those sites' terms, fights active bot detection, risks getting our ingestion connectors blocked from the same domains, and can submit wrong credential or licensing data under a real person's name. If built later, the only supported form is **autofill assist**: store the profile, pre-fill the employer's real form, require the human to review and submit.

---

## 3. Data sources

### 3.1 What "pull from the employer site" means

We do **not** scrape rendered HTML. We call the public JSON endpoints that the employers' own career sites already call — for example Workday's `POST /wday/cxs/{tenant}/{site}/jobs`, which returns structured title, location, requisition number, description, and posting date.

This is more durable (a versioned API their own site depends on, rather than markup that changes on restyle), yields structured full text rather than fragile parsing, and — critically — scales as **one connector per ATS platform**, with employers as configuration rows. The marginal cost of employer #12 is one INSERT.

### 3.2 Crawling rules — enforced in code, not comments

- One shared rate limiter, roughly 1 request/second/host, exponential backoff on 429/5xx.
- Descriptive `User-Agent` including a contact URL that resolves to a real page (§6.1).
- Respect `robots.txt`; check each career site's terms before adding it to the registry.
- **If an endpoint requires auth, a token, or a login to reach, it is out of scope.**
- **Never bypass a CAPTCHA or bot-protection challenge.** If one appears, disable that connector and log it for manual review.

### 3.3 Deferred and excluded sources

- **Job Bank** — blocked on CBN. When pursued, two conditions must already hold, and both are designed in from day one: no login wall ever, and a visible link back to the Job Bank posting on every job sourced from it.
- **Adzuna** — dropped.
- **Indeed** — permanently out. The public Publisher API and XML feed were retired; what remains is partner-gated, and "unofficial Indeed APIs" resell scraped data.

---

## 4. The organizing architectural insight

```
  Workday JSON endpoints (3 Ontario hospitals)
        |
        v
  [ workday connector ]  fetch -> zod validate -> normalize -> hash
        |
        v
  raw_postings          <- source of truth, never hand-edited
        |
        v
  [ matcher ]           fingerprint -> group -> pick canonical
        |
        v
  jobs                  <- canonical projection, what the site reads
        |
        v
  Next.js RSC           search page + job pages, anonymous, no login wall
```

**`jobs` is a projection.** It is fully derivable by re-running the matcher over `raw_postings`. `raw_postings` is the actual source of truth.

This determines where care is warranted. Schema mistakes on `jobs` are cheap — drop it, change it, rebuild it. Schema mistakes on `raw_postings` are expensive, because the data is gone unless every source is re-fetched. So: be conservative on `raw_postings`, be relaxed about `jobs`.

It is also why the raw layer exists at all even with a single source feeding it. When the dedupe logic is wrong — and it will be, repeatedly — you re-run the matcher over stored rows instead of re-hitting every source.

### Connector contract

**Amended after Step 0 verification (§12).** Workday's list endpoint returns only a stub — title, path, a *relative* posted string, and the requisition id. Description, real dates, and employment type live behind a per-job detail fetch. The contract therefore needs an explicit hydration step rather than assuming one payload per posting:

```ts
interface Connector {
  readonly id: string;              // 'workday:shn'
  readonly kind: 'feed' | 'api' | 'ats';
  fetchPage(cursor?: string): Promise<{ items: JobStub[]; nextCursor?: string }>;
  hydrate(stub: JobStub): Promise<unknown>;     // fetch full detail; rate-limited
  normalize(raw: unknown): NormalizedPosting;   // pure, no I/O, throws on invalid
}
```

Connectors whose source returns complete records in one response implement `hydrate` as the identity function. `normalize()` always receives a hydrated payload, so it stays pure and fixture-testable.

```ts
type NormalizedPosting = {
  sourceId: string;
  sourceJobId: string;
  sourceUrl: string;
  title: string;
  employerName: string;
  facilityName?: string;
  description: string;        // sanitized HTML
  city: string;
  province: ProvinceCode;
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

`normalize()` is pure — payload in, `NormalizedPosting` out, no I/O — which is what makes it testable against recorded fixtures.

---

## 5. Data model

The schema in `healthcare-job-board-plan.md` §5 ships as written, with one amendment.

### Amendment: `raw_postings` semantics

The original comment says *"immutable, one row per source-observation"*, but `unique (source_id, source_job_id)` means the row is upserted — one row per job, overwritten each run.

**Resolution: keep the constraint, fix the comment.** The matcher needs the current normalized payload for every job ever seen, which the upsert provides. Posting revision history serves nothing being built. `content_hash` still signals when a posting genuinely changed; `first_seen_at` and `last_seen_at` bound the observation window. Rows are never deleted, so every job ever observed remains available for the matcher to re-run over.

### Agency exclusion

Handled by the existing `employers.facility_type` plus `is_active`. Agencies simply never get a registry row. No new column.

### Not added, deliberately

- `language` — Ontario launches English-only. The awkward part would be the generated `search_vector` hardcoding `'english'`, and rebuilding a generated column on `jobs` is precisely the cheap operation.
- Monetization and employer-account columns — nullable columns are trivial to add later.

### Deduplication

Fingerprint = `sha256(normalizedTitle | employerKey | city | province)` where:

- `normalizedTitle` is lowercased, accent-stripped, punctuation-stripped, **requisition** noise removed (`"RN - Emergency (Req #12345)"` becomes `"registered nurse emergency"`), abbreviations expanded via a shared alias map in `lib/normalize/title.ts` (`rn`, `rpn`, `lpn`, `np`, `psw`, and so on).

  **Amended 2026-09-08, after the Task 2 review.** The original text also called for stripping *seniority*. That was wrong and is now removed:

  - A requisition number is noise. **Seniority is data.** "Senior RN" and "RN" at the same hospital are different jobs at different pay grades, and collapsing them makes one genuine posting vanish — precisely the wrong-merge failure this same section calls worse than duplicates.
  - Phase 1 has exactly one source per employer, so there are no cross-source title variants for seniority-stripping to reconcile. The rule carried no upside and a real downside.

  **Parenthesised content is kept, not stripped.** The original rule deleted everything in parentheses to remove site codes like `(GEN)`. But hospitals also write seniority that way, so `"RN - Emergency (Senior)"` collapsed onto `"RN - Emergency"` — the same wrong merge, through a different code path. Site codes now survive into the normalized title (`"...CP2 (GEN)"` becomes `"...cp2 gen"`), which can only ever cause a duplicate, never a disappearance. Requisition numbers are still removed, by a rule that matches them wherever they appear.

  **The alias map expands only unambiguous abbreviations:** `rn`, `rpn`, `lpn`, `np`, `psw`, `hca`, `mlt`, `mrt`, `slp`. The two-letter clinical abbreviations `pt`, `ot`, and `rt` are **deliberately excluded** — in job titles they collide with "part time", "overtime", and other shift language, so `"RN PT Days"` would otherwise normalize to `"registered nurse physiotherapist days"`. Observed Workday postings spell these roles out in full (`"Occupational Therapist - ACTT"`), so nothing is lost.
- `employerKey` is the employer slug when it resolves to an `employers` row, otherwise a normalized employer name.

Exact fingerprint match only. Source priority for picking the canonical row: `direct ATS > Job Bank > Adzuna`. The canonical `apply_url` always points at the employer's own posting when one exists.

**No fuzzy matching.** Wrong merges are much worse than duplicates. Add trigram similarity only when real data proves exact matching misses.

Every contributing source URL is retained in `job_sources`, so a bad merge is diagnosable and the job page can later show "also listed on…".

### Freshness

1. Every connector run stamps `last_seen_at` on the raw rows it observed.
2. A job not seen in its source for **7 days** gets `is_active = false`.
3. Every job gets `expires_at = posted_at + 60 days` at minimum, and `closes_at` when the source provides it. Hard-expire on that date regardless.

Cards show a relative "Posted 3 days ago". Never display a job older than 60 days.

**Deferred:** liveness-checking `apply_url` with a periodic HEAD request. With a single direct-ATS source, disappearance from the feed *is* the closure signal, and `last_seen_at` catches it within a day. That check earns its place when sources we cannot trust to drop closed jobs are added.

---

## 6. The web app

### 6.1 Routes

| Route | Purpose |
|---|---|
| `/` | The search page. The home page **is** the search page — no marketing splash. |
| `/jobs/[slug]` | Job detail, server-rendered. |
| `/about` | Required, not optional: the contact URL our connector `User-Agent` points at. States who we are, what we fetch, and how to reach us to be delisted. |

### 6.2 Search page

Server component reading `jobs` directly. Query params `q`, `city`, `category`, `page`, all Zod-parsed and bounded server-side: `limit` capped at 50, offset bounded, `category` validated against the enum. No user input is interpolated into SQL.

**Filters: category and city only.** No province filter — Ontario-only makes it a control that does nothing. No shift filter — that data does not exist until extraction is built in a later phase. The columns remain in the schema; the UI does not offer filters it cannot honour.

Offset pagination, 25 per page. The empty state is an instruction, not an apology: *"No lab jobs in Kingston right now. Try all of Ontario."*

### 6.3 Job card — deliberately plain in Phase 1

Title, employer and facility, city, employment type, salary when present, "Posted 3 days ago."

Palette and typography from the plan's §8 are wired into Tailwind config, which is nearly free. **No shift band** — the signature element from §8 requires shift data that does not exist yet, and a fake signature element is worse than none.

### 6.4 Job detail page

Title, employer, location, metadata, the sanitized description, source attribution, and one primary action that names its destination — **"Apply on Sinai Health"**, not "Apply now" — with `rel="noopener noreferrer nofollow"` and `target="_blank"`.

### 6.5 SEO in Phase 1

**In:** `JobPosting` JSON-LD on the job page (`title`, `description`, `datePosted`, `validThrough`, `hiringOrganization`, `jobLocation`, `baseSalary`, `employmentType`), and **410 Gone** for expired job pages. Returning 200 with "this posting is closed" is exactly the stale-listing pattern Google penalizes job boards for.

**Out:** sitemap generation and facet landing pages. Both need volume, and thin facet pages read as doorway spam. Gate them later on a minimum active-job count.

### 6.6 Security

- **The service role key exists only in GitHub Actions secrets and Vercel server-side env.** Never in any file under `app/`, never in `NEXT_PUBLIC_*`.
- **RLS on every table.** `jobs` gets public read restricted to `is_active = true`. `raw_postings`, `ingest_runs`, and `employers` get no anon policy at all.
- Job descriptions are third-party HTML and the main attack surface. **Sanitize server-side at ingest time** with an allow-list (`p, br, ul, ol, li, strong, em, h3, h4`) — no `script`, `style`, `iframe`, no non-http schemes, no event handlers. Store the sanitized output. Any `dangerouslySetInnerHTML` reads an already-sanitized column.
- Connector target URLs come from the `employers` registry, never from user input. Allow `https:` only, set request timeouts, cap response sizes.
- Headers: CSP with no `unsafe-inline` scripts, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS.
- **No auth code exists in Phase 1 at all** — the strongest possible guarantee that the no-login-wall condition cannot be violated by accident.
- No personal data is stored in Phase 1.

### 6.7 Quality floor — unannounced, non-negotiable

Responsive to 360px, visible keyboard focus rings on every interactive element, WCAG AA contrast throughout, real `<label>`s on filters, a keyboard-navigable results list, `prefers-reduced-motion` respected. This audience includes people with disabilities and people on old phones; accessibility here is product quality, not compliance theatre.

---

## 7. Error handling

Failure is per-item, then per-source, never global.

| Failure | Behaviour |
|---|---|
| Zod rejects one posting | Log with `source_id` and `run_id`, skip that item, run continues |
| One connector throws | Its `ingest_runs` row is marked `failed`; other connectors are unaffected |
| 429 or 5xx | Exponential backoff behind the shared ~1 req/sec/host limiter |
| Auth wall or CAPTCHA detected | Disable that connector, log for manual review, never work around it |
| Run dies mid-way | Harmless — upserts are idempotent, and the next run reconciles |

Ingestion is idempotent: running a connector twice changes nothing. Upsert on `(source_id, source_job_id)` and compare `content_hash` to decide whether anything actually changed. Every run writes an `ingest_runs` row. Structured logging carries `source_id` and `run_id` on every line.

---

## 8. Testing

1. **`normalize()` against recorded fixtures** in `fixtures/workday/{employer}.json`. The core safety net: when Workday changes its response shape, these fail before production does.
2. **Fingerprint unit tests** on the alias map — `"RN - Emergency (Req #12345)"` must reduce to `"registered nurse emergency"`.
3. **RLS test.** Query every table with the *anon* key; assert that `raw_postings`, `ingest_runs`, and `employers` return nothing, and that `jobs` returns only `is_active = true` rows. This is the security control most likely to be silently wrong, so it gets an automated assertion rather than a manual check.
4. **Sanitizer test** with hostile input — `<script>`, `javascript:` hrefs, `onerror=` attributes — asserting they are stripped.
5. **End-to-end smoke test:** fixture → normalize → insert → dedupe → assert the expected `jobs` row appears.

---

## 9. Phase 1 work breakdown

**Step 0 — Employer verification. COMPLETE, see §12.**

Verify six large Ontario hospital networks: open each career site, observe the network requests, record the ATS platform and tenant/site identifiers. Candidates to check: UHN, Sinai Health, Sunnybrook, Unity Health Toronto, SickKids, Trillium Health Partners, Hamilton Health Sciences, The Ottawa Hospital.

Then **select the three that share an ATS platform**, so Phase 1 ships exactly one connector.

**Steps 1–13**

1. Repo hygiene: `git init` inside the project, `.gitignore`.
2. Next.js (App Router, TypeScript) and Tailwind scaffold; `lib/site.ts` brand config.
3. Supabase project; migrations for all tables in the plan's §5 plus the amendment in §5 above.
4. RLS policies, with the automated anon-key test.
5. `employers` registry seeded with the three verified hospitals.
6. Workday platform connector: Zod schemas, recorded fixtures, `normalize()` unit tests.
7. HTML sanitizer at the ingest boundary, with hostile-input tests.
8. `run.ts` orchestrator writing `ingest_runs`, structured logging, shared rate limiter.
9. Fingerprint and exact-match dedupe, writing `jobs` and `job_sources`.
10. `expire.ts` implementing the three freshness rules.
11. Search page, job detail page, `/about`.
12. JSON-LD and 410-on-expired.
13. GitHub Actions cron; deploy to Vercel. Since the brand name is unresolved, Phase 1 ships on the Vercel-provided URL and a custom domain is attached later — the deploy is not blocked on naming.

### Explicitly out of Phase 1

Adzuna · Job Bank · Claude classification fallback (rule-based NOC mapping covers hospital titles; add the fallback when the rules visibly fail) · auth, alerts, saved searches · wage grids · licensing and IEN facets · geocoding and radius search · sitemap and facet landing pages · LTC and home care employers · the full §8 design pass and the shift band.

---

## 10. Ideas parked for later phases

Recorded here so they are not lost, in rough order of how much competitive moat they buy.

1. **Wage transparency from collective agreements.** Most Canadian health-authority jobs are unionized (ONA, BCNU, CUPE, HSAA, SEIU) and wage grids are public, while postings often omit pay. Joining postings to grid data would let the site display real hourly rates that the posting itself does not state. No generalist board can do this.
2. **Licensing and immigration facets.** Filters for license required (RN/CNO, RPN, LPN, provincial college) and IEN-friendly, new-grad, or bridging-program flags. Invisible on every existing board, and central to how a large share of Canadian healthcare candidates actually search.
3. **Email alerts, earlier than the original plan's Phase 4.** A job board's entire product is "new jobs appeared"; alerts are the retention loop. Implementable as email plus a double opt-in token with no account, which preserves the no-login-wall condition.
4. **Closed-job verification** via periodic `apply_url` liveness checks, once untrusted sources exist.
5. **Bilingual and Quebec expansion**, which forces the `language` column and a per-language `search_vector`.
6. **Shift-type extraction** from titles and descriptions, which unlocks the shift band — the signature UI element from the plan's §8.
7. **Geocoding and radius search**, which the `jobs` lat/long columns already anticipate.

---

## 11. Known risks

1. ~~**The six candidate hospitals may run different ATS platforms**, forcing two connectors in Phase 1 instead of one.~~ **Resolved by Step 0 (§12):** three Ontario hospitals verified on Workday `wd10`, one connector.
2. ~~**An endpoint may sit behind auth or bot protection.**~~ **Resolved by Step 0:** all three endpoints return 200 to an unauthenticated `curl` with no cookies. The rule still stands for employers added later.
3. **Ontario-only and hospital-only is a thin catalog at launch.** Accepted: no audience exists yet, and Phase 2 widens it.
4. **The brand name is unresolved**, mitigated by centralising it in `lib/site.ts`.
5. **CBN registration timing** gates Job Bank but nothing in Phase 1.
6. **Structured metadata is an employer convention, not a platform feature** (§12.4). Any parser that reads union, salary, or shift out of a description body is opt-in per employer and must fail soft.

---

## 12. Step 0 results — employer verification (completed 2026-09-08)

Verified by observing live network traffic on the career sites and then calling the endpoints directly from `curl`, outside any browser session.

### 12.1 Platform decision: Workday (`wd10`)

Three Ontario **hospitals** confirmed on one platform, so Phase 1 ships exactly one connector as intended.

| Employer | Tenant | Site | Live jobs |
|---|---|---|---|
| Scarborough Health Network | `shn` | `SHN_External_Career_Site` | 111 |
| CHEO (Children's Hospital of Eastern Ontario, Ottawa) | `cheo` | `External_Site` | 26 |
| Oak Valley Health (Markham Stouffville) | `oakvalleyhealth` | `OakValleyHealth` | 60 |

**~197 live postings at verification time** — a thin but genuinely useful Phase 1 catalog, and it spans Toronto, Ottawa, and York Region rather than one city.

### 12.2 Confirmed endpoints

```
List:    POST https://{tenant}.wd10.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
         body: { "appliedFacets": {}, "limit": 20, "offset": 0, "searchText": "" }

Detail:  GET  https://{tenant}.wd10.myworkdayjobs.com/wday/cxs/{tenant}/{site}{externalPath}
```

All returned HTTP 200 to plain `curl` with a descriptive User-Agent, no cookies, no auth, no bot challenge, in 0.3–0.5s. `externalPath` from the list response already begins with `/job/`, so it is appended to the site path directly — do not prefix it again.

**robots.txt (`shn`):** `Allow: /SHN_External_Career_Site/`, `Disallow: /refreshFacet/`, plus a published `siteMap.xml`. `/wday/cxs/` is not disallowed. Re-check per tenant before registering each employer.

### 12.3 The list response is a stub — two-phase fetch is mandatory

The list endpoint returns only:

```json
{ "title": "...", "externalPath": "/job/...", "locationsText": "1940 Eglinton Ave",
  "postedOn": "Posted 4 Days Ago", "bulletFields": ["JR106772"] }
```

Consequences, all now designed for:

- **Description, real dates, and employment type require the detail fetch.** ~197 jobs means ~197 detail requests per full run; at the ~1 req/sec/host limit that is roughly 3.5 minutes of ingest. Acceptable, and it is why the connector contract gained `hydrate()` (§4).
- **`postedOn` is a relative human string.** Never parse it. Use the detail response's `startDate` (ISO `2026-09-04`) as `postedAt`.
- **`locationsText` can read "5 Locations"** — a single requisition spanning multiple sites. Phase 1 stores one job row and takes the city from the detail response's primary location. Revisit if multi-site postings prove common enough to hurt city filtering.
- **`timeType`** (`"Full time"` / `"Part time"`) is a genuine Workday field, present for all three employers, and maps directly to `employmentType`.

### 12.4 The important caveat: rich metadata is per-employer, not per-platform

SHN prefixes every description with a structured header:

```
Job Number: JR106772
Union: OPSEU
Job Category: Paramedical
Job Type: Permanent, Full time
Minimum - Maximum Hourly Rate: $38.84 - $54.77
Hours: Days, Weekends
```

That single block would yield union, category, employment type, **salary range**, and **shift** — for free. Oak Valley Health likewise puts union local in job titles (`"Unit Secretary, ... (CUPE) - Casual"`).

**But CHEO and Oak Valley Health do not use this header.** Their descriptions open as plain HTML. So this is an SHN authoring convention, not a Workday capability.

Design response: description-header parsing is an **opt-in, per-employer parser** driven by `employers.ats_config`, never applied by default, and it must fail soft — a missing header yields nulls, not an error. Where it does apply, the parsed fields are captured into the existing `salary_min`, `salary_max`, `shift_type`, and `employment_type` columns from day one, because they cost nothing extra once the detail payload is already fetched.

**The shift band still does not ship in Phase 1.** Shift data would be present for roughly half the catalog and absent for the rest, and a signature element that is blank on most cards reads as broken. Capture the data now; ship the band when coverage justifies it.

This also **validates the parked wage-transparency idea** (§10.1): union affiliation is present in real payloads today (OPSEU, CUPE), which is the join key that collective-agreement wage grids would need.

### 12.5 Phase 2 pipeline discovered along the way

Additional Ontario healthcare employers found on the **same Workday platform**, i.e. requiring no new connector:

| Employer | Tenant | Site | Segment |
|---|---|---|---|
| VHA Home HealthCare | `vhaca` | `VHA` | Home care |
| Extendicare / ParaMed | `extendicare` | `Paramed2023` | LTC + home care |
| Public Health Ontario | `publichealthontario` | `PHOCareerSite` | Public health |
| Ontario Health | `oh` (on `wd3`) | `OH` | Provincial agency |

This is materially good news for Phase 2: the LTC and home-care employers that carry the PSW-heavy postings — the segment hospitals structurally miss — are reachable through the connector Phase 1 already builds. Phase 2 may be registry work rather than connector work.

A separate **Taleo** cluster exists for later (Hamilton Health Sciences at `hhsc.taleo.net`, St. Joseph's Healthcare Hamilton via `tre.tbe.taleo.net?org=STJOSHAM`), and UHN runs SmartRecruiters. All are deferred; none are needed for Phase 1.

### 12.6 Employers checked but not resolved

Sunnybrook, SickKids, Trillium Health Partners, Sinai Health, and Unity Health Toronto did not surface a determinable ATS from public search. They are not needed for Phase 1 and can be verified when the registry expands.
