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
| 2 | **Try JSON-LD first, fall back to label-based HTML parsing** | The two tenants turned out to render detail pages two genuinely different ways, discovered only once both fixtures were actually captured: Baycrest's page carries a full schema.org `JobPosting` JSON-LD block (clean ISO `datePosted`, structured `jobLocation.address`, same shape `icims.ts` already parses) and *no* labelled h2/div fields at all; MAHC's page has the labelled h2/div fields (`<h2>Job Location</h2>` etc.) and *no* JSON-LD. A single tenant having both was never observed. The connector tries JSON-LD first (it's more reliable — structured, ISO-dated, vendor-authored), and only falls back to label-based extraction when no JSON-LD block is present. |
| 2a | **Within the label-based fallback, match by `<h2>` text, not by div id** | MAHC's detail pages use tenant-specific custom field ids (`mahc_positiontype`, `mahc_union`, `mahc_closedate`) alongside generic ones (`DisplayLocation`, `PostingDate`). A future third tenant on this fallback path won't share MAHC's custom ids, but would still render the same human-readable labels. Matching on label text, not id, is what makes the fallback tenant-agnostic — the same principle `oraclecloud.ts`'s `FIELD_LABELS` regex already uses. |
| 3 | **Extract only core fields: title, description, city/province, postedAt** | Both extraction paths (JSON-LD and label-fallback) agree on covering just these. MAHC's pages happen to also carry employment type, salary, union and closing date under labels, and Baycrest's JSON-LD carries an `employmentType` value too — but Baycrest's is literally `"OTHER"` (uninformative), and nothing confirms every SilkRoad tenant exposes the rest under a consistent label or a filled-in JSON-LD field. Guessing wrong is worse than leaving a field `undefined` (the same judgment already applied to SmartRecruiters' salary/shift fields). `employmentType`, `salaryMin/Max`, `shiftType`, and `closesAt` are all left `undefined` for v1 regardless of which path extracted the posting. |
| 4 | **Rate limit is fixed at the robots.txt-stated `Crawl-Delay: 10`, not deferred to a pre-flight step** | Unlike SmartRecruiters (where the rate limit needed separate confirmation), `jobs-ca.silkroad.com/robots.txt` states the limit outright. `createHostLimiter(10_000)` is specified directly in the design rather than discovered later. |
| 5 | **Discover postings via the paginated listing page, not the sitemap index** | The sitemap index at `jobs-ca.silkroad.com/sitemap.xml` references per-tenant sitemap files, but those 404'd on direct fetch during investigation (possibly requiring a header or routing this investigation didn't reproduce). The listing page (`?page=N`) is confirmed working and is what the connector uses; revisit the sitemap route only if someone figures out why it 404s. |
| 6 | **UKG and Dayforce are parked, not built** | Both need live network-call tracing via a headless browser, which wasn't available during this investigation. Documented in `docs/research/canada-health-ats.md` so the dead end isn't re-investigated from scratch later. |

---

## 3. Architecture

`workers/connectors/silkroad.ts` follows the established shape: a Zod schema for the JSON-LD path
(the same `icims.ts` `JobPostingSchema` shape applies almost unchanged, since both are schema.org
`JobPosting`), plain string/DOM extraction for the label-based fallback path, pure exported
parse/normalize functions, and a `createSilkRoadConnector()` factory returning the standard
`Connector` interface.

**`node-html-parser` API note, confirmed against the installed version's type definitions
(`node_modules/node-html-parser/dist/nodes/html.d.ts`) before relying on it:** this library
explicitly does **not** expose `parentNode`, `nextSibling`, or `nextElementSibling` — only
`querySelector`, `querySelectorAll`, `getElementById`, `.children`, `.innerHTML`, and `.text`,
backed by the full `css-select` engine (so `[id^="..."]` attribute-prefix selectors work). The
label-based fallback is designed around exactly this surface: rather than finding an `<h2>` and
walking to "the next sibling div" (not possible with this library), it finds each field's whole
container (`[id^="ConfigurablePageDetail__"]`), reads that container's own `<h2>` and `<div>`
children via nested `querySelector` calls, and matches on the `<h2>` text.

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

`title` and `sourceId`/`sourceJobId`/`sourceUrl` are the same regardless of which path extracted
a posting. Everything else branches on whether a JSON-LD `JobPosting` block is present.

| Field | Source | Notes |
|---|---|---|
| `sourceId` | `silkroad:{tenant}` | |
| `sourceJobId` | the numeric id from the detail URL (`/jobs/{id}`) | |
| `sourceUrl` / `applyUrl` | `https://{host}/{tenant}/{boardCode}/jobs/{id}` | Built from the registry host + path, never from page content — same trust-chain principle as every other connector, simpler here since there's no vendor-supplied apply link to validate at all. |
| `title` | JSON-LD `title`, else text of `#Jobs_JobDetail_TitleText` | |

