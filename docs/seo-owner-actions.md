# SEO: steps only the owner can do

The code side of ranking for "nurse jobs in Canada" and "PSW jobs in Canada" is done (role and
discipline pages, JSON-LD, sitemap, internal links). Everything below needs the owner's own
accounts and can't be done from the repo. Roughly in order of impact.

## 1. Fix the site URL in Vercel (do this first)

Production has `NEXT_PUBLIC_SITE_URL=http://medcareer.ca`. The site actually answers on
`https://www.medcareer.ca`: `http://medcareer.ca` redirects to `https://medcareer.ca`, which
redirects again to `https://www.medcareer.ca`. Every canonical tag, sitemap URL, `og:url` and
JSON-LD `url` is built from this variable, so all of them pointed at a URL that redirects.

The code now forces `https`, but it can't know whether you want `www`. Pick one:

- **Keep www (simplest):** Vercel → Project → Settings → Environment Variables → set
  `NEXT_PUBLIC_SITE_URL` to `https://www.medcareer.ca` for Production, then redeploy.
- **Or switch to the bare domain:** Vercel → Settings → Domains → make `medcareer.ca` the
  primary and redirect `www` to it, and set `NEXT_PUBLIC_SITE_URL=https://medcareer.ca`.

Check afterwards: `https://www.medcareer.ca/sitemap.xml` should list `https://www.medcareer.ca/...`
URLs, and view-source on any page should show the same host in `<link rel="canonical">`.

## 2. Google Search Console

1. Go to <https://search.google.com/search-console>, add a **Domain** property for
   `medcareer.ca`, and verify it with the DNS TXT record Google gives you (add it at your DNS
   provider, or in Vercel → Domains if Vercel hosts the DNS).
2. **Sitemaps** → submit `https://www.medcareer.ca/sitemap.xml` (use whichever host you chose
   in step 1). Expect "Success" and several thousand discovered URLs.
3. **URL Inspection** → inspect and click **Request indexing** for the priority pages:
   - `/canada/nursing` (nurse jobs in Canada)
   - `/roles/registered-nurse`, `/roles/practical-nurse`, `/roles/nurse-practitioner`
   - `/roles/personal-support-worker` (PSW jobs in Canada)
   - `/roles/personal-support-worker/ontario`, `/roles/registered-nurse/ontario`, and the other
     big provinces
4. After a week or two, check **Pages** (indexing report) for "Duplicate without user-selected
   canonical" or "Page with redirect" — both point back at step 1 — and **Enhancements → Job
   postings** for JobPosting errors.
5. Watch **Performance → Search results**, filtered by query, for "nurse jobs", "psw jobs" etc.

## 3. Google for Jobs validation

Job pages carry `JobPosting` structured data, which is what gets listings into Google's job
search panel.

1. Open the [Rich Results Test](https://search.google.com/test/rich-results) and test 3–4 live
   job URLs (one with posted pay, one without, one hourly, one from a non-Ontario employer).
2. Each should show **Job posting: valid**. Warnings for optional fields (for example
   `baseSalary` on a posting with no pay band) are expected and fine; errors are not.
3. Also test `/roles/personal-support-worker` and `/canada/nursing`: they should show valid
   **Breadcrumb** and **FAQ** items. Google only shows FAQ rich results for a few
   authoritative sites now, so don't expect FAQ snippets in results — the markup is still valid.

## 4. Bing Webmaster Tools

1. Go to <https://www.bing.com/webmasters> and sign in.
2. Choose **Import from Google Search Console** (fastest — copies the verified site and
   sitemap), or add the site and verify via DNS.
3. Confirm the sitemap is listed under **Sitemaps**. Bing also feeds DuckDuckGo and Yahoo.

## 5. Backlinks

Rankings for competitive national queries depend heavily on other sites linking to you. Useful,
legitimate targets for a free, no-account healthcare job board:

- **Nursing and PSW schools and colleges:** career-services and co-op pages often keep "where to
  find jobs" lists. Email the career office with a one-line description and the
  `/canada/nursing` or `/roles/personal-support-worker` link.
- **Professional associations and unions:** provincial nursing associations (RNAO, ARNBC, etc.),
  PSW associations (e.g. Ontario Personal Support Workers Association), and settlement
  agencies helping internationally educated nurses.
- **Newcomer and immigration resources:** organisations that support internationally
  educated nurses and PSWs often list job boards.
- **Employers you list:** some hospitals and health authorities link to aggregators that send
  them applicants; a polite note showing how their postings appear can earn a link.
- **Reddit/forums:** answer genuinely in r/nursing, r/PSW, r/ontario etc. when someone asks
  where to find jobs. Avoid spammy directories and paid link schemes; they can hurt rankings.

Track new links in Search Console → **Links**.
