# Near me (location-based job search)

## Goal

Let a visitor find jobs close to them by clicking a "Near me" button, without
requiring them to know or type a city name. Add the control to the two
primary search entry points: the home page hero search form (`app/page.tsx`)
and the `/jobs` search bar (`components/SearchForm.tsx`).

## Non-goals

- No true distance-based sorting of individual job listings. The `jobs` table
  has `latitude`/`longitude` columns (migration `0001_init.sql`), but nothing
  in the ingestion/normalize pipeline populates them today, and geocoding the
  ~6,400 existing rows (plus enriching every future connector) is a
  significantly larger project. This feature resolves the user's location to
  the single nearest **known job city** and reuses the existing `/jobs?city=`
  filter — it does not change how results within a city are ranked.
- No hand-maintained coordinate table for our own cities. The distinct city
  list spans hundreds of small towns (e.g. CarePartners alone posts in towns
  like Kapuskasing, Penetanguishene, Arnprior) contributed by whatever
  employers/connectors exist at any given time — a static table would need
  the same ongoing maintenance as geocoding jobs directly. Instead, only the
  user's single coordinate pair is reverse-geocoded, on demand.
- No new query parameter and no changes to `lib/schemas/search-params.ts` —
  this feature only ever produces a `/jobs?city=<one matched city>` URL using
  the existing single-city facet, or (on no match) links to plain `/jobs`.
- No province-level partial fallback. If we can't match an exact known city,
  we show the same "browse everything" fallback rather than trying to guess
  a province-wide result — see "Error handling" below.
- No rate-limiting/caching layer in front of the geocoding provider. Traffic
  here is one real user click per lookup, not bulk automated calls.
- No diacritic-folding in the city-name match beyond what `provinceCodeFromName`
  already does for province names. The existing `/jobs` city filter itself
  doesn't fold accents in city names either (`.in('city', params.city)` is a
  plain equality match) — this feature stays consistent with that rather than
  fixing a broader pre-existing gap as a side effect.

## Architecture & data flow

1. **`components/NearMeButton.tsx`** (new Client Component) — a small
   location-pin icon button with a "Near me" label, sized to sit next to the
   existing city `<select>` in both forms. This is the one place in the
   codebase that needs client JS for this feature; every other form here is
   a deliberately script-free GET form (see the doc comment atop
   `SearchForm.tsx`) — geolocation has no non-JS equivalent, so this is a
   scoped, intentional exception rather than a pattern to spread further.
2. On click, it calls `navigator.geolocation.getCurrentPosition(...)`.
   - If `navigator.geolocation` doesn't exist, skip straight to the fallback
     state (see below) without attempting a permission prompt.
3. On success (`{ latitude, longitude }`), it calls a new Server Action,
   **`resolveNearestCity(lat, lng)`** in `app/actions/near-me.ts` — following
   the same Server Action pattern already used by `app/actions/job-alerts.ts`
   and `app/actions/alert-links.ts`, rather than introducing a new
   `route.ts` API-handler convention this codebase doesn't otherwise use.
4. `resolveNearestCity`:
   a. Reverse-geocodes the coordinates via **OpenStreetMap Nominatim**
      (`https://nominatim.openstreetmap.org/reverse`), called server-side
      only (never from the browser) with a proper `User-Agent` identifying
      the site and a contact method, per Nominatim's usage policy. Requests
      `zoom=10` (city-level granularity, not the default street-address
      level) and `addressdetails=1`. Lives in a new **`lib/geo/nominatim.ts`**.
   b. Parses the response's locality name, trying address fields in order:
      `city ?? town ?? village ?? municipality`. Normalizes the province via
      the existing `provinceCodeFromName` (`lib/provinces.ts`), which already
      handles the accented "Québec" case.
   c. Queries `jobs` for an active row matching that province exactly and
      that city case-insensitively (`ilike`), reusing the existing
      `(is_active, city)` index. The match returns the **DB's own stored
      `city` value** (not Nominatim's casing/spelling) — this matters
      because `/jobs?city=` is a case-sensitive exact match against stored
      values (`parseSearchParams` → `.in('city', params.city)`), so the
      redirect must carry the exact string already in the database. Matching
      logic lives in a new pure, unit-testable **`lib/geo/match-city.ts`**
      (input: geocoded city name + province code + the query function;
      output: matched city string or `null` — kept free of React/Next so
      it's testable in isolation).
   d. Returns `{ city: string }` on a match, `null` otherwise (no match, no
      address components resolved, or the Nominatim call failed/timed out —
      all caught and folded into `null` rather than thrown, since the client
      only ever needs to distinguish "matched" from "didn't").
5. **Raw coordinates are never persisted anywhere** — they pass from the
   browser to the server action to Nominatim and are discarded once resolved
   to a city name. No logging of exact coordinates.
6. On a match, the client does a full navigation
   (`window.location.href = '/jobs?city=' + encodeURIComponent(city)`) —
   consistent with how every other filter on the site already works (plain
   query-string navigation, no client-side result state).

## Client UX & error handling

- **Idle**: location-pin icon + "Near me" text button.
- **Resolving**: button shows a disabled/loading state while
  `getCurrentPosition` and the server round-trip are in flight (typically
  1–3s).
- **Every failure path converges on one fallback state** — no branching
  copy for permission-denied vs. unsupported vs. no-match vs. service error,
  since none of those distinctions are actionable for the visitor:
  - No `navigator.geolocation` in this browser.
  - Permission denied, timed out, or position unavailable
    (`GeolocationPositionError` codes 1/2/3).
  - The Nominatim call fails, times out, or returns nothing usable.
  - Coordinates resolve, but no active job city matches.
  - Fallback UI: an inline message next to the button — *"Couldn't find
    jobs near you — browse all listings"* — linking to unfiltered `/jobs`.
    Mirrors the existing empty-state pattern on `/jobs` itself ("Nothing
    open for that right now" in `app/jobs/page.tsx`).
- No modal. The message renders inline and clears on the next click.

## Placement

- `app/page.tsx` — inside the hero search form, next to the
  `ProvinceCitySelect` city dropdown.
- `components/SearchForm.tsx` — inside the `/jobs` search bar, next to its
  `ProvinceCitySelect` city dropdown.
- Both forms already lay out their controls with flex-wrap and the shared
  `FIELD`/`PILL_*` style tokens (`lib/ui/styles.ts`) — `NearMeButton` reuses
  those rather than introducing new visual language.

## Testing

- Unit tests (`tests/lib/`, matching the existing convention e.g.
  `tests/lib/search-params.test.ts`):
  - `lib/geo/match-city.ts` — exact match, case-insensitivity, no match,
    same city name present in two different provinces.
  - `lib/geo/nominatim.ts`'s response parsing — mocked fetch, covering the
    `city`/`town`/`village`/`municipality` fallback chain and a
    failed/timeout response.
- **Explicitly out of scope**: no browser-automation test for the actual
  geolocation permission flow — heavy to simulate reliably and this
  codebase has no existing Playwright suite to extend for it. Verified
  manually in a real browser instead (this project's established practice:
  type-checking and a clean build have previously not caught rendering
  issues — see the job-alerts-grid mobile-overflow fix earlier this week).
- Before writing code: check `node_modules/next/dist/docs/` for anything
  relevant to Server Actions in this project's Next.js build (16.3.4), per
  `AGENTS.md` — this is not stock Next.js and training-data assumptions
  about Server Action behavior may not hold.
