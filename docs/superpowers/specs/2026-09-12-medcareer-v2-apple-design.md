# MedCareer v2 — "Apple style" redesign

**Date:** 2026-09-12
**Source of truth:** `MedCareer v2 - Apple style.dc.html` in Claude Design project
`7c419ff5-cc82-4e3b-96cb-1956a171c28b`. A local copy of the canvas is in the session
scratchpad; re-fetch with `DesignSync get_file` if it is gone.
**Supersedes:** the visual layer of `.superpowers/sdd/task-15-brief.md` (the v1 editorial
design). Task 15's *data* rulings still stand and are restated in §8.

The canvas is a design canvas, not production code. `{{ bindings }}`, `<sc-if>`,
`<sc-for>`, `<x-dc>`, `<helmet>` and `onClick="{{ goX }}"` are canvas constructs. None of
them ship.

---

## 1. Owner decisions

Settled in conversation on 2026-09-12. Do not revisit without asking.

| # | Decision |
|---|---|
| 1 | **Scope: re-skin + landing pages.** Apply the v2 visual system to the four existing routes and add the landing pages. Closing-soon and email alerts are out. |
| 2 | **Maximum fidelity.** Follow the canvas literally everywhere the data allows. Where a feature is cut, **leave the gap** — do not invent a replacement section to fill the hole. |
| 3 | **Hero copy keeps the CANADA line.** `Healthcare jobs across CANADA. One click to apply.` stays verbatim as the aspirational brand line, carried into v2's centred hero. The Ontario qualifier stays visible in the same viewport. |
| 4 | **Primary action colour is brand green** `#0F5C4A`, hover `#0B4437`. This is also what the canvas renders by default — the header pill, hero pill and Search button are all green in the canvas. Apple blue `#0066cc` is the inline-link colour only. |
| 5 | **Typeface is a Helvetica/Arial stack**, no webfont. Rationale in §2. |

### Correction on record

An earlier reading of this spec's source claimed the canvas was internally inconsistent,
mixing green and Apple blue for primary buttons. That was overstated: the blues in the
file are mostly `style-hover` values plus a few buttons on the search and job screens. The
canvas's default rendered state is green-primary.

---

## 2. Foundations

### 2.1 Typeface

```css
--font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif;
```

The canvas specifies `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
"Helvetica Neue", Helvetica, sans-serif`. On Windows none of the first four faces resolve
and Helvetica maps to Arial, so **the preview the owner reviewed and approved was rendered
in Arial**, not SF and not Segoe UI. Matching the approved preview is the priority, so the
stack leads with Helvetica/Arial.

Consequences:

- `next/font/google` is removed entirely. `Barlow_Condensed` and `Source_Sans_3` go, along
  with the `--font-display` token and **every `font-display` utility class in the
  codebase**. There is now one face at several weights, not a display/body pair.
- No font files are served, so the `font-src 'self'` directive in `proxy.ts` is satisfied
  trivially. Do not add a `<link>` to Google Fonts — it would violate the CSP.

### 2.2 Tokens

Replace the v1 palette in `app/globals.css` wholesale. Every value below is lifted from
the canvas except `--color-signal*`, which is decision 1.4.

| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#f5f5f7` | page ground |
| `--color-surface` | `#ffffff` | cards, lists, bars, hero |
| `--color-surface-hover` | `#fbfbfd` | card and row hover |
| `--color-ink` | `#1d1d1f` | primary text; dark stats panel ground |
| `--color-slate` | `#6e6e73` | secondary text |
| `--color-meta` | `#86868b` | counts, tertiary text |
| `--color-rule` | `#d2d2d7` | hairline borders, input borders |
| `--color-divider` | `#ececf0` | dividers inside white lists |
| `--color-chip` | `#e8e8ed` | filter chips, `<code>` background |
| `--color-chip-hover` | `#dcdce1` | chip hover |
| `--color-signal` | `#0F5C4A` | every primary CTA |
| `--color-signal-hover` | `#0B4437` | primary CTA hover |
| `--color-link` | `#0066cc` | inline links |
| `--color-dark-muted` | `#a1a1a6` | labels on the dark panel |
| `--color-header-bg` | `rgba(251,251,253,.82)` | translucent sticky header |
| `--color-header-rule` | `rgba(0,0,0,.08)` | header base border |

Geometry and type scale:

