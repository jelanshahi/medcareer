# SilkRoad Connector — Design

**Date:** 2026-10-01
**Status:** Approved, ready for implementation planning

---

## 1. Purpose

Add a `silkroad` connector so two Ontario hospitals can be ingested: Baycrest and Muskoka
Algonquin Healthcare (MAHC). Both run SilkRoad Technology's hosted career site platform at
`jobs-ca.silkroad.com`, a classic server-rendered (not SPA) ATS.

**Investigation note (this matters for the record):** `docs/research/ontario-hospitals-ats.md`
listed Baycrest's careers URL as `baycrestcareers.silkroad.com`, which turned out to be a legacy
front-door that redirects to `baycrest-hospital-openhire.silkroad.com` — a different host whose
robots.txt is `Disallow: /`. Live investigation (1 Oct 2026) found Baycrest also has a current
presence on the same open platform MAHC uses, at `jobs-ca.silkroad.com/Baycrest/Careers`, with
identical page structure. That host's `/sitemap.xml` is a sitemap *index* naming both
`sitemap_MAHC.xml` and `sitemap_Baycrest.xml` (though the individual sitemap files themselves
404'd on direct fetch — not relied on; the connector discovers postings via the listing page
instead). Two other candidate platforms were investigated and parked rather than pursued:
- **UKG/UltiPro** (Bruyère, Homewood, Huron Perth, Ontario Shores): a React SPA with no
  server-rendered listing data. The public job-search API appears to live under
  `.../JobBoardView/...`, a path `recruiting.ultipro.ca`'s robots.txt explicitly disallows
  (`Disallow: */JobBoardView`), while the surrounding `/JobBoard/` shell is allowed. Not
  confirmed either way without a headless browser to trace the real network call.
- **Dayforce** (Sinai Health, Women's College): no blocking robots.txt at all (the newer
  "content signals" format, no actual `Disallow` lines), but it's a Next.js app whose job-fetch
  API call is built dynamically in JS rather than appearing as a literal string in ~1.4MB of
  bundled code checked. Same blocker as UKG: needs a headless browser to observe the real
  request, which wasn't available for this investigation.

Both are candidates for a future connector once that tracing can happen (see
`docs/research/canada-health-ats.md`'s "What's next" convention — recording the dead end so
nobody re-runs the same investigation).

**Done when:** `workers/connectors/silkroad.ts` exists with unit-tested list/hydrate/normalize
logic built from real captured fixtures (not synthetic), `workers/run.ts` knows the `silkroad`
platform, and a seed migration registers Baycrest and MAHC.

---

## 2. Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | **Scrape server-rendered HTML, not an API** | Unlike SmartRecruiters, SilkRoad's job board has no documented public API and no client-side data-fetch layer to reverse-engineer — pages are plain server-rendered HTML, the same category as `icims.ts`. There is no API-vs-scrape choice to make here. |
| 2 | **Parse fields by their `<h2>` label text, not by div id** | MAHC's detail pages use tenant-specific custom field ids (`mahc_positiontype`, `mahc_union`, `mahc_closedate`) alongside generic ones (`DisplayLocation`, `PostingDate`). A second tenant (Baycrest) won't share MAHC's custom field ids, but both render the same human-readable labels ("Job Location", "Posted Date"). Matching on label text, not id, is what makes one connector work across tenants with different custom fields — the same principle `oraclecloud.ts`'s `FIELD_LABELS` regex and `icims.ts`'s `<dt>/<dd>` label matching already use here. |
| 3 | **Extract only core fields: title, description, city/province, postedAt** | MAHC's pages happen to also carry employment type, salary, union and closing date — but nothing confirms every SilkRoad tenant exposes these under a consistent label, and guessing wrong is worse than leaving a field `undefined` (the same judgment already applied to SmartRecruiters' salary/shift fields). `employmentType`, `salaryMin/Max`, `shiftType`, and `closesAt` are all left `undefined` for v1. |
| 4 | **Rate limit is fixed at the robots.txt-stated `Crawl-Delay: 10`, not deferred to a pre-flight step** | Unlike SmartRecruiters (where the rate limit needed separate confirmation), `jobs-ca.silkroad.com/robots.txt` states the limit outright. `createHostLimiter(10_000)` is specified directly in the design rather than discovered later. |
| 5 | **Discover postings via the paginated listing page, not the sitemap index** | The sitemap index at `jobs-ca.silkroad.com/sitemap.xml` references per-tenant sitemap files, but those 404'd on direct fetch during investigation (possibly requiring a header or routing this investigation didn't reproduce). The listing page (`?page=N`) is confirmed working and is what the connector uses; revisit the sitemap route only if someone figures out why it 404s. |
| 6 | **UKG and Dayforce are parked, not built** | Both need live network-call tracing via a headless browser, which wasn't available during this investigation. Documented in `docs/research/canada-health-ats.md` so the dead end isn't re-investigated from scratch later. |

