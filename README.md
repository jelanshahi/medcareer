# MedCareer

A job search site for healthcare work in Ontario. Every listing links directly to the
employer's own application page — MedCareer never takes applications itself, and there is
no account or login wall anywhere in the product.

Phase 1 ingests three hospital Workday tenants: Scarborough Health Network, CHEO, and
Oak Valley Health.

## Stack

Next.js 16 (App Router, server components) · React 19 · Tailwind v4 · Supabase (Postgres
with RLS) · Vitest · TypeScript strict.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill it in
npm run dev
```

`.env.local`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public base URL. Also forms the crawler's contact URL. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. Subject to RLS; safe in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Workers only.** Bypasses RLS. Never in `app/`, never in a `NEXT_PUBLIC_*` var. |
| `CONTACT_EMAIL` | Reachable contact advertised in the crawler's User-Agent. |

`tests/db/key-isolation.test.ts` fails the build if the service-role key ever leaks into
`app/`.

## The ingestion pipeline

Run in this order — it is order-dependent, and the scheduled workflow enforces that with
a concurrency group:

```bash
npm run ingest   # fetch postings from employer ATS feeds -> raw_postings
npm run dedupe   # project raw_postings -> the canonical jobs table
npm run expire   # deactivate stale and past-expiry jobs
npm run purge    # delete delisted jobs past the retention window
npm run notify-google  # optional: tell Google's Indexing API about opened/closed jobs
```

Each stage loads `.env.local`:

```bash
set -a && . ./.env.local && set +a && npm run ingest
```

`.github/workflows/ingest.yml` runs all five every six hours.

`dedupe` also cleans city values that are not places ("TBD", a sentence listing towns):
it salvages the leading place name, or falls back to the employer's `default_city`
(`lib/normalize/city.ts`). `raw_postings` keeps the original.

### How the pipeline treats duplicates

`fingerprint` (title + employer + city + province) identifies the *same posting across
different sources*. It deliberately does **not** identify a job on its own: a hospital can
have several concurrent openings for one role, and collapsing those would hide real
vacancies. Identity is `dedupe_key` = `fingerprint:requisition_id`. Rows only merge when a
fingerprint group spans more than one source.

### Google Indexing API

`npm run notify-google` sends `URL_UPDATED` for jobs created since its last successful run
and `URL_DELETED` for jobs deactivated since then, at most `INDEXING_MAX_PER_RUN` (default
45) per run to stay inside Google's default 200-a-day quota. It is off until the
`GOOGLE_INDEXING_CREDENTIALS` secret is set. To turn it on:

1. In Google Cloud, create a project, enable the **Web Search Indexing API**, and create a
   service account with a JSON key.
2. In Search Console, open the `https://www.medcareer.ca/` property → Settings → Users and
   permissions, and add the service account's email as an **Owner**.
3. Add the key file's contents (or its base64) as the repository secret
   `GOOGLE_INDEXING_CREDENTIALS`.

Runs are recorded in `ingest_runs` under `source_id = 'google-indexing'`.

## SEO landing pages

| Route | What it is | Indexed when |
| --- | --- | --- |
| `/province/[province]`, `/province/[province]/[discipline]` | Province hubs | ≥ 3 jobs |
| `/roles`, `/roles/[role]`, `/roles/[role]/[province]` | Job-title pages (`lib/taxonomy/roles.ts`) | ≥ 3 jobs |
| `/employers`, `/employers/[employer]` | Employer pages | ≥ 3 jobs |
| `/salary`, `/salary/[role]` | Pay guides from posted bands (`lib/jobs/pay.ts`) | ≥ 5 postings with pay |
| `/browse/[city]`, `/browse/[city]/[discipline]` | City pages | ≥ 3 jobs and a real city name |

Pages under the threshold still render but are `noindex` and left out of the sitemap.
Category slugs in URLs use hyphens (`allied-health`); the old underscore URLs redirect
permanently.

## Crawling conduct

Every outbound request identifies itself as `MedCareerBot/0.1` with a reachable contact
URL and email, is rate-limited to one request per second per host, and uses exponential
backoff on 429 and 5xx. Requests go only to URLs built from the `employers` registry, over
https. Nothing logs in or submits anything. Employers can email the contact address to be
removed, no justification needed — see `/about`.

## Tests

```bash
set -a && . ./.env.local && set +a && npx vitest run
```

The RLS suite runs against the live database and skips without credentials, so load the
env or it will quietly test less than you think.