- Radii: `18px` cards, `14px` small tiles, `12px` inputs and selects, `980px` pills.
- Container: `max-width: 1024px; padding: 0 22px`. This narrows from v1's `1180px`.
- Base type: `17px / 1.47`, `letter-spacing: -0.01em`, antialiased.
- Headings: weight `600`, `clamp()` scale straight from the canvas, tracking `-0.02em` to
  `-0.025em` as the canvas specifies per level.
- Focus ring: `3px solid rgba(15,92,74,.5)`, `outline-offset: 2px` — retuned from the
  canvas's blue to the green accent.
- Keep the existing `prefers-reduced-motion` block.

### 2.3 Shell

**Header** (`components/Header.tsx`) inverts from dark to the canvas's translucent light
bar: `position: sticky; top: 0`, `--color-header-bg` with
`backdrop-filter: saturate(180%) blur(20px)` (Tailwind emits the `-webkit-` prefix too),
1px `--color-header-rule` base, `min-height: 48px`, 1024px container.

Wordmark `MedCareer` left at `19px/600`, tracking `-0.02em`. Nav right at `13px`, gap
`26px`, in canvas order: **Search** → `/jobs`, **Browse by city** → `/browse`, **About** →
`/about`.

Two forced changes, both from §8:

- The canvas's 4th item is a green **`Get job alerts`** pill. There is no alerts backend,
  so per decision 1.2 the slot is **left empty**. The header ships with no filled button.
- The canvas's 2nd item is labelled **`Save jobs`** but its handler is `goLanding` — it
  opens the *Nursing jobs in Toronto* landing page, not a saved-jobs feature. There is no
  save feature to build. The slot keeps its position and destination; the label becomes
  **Browse by city**, which is what it actually does.

**Footer** (`components/Footer.tsx`) flips from dark to the canvas's light treatment:
`--color-canvas` ground, 1px `--color-rule` top border, 1024px container, `13px`
`--color-slate`. Link row — Search jobs, Browse by city, About, Employer removal requests
— then a ruled legal line. All four destinations are real: `/jobs`, `/browse`, `/about`,
`/about#employer-removal`.

**`app/layout.tsx`** drops both font imports and their `variable` wiring; `<body>` takes
`--color-canvas` and `--color-ink`.

---

## 3. `/` home

Canvas `isHome`. Sections in order:

1. **Hero** — full-bleed `--color-surface`, centred, `max-width: 820px`,
   `padding: clamp(56px,9vw,96px) 22px clamp(40px,6vw,64px)`.
   - Eyebrow `19px --color-slate`. Text: `Ontario · updated every 6 hours`. The canvas's
     eyebrow is `Ontario healthcare`; because decision 1.3 keeps a headline that says
     CANADA, the eyebrow carries the geographic qualifier so the scope is honest in the
     same viewport.
   - `h1` `clamp(38px,6.4vw,64px)/1.06`, weight 600, tracking `-0.025em`, `text-wrap:
     balance`: **Healthcare jobs across CANADA.** / **One click to apply.**
   - Subhead — canvas copy verbatim: *"Pulled straight from hospital career systems. Every
     listing applies on the employer's own page — no account, no résumé upload."*
   - Green pill **`Browse {total} open jobs`** → `/jobs`, using the live active count.
   - The canvas's secondary link `Set up job alerts ›` is **cut** (§8), leaving the pill
     alone on its row.
   - **Search capsule** — `--color-canvas` well, radius 18, padding 10, holding a
     full-width white keyword input (radius 12), a city `<select>` and a green Search
     button. A real `method="get" action="/jobs"` form.
   - **`Popular:`** row of white outline pills, derived from live data as today.
2. **Posted today** — heading `clamp(26px,3.6vw,36px)/600` with `See all {total} jobs ›`
   on the right; 4-up `repeat(auto-fit, minmax(250px,1fr))` grid of white radius-18 cards.
   Each card: category label `12px/600` uppercase tracked, title `21px/600`,
   `employer · city` `15px`, salary pinned to the bottom via `margin-top:auto`.
   Keep the existing honest fallback: 0 jobs are posted today right now, so the page shows
   the most recent postings plus the line saying so, rather than an empty panel.
3. **Stats panel** — `--color-ink` ground, radius 18, `clamp(28px,4vw,44px)` padding,
   `repeat(auto-fit, minmax(160px,1fr))`. Values `clamp(34px,4.6vw,46px)/600`, labels
   `15px --color-dark-muted`. All four figures derive from live data; none are hardcoded
   except the refresh cadence, which is a real operational constant.