---

## 3. Architecture

`workers/connectors/silkroad.ts` follows the established shape: a Zod-free HTML-parsing pipeline
(no JSON schema to validate, since there's no JSON API — `node-html-parser`, already a dependency
used by `icims.ts`, does the structural work instead), pure exported parse/normalize functions,
and a `createSilkRoadConnector()` factory returning the standard `Connector` interface.

```ts
export type SilkRoadEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    host: string;      // "jobs-ca.silkroad.com" for both employers today
    tenant: string;     // e.g. "MAHC", "Baycrest" — the first URL path segment
    boardCode: string;  // e.g. "MAHCCareers", "Careers" — the second URL path segment
  };
};
```

`workers/run.ts` gains a matching Zod schema (for the registry row, not the HTML — the registry
row itself is still a database value and gets the same `z.object` validation every platform's
config gets) and a new arm on the `EmployerRowSchema` discriminated union:

```ts
const SilkRoadAtsConfigSchema = z.object({
  host: z.string().min(1),
  tenant: z.string().min(1),
  boardCode: z.string().min(1),
});
```

---

## 4. Data flow

- **`fetchPage(cursor)`** — `GET https://{host}/{tenant}/{boardCode}?page={n}` (n starting at 1).
  Parse every `<a href="/{tenant}/{boardCode}/jobs/{id}">` on the page with `node-html-parser`.
  Stop when a page returns fewer than 10 links (the observed page size on both tenants) — the
  same short-page-not-count rule `workday.ts` and `smartrecruiters.ts` already use, for the same
  reason: nothing here publishes a trustworthy total count to paginate against.
- **`hydrate(stub)`** — `GET https://{host}/{tenant}/{boardCode}/jobs/{id}`.
- **`normalize(raw)`** — parse the rendered detail page HTML (detailed in §5).

**Rate limiting**: `createHostLimiter(10_000)` (10-second minimum interval), matching the
host's published `Crawl-Delay: 10`. Both employers share this one host, so they automatically
share this one rate budget — the same shared-host behavior already established for SmartRecruiters
and Manitoba's SuccessFactors tenant.

---

## 5. Normalization mapping

