# Cut Fluid CPU on the /browse landing pages

## Problem

On the Hobby plan the project used up its Fluid Active CPU allowance 2–3 days after each deploy, and Vercel then
paused it (`live: false` on 22 Oct 2026). Observability → Functions showed where the CPU went:

| Route | Invocations | Active CPU |
|---|---|---|
| `/browse/[city]` | 39K | 1h |
| `/browse/[city]/[discipline]` | 12K | 25m |
| every other route | < 3K each | ~1m or less |

The data from Supabase on 22 Oct 2026: 7,881 active jobs, 476 cities, 1,680 city×category pairs.

Causes, all in code:

1. Every /browse page is `force-dynamic`, so each crawler hit is a full server render. The sitemap and the
   "Other cities" aside put ~2,100 of these URLs in front of crawlers.
2. `loadLandingRows()` (lib/jobs/landing.ts) pages through all active jobs: 8 PostgREST round trips, then
   JSON-parses and counts the rows in JS. It has no memo, so `generateMetadata` and the page body each run it,
   which makes 16 round trips per request before the page's own two city queries.
3. The force-dynamic exists only because of the per-request nonce CSP in proxy.ts. A cached page would carry a
   stale nonce, so the CSP would block its scripts.
4. Junk slugs (`/browse/anything`) pay the full cost before they 404.

## Decisions

- **Make /browse ISR, not dynamic.** `revalidate = 3600`, and `generateStaticParams` returns `[]` so city
  and pair pages are generated on first request and then served from the CDN. They are not prerendered at
  build time, because cities come and go with each ingest and a build-time list would go stale. Ingest runs
  every 6h, so data up to an hour old is fine (the sitemap already uses 3600).
- **/browse gets a static CSP instead of the nonce one.** The /browse paths are excluded from the proxy matcher
  (the proxy's other two jobs, the legacy category redirect and the job 410, only concern `/jobs`), and the CSP
  is set in `next.config.ts` `headers()` for `/browse` and `/browse/:path*`, with
  `script-src 'self' 'unsafe-inline'`. Accepted tradeoff: /browse renders no raw HTML (no
  `dangerouslySetInnerHTML`, no JsonLd). Every feed string goes through React escaping, so `'unsafe-inline'`
  there has no injection point to amplify. `/jobs/[slug]`, which does render employer HTML, keeps the nonce CSP.
  Experimental SRI was rejected: App Router's inline flight scripts still need `'unsafe-inline'` or a nonce.
- **Cache the landing rows in the shared data cache.** Wrap the read in `unstable_cache` (revalidate 3600). It
  is still supported without `cacheComponents`, which this app does not enable, and turning that on site-wide is
  out of scope. React `cache()` on top dedupes metadata and page within one render. The value is about
  7.9K × 3 short strings ≈ 350KB, under the 2MB entry limit. No DB migration.
- **Out of scope:** the other force-dynamic routes (each under 3K invocations), the catalog memo, the sitemap,
  and robots.

## Steps

1. `lib/jobs/landing.ts`: `loadLandingRows = cache(() => unstable_cache(read, ['landing-rows'], { revalidate: 3600 })())`.
2. `app/browse/page.tsx`, `app/browse/[city]/page.tsx`, `app/browse/[city]/[discipline]/page.tsx`: replace
   `force-dynamic` with `revalidate = 3600`. Add `generateStaticParams() { return []; }` on the two dynamic routes.
3. `proxy.ts`: exclude `browse` from the matcher. `next.config.ts`: static CSP header for the /browse paths.
4. Verify:
   - `tsc`, `eslint`, and `vitest` pass.
   - `next build` lists the /browse routes as ISR, not `ƒ`.
   - Under `next start`, a second hit returns `x-nextjs-cache: HIT`, and the CSP header has no nonce.
   - In a real browser, /browse/[city] hydrates (client components work) with no CSP violations in the console.
   - /jobs/[slug] still has its nonce CSP, and junk slugs return 404.
5. Commit, then push to `master` to deploy. The project is paused, so the deploy may not go live until it is
   unpaused. That step is the owner's, in the Vercel dashboard.