4. **Browse by discipline** — white radius-14 tiles, `minmax(200px,1fr)`, label
   `17px/500` left, count `15px --color-meta` right. Only categories with ≥1 active job.

The canvas's **Closing this week** section (between 3 and 4) and its **email-alert**
section (after 4) are both cut per §8. Per decision 1.2 nothing replaces them, so the page
ends on the discipline tiles.

---

## 4. `/jobs` search

Canvas `isSearch`.

**Top bar** — white, 1px `--color-rule` bottom border, 1024px container, `16px 22px`.
Three controls in a GET form: keyword input with the `⌕` affordance, **city select**, and
**sort select**. All radius 12, `min-height: 46px`.

City moves up from the v1 sidebar into this bar to match the canvas. The select is
single-value, but `city[]` stays multi-value in `SearchParams` so existing multi-city links
and chips keep working — the select simply sets one value.

Sort options are `Newest first` and `Highest pay`. The canvas's third option,
`Closing soonest`, is cut (§8).

**Sidebar** `aside` — white radius-18 card, sticky at `top: 64px` on wide screens.
Header row: `Filters` `17px/600` and a `Clear all` link to `/jobs`. Facet groups, each
separated by a 1px `--color-rule` top border: group label `13px/600` uppercase tracked,
then rows of `20px` checkboxes with `accent-color: var(--color-signal)`, label, and a
`14px --color-meta` count.

Groups are the canvas's set: **Discipline**, **Employment type**, **Employer**.
`Employer` is new — 3 employers, 100% coverage — and needs a new `employer` search param
(§6.2). Counts stay live and cross-filtered, as they are today.

Two server-side accommodations:

- The canvas filters on client state with no submit control. A no-JS GET form cannot, so
  the sidebar keeps an **`Apply filters`** button, styled as a green pill.
- The canvas's mobile filter toggle (`isNarrow` / `filtersOpen` / `Show (n)`) becomes a
  `<details>` disclosure below the `md` breakpoint — same behaviour and appearance, no
  JavaScript.

The canvas's **`Get these by email`** card below the facets is cut (§8); nothing replaces
it.

**Results** — heading `clamp(26px,3.4vw,34px)/600` with `{n} jobs · {city}` on the right;
active-filter chips as `--color-chip` pills with a `×`; then one white radius-18 `<ul>`
whose rows are divided by 1px `--color-divider`. Each row: title `21px/600`, employer
line `16px`, place `16px --color-slate`, meta line `15px --color-slate`; category label
right-aligned at `14px --color-meta`. The canvas's per-row closes-badge is cut (§8).

**Pagination** — white outline pills `Previous` / `Next` flanking `Page x of y`.

**Empty state** — white radius-18 card, centred, `48px 28px`: headline `26px/600`, advice
`17px --color-slate`, green pill `Show all Ontario jobs`.

---

## 5. `/jobs/[slug]` detail

Canvas `isJob`.

**Breadcrumb bar** — white, bottom rule, `14px --color-slate`: `All jobs › {category} ›
{title}`, the last crumb in `--color-ink`. Category crumb links to the filtered `/jobs`.

**Article** (`flex: 3 1 400px`) — `h1` `clamp(30px,4.6vw,46px)/1.08`, tracking `-0.025em`,
balanced; employer line `19px --color-ink`; place `19px --color-slate`.

**Facts card** — white radius-18, `repeat(auto-fit, minmax(140px,1fr))`. Labels `13px
--color-slate`, values `17px/500`. Pay band, Employment, Location, Posted — each omitted
when its datum is absent.

**Description** — `17px/1.6`. The canvas splits this into `intro`, `duties` and `quals`;
we store one sanitized HTML blob in `jobs.description` (§8). Render the blob with the
canvas's typographic treatment: `h3` at `24px/600` tracked `-0.02em` with `28px` top
margin, `ul` at `padding-left: 22px`, `li` margin-bottom `7px`, `p` margin-bottom `16px`.
`dangerouslySetInnerHTML` remains acceptable *only* because of the ingest-time allow-list
sanitization (`p, br, ul, ol, li, strong, em, h3, h4`, no attributes).

**Attribution line** — ruled top border, `15px --color-slate`, canvas copy.

**Aside** (`flex: 1 1 270px`, `max-width: 340px`, sticky `top: 64px`) — two white radius-18
cards:
1. Salary `clamp(24px,3.4vw,30px)/600` with `overflow-wrap: anywhere`; `{employment} ·
   {posted}` at `15px --color-slate`; a full-width green pill **`Apply on {employer}`**
   carrying `target="_blank" rel="noopener noreferrer nofollow"`; then
   `Opens {host} in a new tab` at `13px --color-meta`, centred.