| Field | Source | Notes |
|---|---|---|
| `sourceId` | `silkroad:{tenant}` | |
| `sourceJobId` | the numeric id from the detail URL (`/jobs/{id}`) | |
| `sourceUrl` / `applyUrl` | `https://{host}/{tenant}/{boardCode}/jobs/{id}` | Built from the registry host + path, never from page content — same trust-chain principle as every other connector, simpler here since there's no vendor-supplied apply link to validate at all. |
| `title` | text of `#Jobs_JobDetail_TitleText` | |
| `description` | inner HTML of `#ConfigurablePageDetail__JobDescription` | `sanitizeDescription()` applied; the raw markup is Word-paste HTML (nested spans, inline styles) which `sanitizeDescription`'s existing allow-list already strips down correctly. |
| `city` / `province` | the value following the `<h2>Job Location</h2>` label, found by label text (see decision #2), parsed the same way `oraclecloud.ts`'s `parseLocation` splits a comma-separated address | Falls back to `employer.defaultCity`/`employer.province` when the label is missing or unparseable. "Additional Locations" (seen on multi-site MAHC postings) is not used for v1 — the primary "Job Location" is enough, and multi-site handling can follow `cityAliases` if it turns out to matter. |
| `postedAt` | the value following `<h2>Posted Date</h2>`, format `M/D/YYYY` (e.g. `9/3/2026`) | Needs a dedicated parser — not ISO, not a format `new Date()` reliably handles across locales. |
| `employmentType`, `salaryMin/Max`, `salaryPeriod`, `shiftType`, `closesAt` | — | `undefined` for v1 (decision #3). |
| `facilityName` | — | `undefined`; "Job Location" already carries the specific site address. |

---

## 6. Error handling

- A detail page missing `#Jobs_JobDetail_TitleText` or `#ConfigurablePageDetail__JobDescription`
  throws (both are required `NormalizedPosting` fields) — one bad page is skipped by the existing
  per-item `try/catch` in `workers/run.ts`, never aborting the whole run.
- A missing or unparseable "Job Location" or "Posted Date" label falls back (location) or throws
  with the job id named (postedAt — `NormalizedPosting.postedAt` is required, so an unparseable
  date can't silently become `undefined`; this mirrors `workday.ts`'s `Unparseable startDate`
  error).
- A non-2xx list or detail fetch throws naming the URL and status, matching the message style in
  every other connector here.

---

## 7. Testing

`tests/workers/silkroad-normalize.test.ts`. Fixtures under `fixtures/silkroad/` are **real
captured HTML**, not synthetic (unlike SmartRecruiters' fixtures, which were hand-written against
documented API shapes) — this connector has no schema to validate against, only actual rendered
markup, so the fixtures need to be the real thing:

- `mahc-listing-page1.html` — a captured MAHC listing page, to test link extraction and the
  short-page stop rule.
- `mahc-job-detail.html` — a captured MAHC detail page, which has the extra tenant-specific
  fields (Union, Position Type, Salary Range/Type, Closing Date) — the test proves these are
  correctly ignored, not accidentally parsed into the wrong field.
- `baycrest-job-detail.html` — a captured Baycrest detail page, which lacks those tenant-specific
  fields — the test proves the connector doesn't *require* them (no field ids hardcoded).

Cases to cover:
- Listing-page link extraction finds exactly the job ids present, in the right URL shape.
- The short-page stop rule (a page with fewer than 10 links signals the end).
- `fieldByLabel`-style extraction finds "Job Location" and "Posted Date" correctly on both the
  MAHC and Baycrest fixtures despite their different surrounding field ids.
- Date parsing of the `M/D/YYYY` format, including a single-digit month/day case.
- City/province fallback to `employer.defaultCity`/`employer.province` when a label is absent.
- A missing title or description throws.
- `employmentType`/`salaryMin`/`salaryMax`/`shiftType`/`closesAt` are all `undefined` on both
  fixtures, confirming v1 scope is respected even though MAHC's fixture *could* supply some of
  them.

---

## 8. Pre-flight checklist — before writing the seed migration

Smaller than usual: most of the verification this section would normally defer to "live check
later" was already done live during this investigation (robots.txt, bot-challenge-free fetches,
real captured HTML). What's left:

1. Re-fetch both tenants' listing and one detail page each with `SITE.userAgent` specifically
   (the investigation already used that exact UA throughout, so this is a confirmation rerun, not
   new territory) immediately before writing the migration, in case anything changed between
   design and implementation.
2. Confirm the `tenant`/`boardCode` path segments are still exactly `MAHC`/`MAHCCareers` and
   `Baycrest`/`Careers`.
3. No terms-of-use page was found restricting automated access on this platform; note that
   absence and proceed, consistent with the precedent already set for Saskatchewan Health
   Authority (`docs/research/canada-health-ats.md`: "robots.txt is absent... which the robots
   standard treats as no restrictions" — here robots.txt exists and is permissive, an even
   clearer case).

---

## 9. Seed migration

A new `supabase/migrations/0025_seed_silkroad_ontario.sql`, seeding Baycrest and Muskoka
Algonquin Healthcare with `ats_platform = 'silkroad'`, `facility_type = 'hospital'`,
`province = 'ON'`. Unlike SmartRecruiters, nothing found during investigation blocks activation —
both can likely be seeded `is_active = true` directly, pending the Step-8 pre-flight rerun
confirming nothing changed since this design was written.
