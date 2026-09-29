# SmartRecruiters Connector — Design

**Date:** 2026-09-29
**Status:** Approved, ready for implementation planning

---

## 1. Purpose

Add a `smartrecruiters` connector so four more Ontario hospitals can be ingested, per `docs/research/ontario-hospitals-ats.md`:

- Halton Healthcare
- University Health Network (UHN)
- West Nipissing General Hospital
- William Osler Health System

All four run their public careers page on `careers.smartrecruiters.com/<company-slug>`. Unlike most connectors in this codebase, SmartRecruiters publishes an official, documented public JSON API for postings — `api.smartrecruiters.com/v1/companies/{companyId}/postings` — so this connector calls that API directly rather than scraping HTML or a sitemap.

**Done when:** `workers/connectors/smartrecruiters.ts` exists with unit-tested list/hydrate/normalize logic, `workers/run.ts` knows the `smartrecruiters` platform, and a seed migration registers the four hospitals `is_active = false` pending the live pre-flight check in §6.

---

## 2. Decisions made during brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | **Use SmartRecruiters' public Postings API, not HTML scraping** | It's official, versioned JSON — structurally the same trust level as Workday's or Oracle Cloud's endpoints, and far more durable than parsing `careers.smartrecruiters.com` markup. |
| 2 | **Config shape is `{ key, host, cityAliases? }`** | Matches the existing `key`+`host` pattern used by iCIMS/Phenom/BC Health Jobs. `host` (`api.smartrecruiters.com`) is identical across all four rows but kept explicit, not hardcoded, so `EmployerRowSchema` validates it and outbound-URL host checks stay meaningful. |
| 3 | **No changes needed to `createHostLimiter`** | All four hospitals share one host, so they automatically share one rate-limit budget — the same shared-host behavior Manitoba's SuccessFactors tenant already exercises, arrived at from the other direction (one employer, many tenants there; one host, many employers here). |
| 4 | **Salary and shift type are left `undefined` for v1** | SmartRecruiters has no reliably structured field for either (unlike iCIMS's labelled `<dt>/<dd>` fields). Guessing from free text risks the same false-positive class of bug the Workday connector's salary-regex comment documents. Revisit only if a specific employer is confirmed to expose one consistently. |
| 5 | **Description concatenates every present `jobAd.sections` entry** | `companyDescription`, `jobDescription`, `qualifications`, `additionalInformation` — each rendered under its own heading, then `sanitizeDescription()`. This is full fidelity to what a seeker sees on the real posting, not a trimmed subset. |
| 6 | **Ship the connector now; verify live before activating** | Network tools were unavailable while this was designed. The migration seeds all four employers `is_active = false`, identical to the Workday zero-cost migration, with a comment pointing at the pre-flight checklist below. |

---

## 3. Architecture

`workers/connectors/smartrecruiters.ts` follows the same shape as every other connector: Zod schemas for both API responses, pure exported functions for parsing/normalizing (unit-testable without I/O), and a `createSmartRecruitersConnector()` factory returning the standard `Connector` interface (`fetchPage` → `hydrate` → `normalize`).

```ts
export type SmartRecruitersEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    key: string;   // SmartRecruiters company identifier, e.g. "UniversityHealthNetwork"
    host: string;  // always "api.smartrecruiters.com"; kept explicit, not hardcoded
    cityAliases?: Record<string, string>;
  };
};
```

`workers/run.ts` gains a matching Zod schema and a new arm on the `EmployerRowSchema` discriminated union:

```ts
const SmartRecruitersAtsConfigSchema = z.object({
  key: z.string().min(1),
  host: z.string().min(1),
  cityAliases: z.record(z.string(), z.string()).optional(),
});
```

---

## 4. Data flow

- **`fetchPage(cursor)`** — `GET https://{host}/v1/companies/{key}/postings?limit=100&offset={cursor}`. Stop paging when the returned page is shorter than the requested limit, not when a `totalFound`-style count is exhausted — the same short-page lesson the Workday connector already encodes (some vendors' totals are unreliable after the first page).
- **`hydrate(stub)`** — `GET https://{host}/v1/companies/{key}/postings/{id}`. The list endpoint omits `jobAd` (the actual description), so every posting needs one detail call — the same cost shape as iCIMS's sitemap-then-page-fetch pattern.
- **`normalize(raw)`** — pure mapping, detailed in §5.

---

## 5. Normalization mapping

| Field | Source | Notes |
|---|---|---|
| `sourceId` | `smartrecruiters:{key}` | |
| `sourceJobId` | `posting.id` | |
| `sourceUrl` / `applyUrl` | `posting.applyUrl` | Validated `https:` and host-checked against an allowed SmartRecruiters domain suffix (`jobs.smartrecruiters.com` / `careers.smartrecruiters.com`) — same trust-chain reasoning as every other connector's `requireHost`: outbound URLs come only from the registry + the vendor's own JSON, never anything else. |
| `title` | `posting.name` | |
| `postedAt` | `posting.releasedDate` | ISO datetime |
| `city` / `province` | `location.city` / `location.region` | Through `cityAliases` and `provinceCodeFromName`, falling back to `employer.defaultCity` / `employer.province` — identical pattern to iCIMS. |
| `description` | `jobAd.sections.*` | Concatenate whichever of `companyDescription`, `jobDescription`, `qualifications`, `additionalInformation` are present, each under its own heading, then `sanitizeDescription()`. Missing sections are skipped, never inferred. |
| `employmentType` | `typeOfEmployment.label` | `"Full-time"→full_time`, `"Part-time"→part_time`, `"Temporary"→temporary`, `"Casual"→casual`, `"Contract"→contract`. Anything else (e.g. `"Internship"`) → `undefined` — it's outside `EMPLOYMENT_TYPES`. |
| `shiftType` | — | `undefined` for v1 (see decision #4). |
| `salaryMin` / `salaryMax` / `salaryPeriod` | — | `undefined` for v1 (see decision #4). |
| `facilityName` | — | `undefined`; `location.city` already carries per-posting site granularity for these employers. |

---

## 6. Error handling

Consistent with every existing connector:

- Both API responses (list item, detail) are parsed through Zod; a malformed posting throws and is skipped without aborting the rest of the run.
- `requireHost`-style validation throws if `posting.applyUrl` isn't on an allowed SmartRecruiters domain.
- A non-2xx list or detail fetch throws an `Error` naming the URL and status, matching the message style in `workday.ts`/`icims.ts`.

---

## 7. Testing

`tests/workers/smartrecruiters-normalize.test.ts`, mirroring `tests/workers/workday-normalize.test.ts`. Fixtures under `fixtures/smartrecruiters/` (one list-page JSON, one detail JSON — likely captured from UHN as the largest/most-scrutinized tenant once live access is available).

Cases to cover:
- Pagination stops on a short page, not on a trusted total count.
- Full `typeOfEmployment.label` → `EmploymentType` mapping table, including the "maps to `undefined`" cases.
- Description concatenation when one or more `jobAd.sections` entries are absent.
- `applyUrl` host-mismatch is rejected (tampered/unexpected domain).
- City/province fallback to `employer.defaultCity`/`employer.province` when `location.region` is empty or unrecognized.

---

## 8. Pre-flight checklist — run once network tools recover, before writing the seed migration

1. Confirm the actual `companyId` path segment for each of the four hospitals — the careers-page slug (e.g. `HaltonHealthcare1`) may or may not equal the API's identifier.
2. Request the list endpoint with `SITE.userAgent` and confirm it isn't behind a bot challenge (Cloudflare or similar) — this API has never been checked against this crawler.
3. Check SmartRecruiters' API terms of use for redistribution/caching restrictions — same diligence already applied to the Quebec `wpjobmanager` licensing question.
4. Confirm the documented/actual rate limit so `createHostLimiter`'s delay is sized correctly for one shared host serving four employers at once.
5. Confirm the real `applyUrl` domain pattern seen in live responses, to set the right host allowlist in code (not guessed).

---

## 9. Seed migration

A new `supabase/migrations/0024_seed_smartrecruiters_ontario.sql`, seeding all four employers with `ats_platform = 'smartrecruiters'`, `facility_type = 'hospital'`, `province = 'ON'`, and `is_active = false` — identical pattern to `0023_seed_workday_ontario_expansion.sql` — with a comment pointing back to §8 and the `update employers set is_active = true where slug in (...)` activation statement once verified.

Note: the exact `key` (company identifier) values for each of the four employers are placeholders until §8.1 confirms them live — the migration is not written until that check runs, so no guessed identifiers ship in a committed file.