2. **Similar openings** — `17px/600` heading, then rows of title `16px/500` over
   `employer · city` `14px --color-slate`.

The canvas's `Closes {x} · apply soon` badge above the `h1` is cut (§8).

`JobPosting` JSON-LD stays, still carrying the CSP nonce from `headers()`.

---

## 6. New: landing pages

> **§6.3 is pending.** The owner is supplying a screenshot of the canvas's `isLanding`
> view; present mode would not accept clicks or scroll past the hero, so this section is
> written from the canvas source (lines 330–385) and **must be reconciled against that
> screenshot before implementation begins**. §6.1 and §6.2 are settled.

### 6.1 Routes

| Route | Page |
|---|---|
| `/browse` | Hub: every city and every discipline with live counts |
| `/browse/[city]` | `Healthcare jobs in {City}` |
| `/browse/[city]/[discipline]` | `{Discipline} jobs in {City}` |

The canvas has no URLs, so these are invented. They sit outside `/jobs/` for two hard
reasons, both verified in this codebase:

1. `proxy.ts:57` runs a Supabase slug-existence check on **every** `/jobs/*` path and
   returns 410 when it finds no row. Landing pages under `/jobs/` would be killed by it.
2. Next.js rejects a second dynamic segment name beside the existing `[slug]` at that
   level, so `/jobs/[city]/...` cannot coexist with `/jobs/[slug]`.

All three are `export const dynamic = 'force-dynamic'`. This is not optional: a statically
prerendered route bakes its bootstrap `<script>` tags at build time, before any
per-request nonce exists, and the nonce-based CSP then blocks them so the page never
hydrates. Same reasoning already documented in `app/about/page.tsx`.

`params` is a `Promise` in Next 16 — use the typed
`PageProps<'/browse/[city]/[discipline]'>` form the job page already uses.

Resolution and 404 rules:

- City slugs come from a shared `slugify` helper applied to live `distinct city` values,
  resolved case-insensitively back to the stored city name.
- Discipline slugs are the existing `Category` keys.
- An unrecognised city, an unrecognised discipline, or a valid pair with **zero** active
  jobs all `notFound()`. No empty landing pages.

Current data yields 3 cities and 6 disciplines each — 18 pairs. Some are thin (Toronto
physicians = 2, Markham allied health = 1). Every pair with ≥1 active job renders, so no
link can go stale mid-refresh, but only pairs with **≥3** active jobs are *linked* from
the hub and from the landing asides. That keeps internal linking useful without parading
one-job pages.

### 6.2 `employer` search param

Adding the canvas's Employer facet (§4) needs a new field in `lib/schemas/search-params.ts`
and `lib/jobs/query-string.ts`. Employer names are free-text data, not an enum, so they are
validated like `city`: trimmed, `1..80` chars, deduped, capped at `MAX_FACET_VALUES`.
`buildJobsQuery` gains matching `employer` handling so chips, facets and pagination all
round-trip.

### 6.3 Landing page content — PENDING SCREENSHOT

From the canvas source, the view is:

- **Hero** — white, centred, `max-width: 800px`. Eyebrow `19px --color-slate`:
  `Ontario · Toronto · Nursing`. `h1` `clamp(34px,5.6vw,56px)/1.06`: `Nursing jobs in
  Toronto`. Subhead `clamp(18px,2.2vw,21px) --color-slate`, discipline-specific.
- **Main** (`flex: 3 1 400px`) — `Open nursing roles` heading
  `clamp(24px,3.2vw,30px)/600`, then a white radius-18 `<ul>` of matching jobs, rows
  divided by `--color-divider`: title `20px/600`, employer line `16px`, meta line `15px`.
- **Prose** — `Nursing in Toronto, in short`, two paragraphs at `17px/1.6`.
- **Aside** (`flex: 1 1 250px`, `max-width: 330px`) — two white radius-18 cards,
  `Nearby cities` and `Other disciplines here`. Each row is a link with a label and a
  right-aligned `--color-meta` count.

Open questions for the reconciliation pass:

1. **The subhead and prose block are hand-written, nursing-and-Toronto specific.** They
   cannot be derived from data for 18 combinations. Proposal: one conservative,
   factually checkable paragraph per discipline (10 of them, written once) plus one
   data-derived paragraph per page covering count, employers, observed pay range and
   refresh cadence. The canvas's own claim that the ONA provincial hospital agreement sets
   Ontario RN pay bands is accurate and worth keeping. **These are content claims
   published under the owner's name and must be read by the owner before release.**
