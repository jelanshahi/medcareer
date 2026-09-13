# Saved jobs (replaces "Browse by city" in primary nav)

## Goal

Give visitors a way to bookmark listings and come back to them, without adding
accounts or a backend. Replace the "Browse by city" entry point in the header
and footer nav with "Saved jobs" — the header nav slot has carried a comment
since the v2 design rollout (`components/Header.tsx`) noting this exact spot
was left as a deliberate stub for a save feature that didn't exist yet.

## Non-goals

- No accounts, no login, no cross-device sync. Saved jobs live in the
  visitor's browser only (`localStorage`), matching this site's existing
  "0 accounts required" positioning (see the homepage stats band).
- No deletion of the `/browse` route tree (`/browse`, `/browse/[city]`,
  `/browse/[city]/[discipline]`). Those are a working SEO landing-page system
  with content that may already be indexed. This project only removes their
  entry points from the primary header and footer nav — the routes, their
  internal cross-links, and their supporting `lib/jobs/landing.ts` /
  `lib/jobs/city-slug.ts` code are untouched and keep working for anyone who
  lands on them directly or via search.
- No save button on the homepage "Posted today" cards or on the `/browse`
  landing pages. Scoped to the two primary job-discovery surfaces: the
  `/jobs` search results list and the job detail page.

## Data model

`lib/saved-jobs.ts` — plain functions, no React dependency, so they're usable
from any client component and unit-testable in isolation:

- `getSavedSlugs(): string[]` — reads and parses the localStorage key,
  returns `[]` on any read/parse failure (private browsing, corrupted value,
  SSR call) rather than throwing.
- `isJobSaved(slug: string): boolean`
- `toggleSavedJob(slug: string): string[]` — flips membership, writes back to
  localStorage, returns the new list.
- Storage key: `carepotal:saved-jobs`, value is a JSON array of job slugs
  (slugs are already the stable per-job identifier used throughout the app,
  e.g. `/jobs/[slug]`).
- On every write, dispatch a `window` `CustomEvent('saved-jobs-changed')` so
  every mounted `SaveButton` and the `/saved` page can react immediately.
  (The native `storage` event only fires in *other* tabs, not the tab that
  made the change, so it isn't sufficient on its own.)

## `SaveButton` component

New `components/SaveButton.tsx`, client component, props `{ slug: string }`.

- Bookmark-icon toggle (filled when saved, outline when not), no text label —
  sized as a small icon button so it can sit in a card corner without
  competing with the card's own content.
- Hydration safety: state initializes to `false` (unsaved) on first render so
  server and client markup match, then corrects itself from
  `getSavedSlugs()` inside a `useEffect` after mount. A one-frame flash from
  unsaved to saved on a page load where the job is already saved is an
  acceptable trade-off for avoiding a hydration mismatch.
- Listens for `saved-jobs-changed` while mounted so it stays correct if the
  same job is toggled from elsewhere on the page (e.g. unsaved from the
  `/saved` list while a second instance of the same card is visible).
- Click handler calls `toggleSavedJob(slug)`, updates local state, and
  (critically, since it will sit inside or beside a `<Link>`) calls
  `preventDefault`/`stopPropagation` so clicking it never triggers card
  navigation.

## Placement

- `components/JobCard.tsx` — the `<li>` becomes `relative`; `SaveButton` is
  added as an absolutely-positioned sibling of the existing `<Link>` (not
  nested inside it — a `<button>` inside an `<a>` is invalid HTML and would
  make the whole card's click target ambiguous). This is the only place
  `JobCard` is used (`app/jobs/page.tsx`), so this alone covers the main
  search/results list.
- `app/jobs/[slug]/page.tsx` — `SaveButton` added near the job title in the
  main article column. No nesting concern here since the detail page isn't
  itself a giant anchor.

## `/saved` page

New `app/saved/page.tsx`, a client component (`'use client'`) — it must run
in the browser to read `localStorage`, so it can't be the usual server
component pattern the rest of this app uses.

- On mount: read `getSavedSlugs()`. If empty, render an empty state ("You
  haven't saved any jobs yet" + a link to `/jobs`) and stop.
- Otherwise, query Supabase directly from the client for
  `.in('slug', slugs).eq('is_active', true)` with the same column set
  `JobCard` needs, then render the results through the existing `JobCard`
  (which already carries its own `SaveButton`, so unsaving from this page
  works the same way as unsaving from search results — no separate remove
  control needed).
- A saved slug whose job has gone inactive or been removed simply doesn't
  appear in the results; its stale slug is left in localStorage rather than
  silently pruned (keeps this page read-only/simple — pruning is not needed
  for correctness, since `.in()` + `.eq('is_active', true)` already filters
  it out of view every time).
- Needs a new `lib/db/browser.ts` exporting `createBrowserClient()` —
  functionally identical to the existing `lib/db/server.ts` anon-client
  factory (same public `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars, safe to ship to the browser), but
  named for where it's actually called from, matching this project's
  existing pattern of one small file per client type (`admin.ts` vs.
  `server.ts`).

## Nav changes

- `components/Header.tsx`: replace the `Browse by city → /browse` link with
  `Saved jobs → /saved`, same position in the nav. Delete the now-resolved
  code comment above the component that flagged this slot as a deferred
  save-feature stub.
- `components/Footer.tsx`: same swap, and update its comment (currently
  documents why "Browse by city" is a real destination) to describe the new
  link instead.
- No changes to `/browse`'s own pages — they keep linking to each other and
  remain reachable by direct URL / search engines, just not from primary
  nav.

## Testing

- Unit tests for `lib/saved-jobs.ts` (get/toggle/isSaved, empty/corrupt
  storage fallback) — this project already has a unit test suite
  (`app/browse` logic modules were built TDD-first per recent commits), so
  this follows the same convention.
- Manual verification in a real browser (per this project's established
  practice — type-checking and build passing has previously not caught
  rendering issues): save a job from `/jobs`, confirm it appears on
  `/saved`, unsave it from `/saved`, confirm the search-results button
  reflects the change, confirm `/browse` and its sub-pages still render with
  no header/footer entry point.