**When JSON-LD is present** (Baycrest's path):

| Field | Source | Notes |
|---|---|---|
| `description` | JSON-LD `description` | Already full HTML (Word-paste markup, same style as the label-fallback path) — `sanitizeDescription()` applied the same way either path produces it. |
| `city` / `province` | JSON-LD `jobLocation.address.addressLocality` / `addressRegion` | `addressRegion` is ISO 3166-2 (`"CA-ON"`), not a province name or bare code — needs its own parse (strip the `"CA-"` prefix) rather than reusing `provinceCodeFromName` directly. |
| `postedAt` | JSON-LD `datePosted` | Already a full ISO 8601 timestamp (`"2026-03-17T16:03:05+00:00"`) — `new Date(...)` directly, no custom parsing needed. |

**When JSON-LD is absent** (MAHC's path, the label-based fallback):

| Field | Source | Notes |
|---|---|---|
| `description` | inner HTML of `#ConfigurablePageDetail__JobDescription` | `sanitizeDescription()` applied; the raw markup is Word-paste HTML (nested spans, inline styles) which `sanitizeDescription`'s existing allow-list already strips down correctly. |
| `city` / `province` | the value in the container whose `<h2>` text is "Job Location", found via the `[id^="ConfigurablePageDetail__"]` container-scoped lookup (decision #2a), parsed by taking the **last two** comma-separated segments as province/city (the address has a variable-length street-address prefix — "100 Frank Miller Dr, Huntsville, Ontario, Canada" — so indexing from the end is robust where indexing from the start, as `oraclecloud.ts`'s `parseLocation` does for its fixed 3-part shape, is not) | Falls back to `employer.defaultCity`/`employer.province` when the label is missing or unparseable. "Additional Locations" (seen on multi-site MAHC postings) is not used for v1. |
| `postedAt` | the value in the container whose `<h2>` text is "Posted Date", format `M/D/YYYY` (e.g. `9/3/2026`) | Needs a dedicated parser — not ISO, not a format `new Date()` reliably handles across locales. |

**Both paths:**

| Field | Source | Notes |
|---|---|---|
| `employmentType`, `salaryMin/Max`, `salaryPeriod`, `shiftType`, `closesAt` | — | `undefined` for v1 (decision #3), on both paths. |
| `facilityName` | — | `undefined`; "Job Location" / `jobLocation` already carries the specific site address. |

---

## 6. Error handling

- A detail page missing both a title (JSON-LD `title` and `#Jobs_JobDetail_TitleText`) or both a
  description throws (both are required `NormalizedPosting` fields) — one bad page is skipped by
  the existing per-item `try/catch` in `workers/run.ts`, never aborting the whole run.
- JSON-LD path: an unparseable `datePosted` throws with the job id named, matching
  `workday.ts`'s `Unparseable startDate` style — `NormalizedPosting.postedAt` is required, so it
  can't silently become `undefined`.
- Label-fallback path: a missing "Job Location" falls back to the registry default rather than
  throwing (location has a sane fallback); a missing or unparseable "Posted Date" throws, same
  reasoning as the JSON-LD path — there is no reasonable fallback for a required date.
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
- `mahc-job-detail.html` — a captured MAHC detail page: no JSON-LD, exercises the label-fallback
  path, and has the extra tenant-specific fields (Union, Position Type, Salary Range/Type,
  Closing Date) — the test proves these are correctly ignored, not accidentally parsed into the
  wrong field.
- `baycrest-job-detail.html` — a captured Baycrest detail page: has JSON-LD, exercises that path
  instead, and has none of MAHC's labelled h2/div fields at all — the test proves the connector
  doesn't *require* the label-fallback structure to be present when JSON-LD covers it.

Cases to cover:
- Listing-page link extraction finds exactly the job ids present, in the right URL shape.
- The short-page stop rule (a page with fewer than 10 links signals the end).
- The JSON-LD path is used when present (Baycrest fixture): `city`/`province` from
  `jobLocation.address`, `postedAt` from `datePosted` parsed directly as ISO.
- The label-fallback path is used when JSON-LD is absent (MAHC fixture): container-scoped
  `<h2>`-text matching finds "Job Location" and "Posted Date" correctly alongside MAHC's other,
  unrelated tenant-specific labelled fields.
- `addressRegion`'s `"CA-"` prefix is stripped correctly (JSON-LD path).
- Date parsing of the label-fallback's `M/D/YYYY` format, including a single-digit month/day case.
- City/province fallback to `employer.defaultCity`/`employer.province` when the label-fallback
  path's "Job Location" is absent.
- A missing title or description throws, on both paths.
- `employmentType`/`salaryMin`/`salaryMax`/`shiftType`/`closesAt` are all `undefined` on both
  fixtures, confirming v1 scope is respected even though MAHC's fixture *could* supply some of
  them via labels, and Baycrest's JSON-LD *does* supply an (ignored) `employmentType`.

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