2. **`Nearby cities`** lists Mississauga, Scarborough, Markham, Oshawa and Hamilton with
   counts. We hold only Toronto, Markham and Ottawa, and Ottawa is not near Toronto.
   Proposal: retitle to `Other cities` and list the cities we actually have for that
   discipline, with real counts.
3. Whether the job list paginates or caps with a "see all" link into filtered `/jobs`.

---

## 7. `/about` and `not-found`

`/about` keeps its content and query; restyle only. `max-width: 720px`, `h1`
`clamp(34px,5.4vw,52px)`, lead paragraph `21px/1.42 --color-slate`, section headings
`28px/600`. The employer table becomes a white radius-18 list with `--color-divider`
dividers: name `17px/500` over a `15px --color-slate` note (the employer's cities), count
right-aligned at `15px --color-meta`. `<code>` spans take `--color-chip` at radius 6.
Keep the `#employer-removal` anchor and its `scroll-mt`.

`app/not-found.tsx` is restyled to match and keeps `force-dynamic` for the same nonce
reason.

---

## 8. Not built, and why

| Cut | Reason |
|---|---|
| `Closing this week` home section; per-card and per-detail closes-badges; `Closing soonest` sort | `jobs.closes_at` is **null on all 153 active rows** — Workday supplies none. Verified live 2026-09-12. Showing a job seeker an invented deadline is the worst failure this product could have. |
| Home email-alert section; `Get job alerts` header pill; hero's `Set up job alerts ›` link; `Get these by email` sidebar card | No email backend. Storing addresses is a data-handling decision the owner has not made, and phase 1 has no auth by design. |
| `Save jobs` as a label | No save feature exists; the canvas's own handler opens a landing page. The nav slot survives as `Browse by city`. |
| Separate `intro` / `duties` / `quals` on the job page | We store one sanitized blob, `jobs.description`. Fabricating section splits would misrepresent the employer's posting. |

Per decision 1.2, each cut leaves a gap. Nothing is invented to fill it. The visible
consequence is that the home page ships with four sections instead of six and the header
has no filled button — an expected outcome, not a defect.

---

## 9. Testing

TDD on new pure logic, tests first:

- `slugify` / city resolution round-trips, including case and punctuation variance, and
  rejection of unknown slugs.
- `employer` facet parsing: bounds, dedupe, whitespace, over-length and array-flooding
  input.
- `buildJobsQuery` with `employer`, and round-trip through `parseSearchParams`.
- Landing pair resolution: unknown city, unknown discipline, valid pair with zero active
  jobs — all `notFound()`.

Existing suites must stay green; `lib/format.test.ts` and `search-params.test.ts` will
need updates for the new field and the dropped `closing` sort.

Then, all clean: `npx vitest run` (env loaded), `npx tsc --noEmit`, `npx eslint`,
`npx next build`.

Then against live data:

- `/` renders the hero, real posted-today behaviour, real stat and tile counts.
- `/jobs` — a discipline facet, a city select and an employer facet each narrow the count
  correctly; sort by salary reorders; a chip removes exactly its own filter; the
  `<details>` filter panel works with JavaScript disabled.
- `/jobs/[slug]` renders facts, description, apply button naming the employer, similar
  jobs, and valid JSON-LD.
- `/browse`, `/browse/[city]`, `/browse/[city]/[discipline]` render with real counts;
  unknown slugs 404.
- **Every route's inline `<script>` still carries the CSP nonce.** `curl -i` one page and
  compare the nonce in the body against the CSP header **in the same response** —
  separate requests mint different nonces. A regression here breaks hydration silently.
- Nothing overflows horizontally at 360px.

## 10. Constraints that still bind

- TypeScript strict; no `any` at module boundaries.
- **Check the `error` channel on every Supabase call.** supabase-js resolves
  `{ data, error }`; an unchecked call renders a false "0 jobs". This defect has shipped
  four times in this project.
- `target="_blank" rel="noopener noreferrer nofollow"` on every apply link.
- No auth code. That is what guarantees the no-login-wall property.
- All pages stay server components with no client-side data fetching; `/` and `/jobs` must
  work with JavaScript disabled.
- Accessibility floor: usable at 360px, visible focus rings, WCAG AA contrast, real
  `<label>`s, keyboard navigable, real form controls in a GET form.
