# Canadian health employers — which job system each one uses

What every province's main health employers post their jobs through, whether we may crawl
them, and what is odd about each system's data. Written so nobody has to redo this research.

Ontario's 134 individual hospitals are in a separate file: [ontario-hospitals-ats.md](./ontario-hospitals-ats.md).

**Last checked: 20 September 2026.** Employers change job systems every few years, so
re-check a row before trusting it.

## Connectors we have built

| Connector | Employers | Source | Requests per run |
|---|---|---|---|
| [workday.ts](../../workers/connectors/workday.ts) | 6 Ontario hospitals: Scarborough, CHEO, Oak Valley, Southlake, St. Joseph's Hamilton, Peterborough | JSON API per tenant | ~1 per posting, every run |
| [taleo.ts](../../workers/connectors/taleo.ts) | Alberta Health Services, Covenant Health (**inactive — blocked, see below**) | HTML search pages + one page per posting | ~110 list pages + new postings |
| [icims.ts](../../workers/connectors/icims.ts) | Vancouver Coastal Health, Humber River, Mackenzie, Cambridge Memorial | Sitemap + one page per posting | 1 sitemap + new postings |
| [jibe.ts](../../workers/connectors/jibe.ts) | Fraser Health | JSON API, whole postings, 100 at a time | ~22, no per-posting fetches |
| [successfactors.ts](../../workers/connectors/successfactors.ts) | Nova Scotia Health, IWK Health, Health Sciences North | Paged search HTML + one page per posting | ~10 search pages + new postings |
| [successfactors-mb.ts](../../workers/connectors/successfactors-mb.ts) | The shared Manitoba site — ~30 employers | Paged search HTML + one page per posting | ~35 search pages + new postings |
| [bchealthjobs.ts](../../workers/connectors/bchealthjobs.ts) | Interior Health, Northern Health | Sitemap + one page per posting | 1 sitemap + new postings |
| [talentpoolbuilder.ts](../../workers/connectors/talentpoolbuilder.ts) | 5 Ontario hospitals: Providence Care, Windsor Regional, Montfort, Georgian Bay, Guelph General | JSON API, whole list in one request | 1 list + new postings |
| [oraclecloud.ts](../../workers/connectors/oraclecloud.ts) | Saskatchewan Health Authority | REST API, 200 requisitions per request | ~11 list requests + new postings |

## Province by province

Status: **live** = on the site; **blocked** = they refuse our crawler; **ruled out** = we have
decided not to use it, whether or not we could; **available** = checked and crawlable, no
connector yet; **unchecked** = system identified, crawl permission not tested.

| Province | Employer | Job system | Status | Notes |
|---|---|---|---|---|
| **ON** | 6 hospitals (above) | Workday | live | |
| **ON** | 5 hospitals on TalentPoolBuilder | NetHire (`*.talentpoolbuilder.com`) | live | Providence Care, Windsor Regional, Montfort, Georgian Bay, Guelph General — 235 open |
| **ON** | Health Sciences North (Sudbury) | SAP SuccessFactors (`careers.hsnsudbury.ca`) | live | Same template as Nova Scotia — no new connector, 81 postings |
| **ON** | Kingston Health Sciences Centre, Hotel Dieu Hospital | SAP SuccessFactors on `career012.successfactors.eu` | **blocked** | SAP’s own hosted domain disallows everything but `/login`. See below |
| **ON** | Humber River, Mackenzie, Cambridge Memorial | iCIMS | live | |
| **ON** | ~14 hospitals incl. Bluewater, Brant, Cornwall, Erie Shores, Hawkesbury | njoyn | unchecked | Biggest Ontario cluster left |
| **ON** | Health Sciences North, Kingston Health Sciences, Hotel Dieu | SAP SuccessFactors | unchecked | Same system as Nova Scotia |
| **ON** | Bruyère, Homewood, Huron Perth | UKG UltiPro | unchecked | Same system as Yukon Hospitals |
| **ON** | Georgian Bay, Guelph General, Montfort, Lake of the Woods | TalentPoolBuilder | unchecked | |
| **ON** | Lakeridge, Niagara Health, Queensway Carleton | eRecruit | unchecked | Separately hosted; likely one connector each |
| **ON** | London Health Sciences, The Ottawa Hospital, SickKids | Oracle PeopleSoft | unchecked | Each self-hosted |
| **ON** | Hamilton Health Sciences | Oracle Taleo | unchecked | Classic Taleo, not the Alberta front end |
| **ON** | ~48 smaller hospitals | None — email or PDF | n/a | Cannot be integrated at all |
| **BC** | Fraser Health | iCIMS via Jibe board | live | |
| **BC** | Vancouver Coastal Health | iCIMS | live | |
| **BC** | Island Health | HRSmart (`islandhealth.hua.hrsmart.com`) | **blocked** | robots.txt allows Googlebot and disallows everyone else. See below |
| **BC** | Interior Health **and** Northern Health | Shared unbranded ASP.NET app (`jobs.interiorhealth.ca`, `expectmore.northernhealth.ca`) | live | One connector covers both — see below |
| **BC** | PHSA (BC Children’s, BC Cancer) | Behind CloudFront (`jobs.phsa.ca`) | **blocked** | 403 to our User-Agent, 200 to a browser. See below |
| **BC** | Providence Health Care | Behind CloudFront (`www.providencehealthcare.org`) | **blocked** | Same 403-to-bots pattern as PHSA. See below |
| **BC** | First Nations Health Authority | None of its own | not viable | Its jobs page links out to member organisations’ own systems (Prevue, ScouteRecruit) — a handful of postings across several |
| **AB** | Alberta Health Services, Covenant Health | Taleo behind SelectMinds | **blocked** | See below. Rows seeded inactive in the database |
| **SK** | Saskatchewan Health Authority | Oracle Cloud Recruiting | live | The whole province: ~2,120 open, ~1,300 within 30 days |
| **MB** | ~30 employers on one shared site | SAP SuccessFactors (`careers.wrha.mb.ca`) | live | Almost the whole province — see below |
| **MB** | Prairie Mountain Health | Own Joomla component (`careers.pmh-mb.ca`) | unchecked | Posts only 1 job to the shared site |
| **MB** | Interlake-Eastern RHA | QSS self-service (`selfservice.ierha.ca`) | unchecked | Posts only 2 jobs to the shared site |
| **MB** | Northern Health Region | Own WordPress listing | unchecked | Posts only 5 jobs to the shared site |
| **NS** | Nova Scotia Health **and** IWK Health | SAP SuccessFactors (`jobs.nshealth.ca`) | live | Both employers on one site — see below |
| **NB** | Horizon and Vitalité | **iTacit** (`horizonnb.itacit.com`, `vitalitenb.itacit.com`) | **blocked** | Not Salesforce — that site is only for internationally educated professionals. See below |
| **NL** | NL Health Services | ServiceNow (`nlhs.service-now.com/nlhsjobs`) | **blocked** | One authority for the whole province. robots.txt is `Disallow: /`. See below |
| **PE** | Health PEI | PeopleSoft Candidate Gateway (`psgateway.gov.pe.ca`) behind Radware | **blocked** | Radware serves a JavaScript challenge to every non-browser client, even a browser User-Agent. See below |
| **QC** | MUHC | WordPress WP Job Manager (`carrieres.cusm.ca`) | available | 86 postings, crawlable. Same setup as the CISSS sites below |
| **QC** | Public network (~34 CISSS/CIUSSS) | **Four platforms, no single site** | available | All crawlable, but fragmented and entirely in French — see below |
| **QC** | Santé Québec central portal | DigitalRecruiters (`emplois.sante.quebec`) | available | Only ~61 postings — a thin layer over the regional sites. `Allow: /`, `Crawl-delay: 10` |
| **QC** | Montréal health network | **Njoyn** (`emplois.santemontreal.qc.ca`, CLID 54327) | **blocked** | Njoyn serves a Radware bot-detection CAPTCHA after a few requests. See below |
| **YT** | Yukon Hospital Corporation | UKG UltiPro (`recruiting.ultipro.ca/YUK5001YUHC`) | **blocked** | robots.txt disallows `*/JobBoardView`, the only endpoint that lists postings. See below |
| **NT** | NTHSSA | GNWT careers (`gov.nt.ca/careers`) | **blocked** | robots.txt disallows `/careers/en/search/job/*` by name. See below |
| **NU** | Government of Nunavut | Drupal (`gov.nu.ca`); nurse listing on `nunavutnurses.ca` | **blocked** | `gov.nu.ca` is `Disallow: /`; the nurse site lists titles only, with no posted date. See below |
| *national* | *(any employer, any province)* | Job Bank (`jobbank.gc.ca`) | **ruled out** | Terms of Use forbid crawlers, and the owner has declined it as a source outright. Do not propose it again — see below |

## Employers who refuse our crawler

**Alberta Health Services and Covenant Health** (`careers.albertahealthservices.ca`,
`careers.covenanthealth.ca`) answer **403 Forbidden** to any User-Agent containing the word
"bot" — including Googlebot — while their robots.txt allows everything. Our crawler
identifies itself as `MedCareerBot/…`, and [the About page](../../app/about/page.tsx) promises
we always do, so we asked AHS to allow it rather than disguising the crawler (asked
17 Sep 2026, no reply yet). Both employer rows exist with `is_active = false`; switch them on
with:

```sql
update employers set is_active = true where slug in ('alberta-health-services', 'covenant-health');
```

**New Brunswick (Horizon Health Network and Vitalité Health Network)** post through iTacit
(`horizonnb.itacit.com`, `vitalitenb.itacit.com`). Both portals answer **401 Unauthorized** for
robots.txt and for sitemap.xml, while iTacit's own marketing site serves a normal robots.txt. The
robots standard (RFC 9309) says a crawler that gets 401 or 403 for robots.txt must treat the whole
site as disallowed, so we do not crawl them. The job pages themselves are publicly readable, so
this is a permission question, not a technical one: ask Horizon and Vitalité (or iTacit) to serve a
robots.txt, or for written permission. Checked 19 Sep 2026.

Note the earlier research mislabelled New Brunswick as Salesforce. `nbhealthjobs.my.site.com` is a
Salesforce site, but it only handles enquiries from internationally educated professionals — the
job postings are on iTacit.

**NL Health Services** (`nlhs.service-now.com/nlhsjobs`) serves a robots.txt that is two lines
long and disallows the entire host:

```
User-agent: *
Disallow: /
```

That is the whole file — 25 bytes, no per-agent exception, nothing carved out. One authority runs
every hospital, health centre and long-term care home in the province (Eastern, Central, Western
and Labrador-Grenfell merged into it in 2023), so this single robots.txt closes the province. The
public site `nlhealthservices.ca` is crawlable but carries no listings at all — its careers page
only links out to the blocked portal. Their careers team publishes an address,
`NLHScareers@nlhealthservices.ca`, so this is a permission question like Alberta's, not a
technical one. Checked 20 Sep 2026.

**Job Bank** (`jobbank.gc.ca`) is the federal board, and it is worth writing down why we cannot
use it, because its robots.txt invites you to. robots.txt is `User-agent: * / Crawl-delay: 5` and
disallows nothing, the search takes a clean `?fprov=NL&page=N` GET, and every posting carries
schema.org JobPosting as RDFa. The Terms of Use then say the opposite, in terms that name what we
would be building:

> Job Bank prohibits the use of any script, robot, spider, Web crawler, screen scraper, automated
> query program, artificial intelligence or other automated device, software, or process to access
> its services or otherwise interfere in any way with its operations and infrastructure.

Separately, [canada.ca's terms](https://www.canada.ca/en/transparency/terms.html) allow
non-commercial reproduction but require **prior written permission for commercial redistribution**,
which is what this site does. So Job Bank needs written permission on two counts, and a permissive
robots.txt does not substitute for either. Checked 20 Sep 2026.

**The owner has ruled Job Bank out as a source, permission or no permission** (decided
20 Sep 2026): too many licence conditions attached, and the postings are not reliably accurate.
That second objection is borne out by what we found — see the date trap below, where a posting
Job Bank dated 2026-08-07 carried the employer's own "Posted Date: 2024-12-04". This is a settled
decision, not a blocker waiting to be cleared: **do not re-propose Job Bank**, and do not treat a
future change in its Terms as reopening the question.

Consequence for the code: `sourcePriority()` in [dedupe.ts](../../workers/dedupe.ts) ranks a
`jobbank` source below direct ATS feeds, which reads like a plan to add one. There is no such
plan. Leave the branch alone — it is harmless — but nothing should ever emit that source id.

**Island Health** (`islandhealth.hua.hrsmart.com`) runs HRSmart and names exactly one crawler
it will accept:

```
User-agent: Googlebot
Allow: /

User-agent: *
Disallow: /
```

We match the second group, so the site is closed to us. This is a deliberate allow-list rather
than a blanket block, which makes it a good candidate to ask: they already accept one identified
crawler and would only be adding a second. Checked 20 Sep 2026.

**PHSA** (`jobs.phsa.ca`) and **Providence Health Care** (`www.providencehealthcare.org`) both sit
behind CloudFront and answer **403 to our User-Agent while serving a browser normally** — the same
pattern as Alberta Health Services. For PHSA the difference is stark: `robots.txt` itself returns
403 to `MedCareerBot` and 200 to Chrome. RFC 9309 says a crawler that cannot fetch robots.txt must
treat the site as disallowed, and in any case we do not disguise the crawler, so both are closed.
Like Alberta, this is a WAF rule rather than a stated policy, so it is worth asking rather than
assuming they meant to exclude us. Checked 20 Sep 2026.

**Fraser Health's iCIMS site** (`careers-fraserhealth.icims.com`) disallows all crawling in
robots.txt. Their public board (`jobs.fraserhealth.ca`) allows it and carries the same jobs,
so we use that and send applicants there too.

## What each system's data gets wrong

Every connector works around something. Do not assume a field means what it says.

- **Workday** — no city per posting; it comes from the employer registry. List pages say
  "Posted 30+ Days Ago" for anything older than a month, which is exactly why our ingest
  cutoff is 30 days.
- **Taleo / SelectMinds (Alberta)** — recent postings show relative dates ("20 hours ago").
  The job-fields block is malformed HTML (`<ul><b><li>Label: </b>value</li>`) and needs
  rebuilding before it is readable. City is the middle of "Zone, City, Facility".
- **iCIMS** — VCH and Mackenzie publish a **fake posted date**: always exactly two years
  before the moment you fetch the page, with `validThrough` a year ahead. The sitemap's
  last-modified date is the real one (it matched on 19 of 20 postings at portals that publish
  real dates). Humber River says "Greater Toronto" instead of a city.
- **Jibe (Fraser Health)** — the salary fields are all zero; the rate is stated in the
  description prose. `location_name` is sometimes a facility and sometimes a list of
  communities. Apply links point at an iCIMS login page, so we link to the public posting.
  robots.txt asks for one request every 5 seconds.
- **Oracle Cloud (Saskatchewan)** — the API’s `JobSchedule` contradicts the posting itself: a
  posting typed "Part-time regular" can carry JobSchedule "Full time", so the posting’s own
  "Type" line wins. Pay sits in the description as a band whose name comes between the label
  and the figures ("Pay Band Nurse A $38.580 to $50.070"), quoted to three decimals.
- **SuccessFactors (Manitoba)** — `addressRegion` is simply **wrong** on some postings: jobs in
  Beausejour, Manitoba are tagged "NB", which would file them under New Brunswick, so province
  comes from the registry. `hiringOrganization` says "Winnipeg Regional Health Authority" on
  every posting including Southern Health's, so the employer is read from the posting's own
  "Employer:" line. Employment status (Permanent/Temporary/Casual) is stated **only in the
  search results**, not in the posting — barely a tenth carry a "Hiring Status" line — so the
  list row is carried through hydration. Pay is a union grid, one rate per step
  ("$22.002, $22.645, $23.307"), not a range; plenty of postings just say "As per MNU
  Collective Agreement". Labels are spelled inconsistently between employers
  ("Department / Unit" and "Department/Unit", "Anticipated shift" and "Anticipated Shift").
- **The shared BC app (Interior, Northern)** — the JSON-LD misspells its own id field as
  `"identifer"`, so the job id is taken from the URL instead. `datePosted` is not ISO 8601:
  month and day are unpadded ("2026-9-18"), which `new Date` parses in local time and can shift
  back a day, so it is split and rebuilt in UTC. Northern Health writes `addressLocality` as
  "Prince George, BC" where Interior writes plain "Castlegar", so the province suffix is stripped.
  Facility and department are shouted and abbreviated ("CASTLEGAR DIST HLTH CTR"), and are title
  cased for display. Neither authority states a **shift** anywhere — not in the JSON-LD, the
  labelled fields, or the prose — so shift is left empty rather than guessed. Above all, both
  leave requisitions **open until filled**: 83% of each sitemap is older than 30 days, the oldest
  from 2023, so most of what they list never enters the ingest window. **Northern Health
  shouts every job title** ("REGISTERED NURSE (RN), MED SURG") where Interior Health does not —
  117 of Northern's 118 postings against 0 of Interior's 216 — so a title that is entirely
  uppercase is title cased for display, preserving clinical acronyms and grade numerals
  ("Activity Worker II", not "Ii"). **Close Date** is a bare day ("SEPTEMBER 20, 2026") and has
  to be anchored to the *end* of it: it becomes `expires_at`, so reading it as midnight would
  take a posting off the site at the start of the day it actually closes.
- **SuccessFactors (Nova Scotia)** — `addressRegion` is truncated to "Nova", so province comes
  from the registry. `hiringOrganization` says "Nova Scotia Health and IWK Health" on every
  posting, so the two employers are told apart by the URL path (`/nsha/`, `/iwk/`,
  `/physicians/`) instead.

## Pre-flight checklist for a new source

Run this before writing any connector. It has caught a blocker six times: Alberta, New
Brunswick, Newfoundland, Job Bank, and — on the same day — Njoyn's 15 tenants.

**robots.txt is no longer the binding constraint.** Four of our blocks come from a WAF or an
anti-bot service that contradicts a permissive or silent robots.txt: Alberta Health Services,
PHSA, Providence Health Care and Njoyn. A clean robots.txt means very little on its own, so
step 3 matters more than step 2.

1. **Terms of Use** — read them, not just robots.txt. Job Bank allows crawlers in robots.txt and
   forbids them in its Terms; the Terms win. Check for a commercial-reuse restriction too.
2. **robots.txt** — fetch it. Does it allow the job list and the postings?
3. **Our User-Agent, on both kinds of page** — request the job list with
   `MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:…)` and again with a browser
   User-Agent. Different status codes mean they block bots. Then do the same for a **job detail
   page**, and make several requests in a row: Njoyn serves the listing happily and a CAPTCHA on
   every detail page, so one request to one page would have passed and the connector would have
   been built before anyone noticed. Note that an anti-bot service can flag a malformed URL, so
   check a clean one before concluding.
4. **Crawl-delay** — honour it if stated; the connector gets its own rate limiter if it differs
   from our default of one request per second.
5. **How to list every posting** — a feed, sitemap, JSON API or paged HTML. Count them.
6. **Posted date** — is there a real one, on the list or the posting? Without it the 30-day
   ingest cutoff cannot work, and a first crawl marks every old job "posted today".
7. **Fields** — city, employment type, pay, closing date. Check across several postings, and
   at each employer on a shared site.
8. **Volume within 30 days** — how many postings we would actually store.

## Nova Scotia — checked 18 Sep 2026, live since 19 Sep 2026

- **Site:** `jobs.nshealth.ca`, SAP SuccessFactors, three career sites on one host:
  `/nsha/` (159 postings), `/iwk/` (44) and `/physicians/` (9).
- **robots.txt:** allows `/search/` and all job pages. Only apply, talent-community,
  subscribe and service paths are disallowed — none of which we touch.
- **Our User-Agent:** not blocked; identical responses to a browser.
- **Listing:** `/{site}/search/` returns 25 rows per page (`?startrow=`), each row carrying
  title, location, **posted date** and closing date — so old postings are skipped before
  being downloaded.
- **Postings:** microdata — `datePosted`, `validThrough` (a real closing date),
  `addressLocality`. The description holds "Type of Employment: Permanent Hourly FT",
  "Compensation and Benefits $38.43 - $50.99 hourly" and "Req ID".
- **Also available:** `jobs.nshealth.ca/sitemap.xml` is a Google Jobs feed holding all 212
  postings with full descriptions in one request — but **no posted dates**, which is why the
  search pages are the better list.

## Manitoba — checked 19 Sep 2026, live since 19 Sep 2026

- **Site:** `careers.wrha.mb.ca`, SAP SuccessFactors, branded "Manitoba Health-Care Careers".
  One career site at the host root (`/search/`), not per-employer paths as in Nova Scotia.
- **robots.txt:** allows `/search/` and every job page; only apply, talent-community,
  email-subscribe, preapply, reset and service paths are disallowed, none of which we touch.
- **Our User-Agent:** not blocked; identical responses to a browser, and it stayed that way
  across the ~900 requests this research took.
- **Volume:** 853 open postings, and **every one of them was posted within 30 days** — the
  oldest on the board was 28 days old. Manitoba reposts constantly ("- Repost" in the title),
  so the ingest cutoff trims nothing here.
- **Listing:** `/search/?startrow=` returns 25 rows per page, 35 pages. Each row carries the
  title, city, posted date, **the employing organisation** and **the employment status** —
  the last two are not reliably in the posting itself.
- **Postings:** microdata (`datePosted`, `validThrough`, `addressLocality`) plus a labelled
  block where each field is its own `<p>` with the label in a `<strong>`. Useful fields:
  Employer, Site, City, FTE, Anticipated Shift, Salary, Hiring Status, Reason for Term.

### One site, thirty employers

This is the thing to understand about Manitoba. The site is run by the WRHA but carries
roughly thirty organisations, and the split between them is uneven:

| Employer | Postings |
|---|---|
| Southern Health-Santé Sud | 235 |
| Shared Health | 169 |
| St. Boniface Hospital | 120 |
| Health Sciences Centre (run by Shared Health) | 117 |
| WRHA (community services, corporate, Grace, Victoria, Deer Lodge, Pan Am) | ~100 |
| Concordia, Misericordia, Seven Oaks, Riverview, Actionmarguerite and other Winnipeg sites | ~80 |
| CancerCare Manitoba | 10 |
| Churchill Health Centre | 8 |
| Northern Health Region, Interlake-Eastern, Prairie Mountain | 8 combined |

So one registry row (`manitoba-health-care-careers`) is the *crawl entry*, and the employer is
stored per job from the posting. A posting's "Site:" line is the facility, which is a different
thing: a Shared Health posting can be sited at Health Sciences Centre.

Because the employer name is whatever the posting typed, the same organisation can arrive under
more than one spelling — "Golden Links Lodge", "Golden Links Lodge Personal Care Home" and the
employer's own typo "Goldem Links Lodge" are all in the data. Manitoba alone contributes about
24 distinct employer names, which is worth knowing before using a count of them as a headline
figure anywhere.

### What Manitoba is still missing

Three regional authorities post only a token few jobs to the shared site and keep the rest on
their own systems. Each needs its own connector, and none has been checked yet:

- **Prairie Mountain Health** — `careers.pmh-mb.ca`, a custom Joomla component.
- **Interlake-Eastern RHA** — `selfservice.ierha.ca/QSS/applicant/JobSearch.aspx`, QSS.
- **Northern Health Region** — a WordPress listing at `northernhealthregion.com/careers/`.

## Newfoundland and Labrador — checked 20 Sep 2026, blocked

Newfoundland is the first province where **both** routes to the jobs are closed, and the second
(after New Brunswick) where the blocker is permission rather than technology. No connector was
written. Everything below is so the next person can act on it without repeating the search.

### One employer, one closed door

NL Health Services is the entire province. Eastern Health, Central Health, Western Health and
Labrador-Grenfell Health were merged into it in 2023, so unlike Manitoba's thirty organisations or
Ontario's 134 hospitals there is no second employer to fall back on. Their portal is ServiceNow at
`nlhs.service-now.com/nlhsjobs`, and its robots.txt disallows the whole host. That is the province.

`nlhealthservices.ca` is an ordinary WordPress site with a permissive robots.txt, but its
`/careers/` page holds no postings — only links to the blocked portal, an FAQ, and an address for
the careers team.

Memorial University was checked as a possible second source and is not one: its postings sit behind
`my.mun.ca` (login) and `mun.ca/academic-careers`, which are faculty appointments rather than
clinical vacancies.

### What is on Job Bank, and why it is not worth revisiting

Job Bank carries NL Health Services' postings — **447** of them, against 1,228 jobs in the province
altogether, which would have made Newfoundland our third-largest province ahead of Ontario's 573.
That number is the only tempting thing about it, and it is why this section exists: so the next
person who finds those 447 postings stops here instead of rediscovering the licence terms and the
data problems from scratch. The recon below is evidence for the decision, not a design sketch.

- **Search:** `https://www.jobbank.gc.ca/jobsearch/jobsearch?fprov=NL&page=N`. `fprov` is a clean
  GET parameter; the `locationstring` one in the visible form is ignored and silently returns
  national counts, which is an easy way to mis-size the opportunity by a factor of fifty.
- **Paging:** 25 rows per page, count in `<span id="results-count">`.
- **IDs:** `/jobsearch/jobposting/50325890`. The href carries a `;jsessionid=…` suffix that has to
  be stripped or every run produces new IDs.
- **Fields:** schema.org JobPosting as **RDFa attributes**, not JSON-LD — `property="datePosted"`,
  `"hiringOrganization"`, `"addressLocality"`, `"addressRegion"`, `"baseSalary"`,
  `"employmentType"`, `"validThrough"`. Descriptions are the employer's full text, including zone,
  facility, competition number and union pay band.
- **The date trap:** `datePosted` is when the job reached Job Bank, not when the employer opened
  it. One posting checked showed `datePosted` 2026-08-07 while its own text said
  "Posted Date: 2024-12-04" and "Closing Date: Open until filled". A 30-day ingest cutoff read off
  `datePosted` would therefore admit requisitions that have been open for years. Any Job Bank
  connector needs the posting's own date parsed out of the prose, the way Saskatchewan's pay band
  is.
- **Rate:** robots.txt asks for one request every 5 seconds, so 447 postings is roughly 40 minutes.

### Every other route was checked, and there is no second door

Before settling on the permission ask, these were each checked and each dead-ends at the same
blocked portal. Recorded so nobody re-runs the search:

| Checked | What it is | Outcome |
|---|---|---|
| `nlhealthservices.ca/careers/` | NLHS's own WordPress site | Crawlable, but holds no postings — links out to the portal |
| `jobs.nlhealthservices.ca` | Looks like a second listing host | 302 redirect straight to the blocked portal |
| `careers.nlhealthservices.ca` | Guessed subdomain | Does not resolve |
| [`workinhealthnl.ca`](https://workinhealthnl.ca/) | Government-backed NL recruitment site, **fully crawlable** (`Disallow:` empty) | No vacancies of its own — recruiter contact forms and staff stories. Its whole sitemap is info pages. Links out to the portal |
| `mun.ca` | Memorial University | Postings behind `my.mun.ca` login; academic appointments, not clinical |
| Job Bank | Federal board | Ruled out by the owner — see above |

### To unblock Newfoundland

One route, one ask. NL Health Services' job pages are publicly readable by a person; only
robots.txt stands between us and them, exactly as with Alberta. Send this to
`NLHScareers@nlhealthservices.ca` (the address their own careers page publishes):

> **Subject:** Permission for medcareer.ca to index NL Health Services job postings
>
> Hello,
>
> I run medcareer.ca, a Canadian healthcare job board. We list vacancies from health employers
> across the country and send applicants directly to the employer's own posting to apply — we
> don't host applications, charge applicants, or place advertising against your listings.
>
> We'd like to include NL Health Services. Your careers portal at nlhs.service-now.com/nlhsjobs
> currently returns a robots.txt that disallows all automated access, so we have not crawled it
> and won't unless you tell us we may. We'd rather ask than work around it.
>
> Would you be willing to permit this? Either of these works for us:
>
> 1. Add an exception to the portal's robots.txt for our crawler, which identifies itself as
>    MedCareerBot; or
> 2. Reply confirming written permission for us to index the public postings.
>
> How we would behave: one request per second at most, off-peak, identifying ourselves with a
> contact address on every request. We re-check postings so that filled or closed roles come down
> promptly, and we'd remove anything you asked us to, immediately.
>
> Newfoundland and Labrador is currently the only Atlantic province missing from the site — we
> already carry Nova Scotia Health and IWK. Happy to work to whatever constraints suit you.
>
> Thanks for considering it,
> [name, contact]

If they say yes, the connector is a day's work: ServiceNow portals expose a JSON API behind the
`sc_cat_item` / table endpoints the portal itself calls, so it would likely be an API connector
closer to [oraclecloud.ts](../../workers/connectors/oraclecloud.ts) than an HTML scraper. Nothing
was built or probed against the portal, because probing it is the thing we are asking permission
for.

Until they answer, Newfoundland stays off the site. No employer row was seeded — unlike Alberta,
where the rows exist with `is_active = false`, there is nothing to switch on, because there is no
connector to run.

**Asked: not yet sent (as of 20 Sep 2026).** Record the date here when it goes out, the way the
Alberta ask is recorded above.

## British Columbia — Interior and Northern, checked 20 Sep 2026, live since 20 Sep 2026

BC was never one system, and after this pass it is three groups: two authorities we already had
(Fraser, Vancouver Coastal), two we have just added, and three that refuse our crawler.

### One app, two authorities, no vendor

Interior Health and Northern Health run the same careers application — byte-for-byte the same
markup, the same URL scheme, the same field card. It carries no vendor name anywhere: no
`generator` meta, no third-party asset host, no branding in the footer. The signature to
recognise it by is the **`/ViewJobPosting/{id}`** URL, so if a third BC authority turns up on it,
it belongs on [bchealthjobs.ts](../../workers/connectors/bchealthjobs.ts) rather than a new
connector.

| | Interior Health | Northern Health |
|---|---|---|
| Host | `jobs.interiorhealth.ca` | `expectmore.northernhealth.ca` |
| Postings listed | ~1,354 | ~657 |
| Within the 30-day window | ~232 | ~118 |
| Default city | Kelowna | Prince George |

`jobs.northernhealth.ca` is an alias that redirects to `expectmore.northernhealth.ca`; the
sitemap gives the canonical host, and the registry uses it.

### Why the posting count and the job count are so far apart

Both authorities leave requisitions **open until filled** — "OPEN UNTIL FILLED" is the Close Date
on most postings — and never retire them from the sitemap. The oldest entry is from **April 2023**.
Against the 30-day ingest cutoff that means **83% of what they list never enters the window**: 2,011
postings become roughly 350 jobs.

That is a much bigger gap than anywhere else we crawl, and worth knowing before anyone reads the
sitemap counts as a forecast. It is also the strongest argument for the cutoff: a 2023 requisition
still sitting on the board is not a vacancy an applicant should be sent to.

The saving grace is that the cutoff can be applied **before** fetching anything. The sitemap's
`<lastmod>` equals the posting's own `datePosted` — checked on 10 postings spread across 3.5
years, exact on all 10 — and `lastmod` is never bumped, or nothing would still read 2023. So the
connector reads one sitemap, drops the 83%, and hydrates only what is left, the way
[icims.ts](../../workers/connectors/icims.ts) does.

### What the postings give us

Each page carries schema.org JobPosting as JSON-LD, plus a labelled card the employer fills in:
Competition #, Employee Type, Bargaining Unit, Facility, Location, Department, Reports To, Close
Date, and — on about half — Hourly Wage.

- **Employment type** comes from Employee Type, which combines the engagement and the hours:
  "PERMANENT FULL TIME", "RELIEF FULL TIME", "TERM SPECIFIC FULL TIME", "CASUAL", "PERMANENT PART
  TIME (0.50 FTE)". The engagement wins — "relief" is BC health's word for covering someone
  else's line, so RELIEF FULL TIME is casual work, not full time.
- **Pay** is a clean hourly range ("$27.26 - $29.16") where it is stated at all. Roughly half of
  postings quote none.
- **Facility** is the one field the site gives that most others do not, and it is on every
  posting. It needs handling, though: it arrives shouted, abbreviated, and **truncated by the
  source at about 25 characters** — "DAWSON CREEK & DIST HOSPI" and "GR BAKER MEMORIAL HOSP CO"
  are cut off in the data we are given, not by us. It is title cased for display, with joining
  words kept lowercase and the province code kept upper ("UNIV. HOSPITAL OF N. BC" would
  otherwise read "Univ. Hospital Of N. Bc", and it is the commonest facility of the two
  authorities). Real acronyms still come out title cased — "Fsj Hosp/Health Centre" for Fort
  St. John — because nothing distinguishes them from the vowel-less abbreviations beside them
  (Hlth, Ctr, Rgnl, Bndry) that read better that way. About 8 postings give the facility as
  "FLEXIBLE", meaning no fixed site; that is stored as no facility rather than as a place.
- **Shift** is stated nowhere, so it stays empty. This is the only live connector with no shift
  data at all.
- **Close Date** is "OPEN UNTIL FILLED" on most postings and a bare day on the rest. Where it is
  a day, it is stored as 23:59:59 Pacific on that day rather than its midnight, so a posting is
  never expired while it is still open — the same correction taleo.ts makes for Alberta. The
  offset is fixed at -08:00: BC is -07:00 under daylight time, so in summer a posting lives one
  extra hour rather than dying an hour early, which is the safe direction.
- **Titles** arrive shouted from Northern Health and normally cased from Interior Health, so
  fully-uppercase titles are title cased. Clinical acronyms (RN, LPN, ICU, MRI) and grade
  numerals (II, III) are preserved.

See the gotchas list above for the misspelled `"identifer"` key, the unpadded `datePosted`, and
Northern Health's "Prince George, BC" locality.

### What BC is still missing

Three authorities refuse the crawler, and all three are worth asking rather than writing off,
because none of them states a policy against us — they are a robots.txt allow-list and two WAF
rules:

- **Island Health** — robots.txt admits Googlebot and no one else. They already accept one
  identified crawler.
- **PHSA** (BC Children's, BC Cancer, BC Women's) — 403 to our User-Agent, 200 to a browser.
- **Providence Health Care** (St. Paul's) — the same.

The First Nations Health Authority has no board of its own; its jobs page links out to member
organisations on Prevue and ScouteRecruit, a handful of postings across several systems, so it is
not worth a connector.

## Quebec — checked 21 Sep 2026, available but not started

Quebec is crawlable everywhere we looked. It is not started because it needs a decision first,
and the research below is here so that decision can be made without repeating the survey.

### There is no single Quebec site

Unlike Manitoba, where one shared board carries thirty employers, Quebec's ~34 CISSS/CIUSSS are
spread across at least four platforms on domains with no consistent naming. What was found:

| Site | Platform | Postings | robots.txt |
|---|---|---|---|
| `emplois.sante.quebec` (Santé Québec central) | DigitalRecruiters | ~61 | `Allow: /`, `Crawl-delay: 10` |
| `cn.carrieresante.gouv.qc.ca` (Capitale-Nationale) | WordPress WP Job Manager | 122 | permissive |
| `laurentides.carrieresante.gouv.qc.ca` | WordPress WP Job Manager | 135 | permissive |
| `lanaudiere.carrieresante.gouv.qc.ca` | WordPress WP Job Manager | 107 | permissive |
| `emplois.cisssbsl.com` (Bas-Saint-Laurent) | WordPress WP Job Manager | 92 | permissive |
| `carrieres.cusm.ca` (MUHC) | WordPress WP Job Manager | 86 | permissive |
| `emplois.santemontreal.qc.ca` (Montréal) | **Njoyn**, CLID 54327 | — | named-bot blocklist, no `*` group |
| `ciusss.avature.net` (Centre-Ouest) | Avature | — | `Allow: /careers` + sitemap |

Two useful findings in that table. **Five sites share one WordPress WP Job Manager setup** —
`/poste/` URLs and a `job_listing-sitemap.xml` — so one connector reaches ~542 postings today and
more as the remaining regional domains are found. And **Montréal is on Njoyn**, the same ATS as 14
Ontario hospitals, so a Njoyn connector would reach both provinces.

Only three regions answer on the `*.carrieresante.gouv.qc.ca` pattern (cn, laurentides,
lanaudiere); the rest use their own domains, so enumerating all 34 is itself a research task.

### The blocker is language, not permission

Every Quebec posting is in French, and that breaks three things that are not connector work:

1. **Categories.** `classify()` in [lib/taxonomy/classify.ts](../../lib/taxonomy/classify.ts) is
   English regex. "Préposé aux bénéficiaires" and "Infirmière auxiliaire" match nothing, so
   **every Quebec job would land uncategorised** — against a site-wide category gap that is
   already the largest quality problem we have.
2. **Search.** An English query will not match a French title, so the jobs would be present but
   effectively unfindable for anyone searching the way the rest of the site expects.
3. **`provinceCodeFromName("Québec")` returns null** — it compares against the unaccented
   "Quebec". A one-line fix using the existing `deaccent()`, but it would silently push every
   posting onto the registry fallback until fixed.

None of this is a reason not to do Quebec. It is a reason to decide the language question — French
taxonomy patterns, bilingual titles, or accepting uncategorised French listings — **before**
writing connectors, rather than discovering it with several thousand rows already stored.

### Njoyn would have reached further than Quebec — but it is blocked

Worth recording next to this: [ontario-hospitals-ats.md](./ontario-hospitals-ats.md) puts **14
Ontario hospitals** on Njoyn, the largest single untapped cluster in that province, and Montréal
makes it 15 tenants across two provinces. All are one URL shape,
`xweb/Xweb.asp?page=joblisting&CLID={id}`, which is exactly the registry-driven `ats_config`
pattern every connector here already uses — a CLID per employer.

**Njoyn is blocked, and robots.txt is not what blocks it.** Its robots.txt names ten crawlers —
BLEXBot, SemrushBot, Applebot, ClaudeBot and others — and has **no `User-agent: *` group at all**,
so under RFC 9309 no rule applies to `MedCareerBot` and crawling would be permitted. The file is
byte-identical across every tenant, so it is a platform default rather than a hospital's decision.

What actually stops us is **Radware bot protection**, and it is worth being precise about where,
because the two halves of the site behave differently:

| Page | Result |
|---|---|
| Job **listing** (`page=joblisting&CLID=…`) | **200, 496 KB** — the real page, 100 postings with job number, program/area, title, category, job type and closing date |
| Job **detail** (`Page=JobDetails&Jobid=…`) | **Radware block page** with a CAPTCHA — *"your activity and behavior on this website made us think that you are a bot"* |

That was verified carefully, because the first attempt used a malformed URL (a double-encoded
`&amp;`) that could itself have looked like an attack probe. After waiting out the cooldown, a
clean run — well-formed URL, our own User-Agent, a cookie jar carried from the listing, a referer,
15 seconds between requests — got the listing at full size and was blocked on the **first** detail
request. So the block is real and specific to the detail pages, not something we provoked.

That is fatal rather than inconvenient. The listing carries no description and **no posted date**
— its only date column is `PostDateTo`, the closing date. Without a description there is no job
page to show, and without a posted date the 30-day cutoff cannot work and a first crawl would
stamp every posting "posted today". Everything we actually need is on the page we cannot fetch.

Getting past it would mean pretending not to be a crawler, which is the one thing this project
does not do (see Alberta, PHSA and Providence, all blocked the same way). So Njoyn is closed
unless CGI or an individual hospital allows us through, and it is closed for **15 tenants at
once** — 14 Ontario hospitals and Montréal.

There is a pattern here worth naming: **robots.txt is no longer the binding constraint on
Canadian health ATSs.** Four of our blocks now come from a WAF or an anti-bot service that
contradicts a permissive or silent robots.txt — Alberta Health Services, PHSA, Providence Health
Care and now Njoyn. Check for one early; a clean robots.txt means very little on its own.

## PEI and the territories — checked 22 Sep 2026, all blocked

All four were checked against the full pre-flight checklist, including a listing page and a detail
page with our own User-Agent. Each is closed in a different way, and none by a technical problem
we could solve without pretending not to be a crawler.

| | Where the postings are | What closes it |
|---|---|---|
| **PEI** | PeopleSoft Candidate Gateway, `psgateway.gov.pe.ca` | **Radware.** robots.txt is a 404, which RFC 9309 reads as "no restrictions" — but the first request returns a Radware page, and so does a browser User-Agent. It is a JavaScript challenge, not a User-Agent rule, so the only way past is a headless browser posing as a person. `healthjobspei.ca`, `healthpeicareers.ca` and `jobspei.ca/pei-health-jobs` are all crawlable and all marketing pages that link out to the gateway |
| **Yukon** | UKG UltiPro, `recruiting.ultipro.ca/YUK5001YUHC` | **robots.txt, precisely.** It is `Disallow: /` with `Allow: */JobBoard/` and `Disallow: */JobBoardView`. The board page embeds no job IDs — only a zeroed placeholder — and loads its list from `JobBoardView/LoadSearchResults`, which the longer Disallow rule covers. Single postings are open; there is no permitted way to find them. It reads as deliberate: search engines may index postings they reach by link, and bulk listing is refused |
| **NWT** | GNWT careers, `gov.nt.ca/careers` | **robots.txt, by name**: `Disallow: /careers/en/search/job/*`. The NTHSSA site carries no posting links of its own. A URL shaped to slip past the pattern would defeat the obvious intent of a rule written about job listings |
| **Nunavut** | `gov.nu.ca/en/jobs/…` | **robots.txt**: `gov.nu.ca` ends with `Disallow: /`. `nunavutnurses.ca/jobs/opportunities` *is* crawlable and lists ~20 nursing postings, but only title, closing date and competition number — the Community column is empty on every row, and there is no posted date and no description. Every row links out to the disallowed host |

Nunavut's nurse table has the same shape as Njoyn: the list is reachable and everything a job page
needs is on the page we may not fetch. Using "first seen" as the posted date would stamp
open-until-filled roles as new on the first crawl, which step 6 of the checklist exists to prevent.

PEI is now the fifth WAF block (after AHS, PHSA, Providence and Njoyn), and the second Radware one.

### Quebec, revisited 22 Sep 2026: crawlable, but a copyright clause stands in the way

A second pass found **eight** CISSS/CIUSSS and hospital sites on the one WordPress WP Job Manager
setup — **857 postings**, of which ~530 were edited within 30 days. Every one allows crawling, serves
our User-Agent on both listing and detail pages, and carries JobPosting JSON-LD with a real
`datePosted`. Technically this is the best remaining source in the country.

| Site | Postings | `lastmod` within 30 days | Sitemap |
|---|---|---|---|
| `cissslaval.carrieresante.gouv.qc.ca` | 156 | 126 | WordPress core, `wp-sitemap-posts-job_listing-1.xml` |
| `laurentides.carrieresante.gouv.qc.ca` | 136 | 90 | Yoast, `job_listing-sitemap.xml` |
| `cn.carrieresante.gouv.qc.ca` | 121 | 101 | Yoast |
| `cisssca.carrieresante.gouv.qc.ca` | 109 | 38 | Yoast |
| `lanaudiere.carrieresante.gouv.qc.ca` | 106 | 44 | Yoast |
| `emplois.cisssbsl.com` | 92 | 30 | Yoast |
| `carrieres.cusm.ca` (MUHC) | 79 | 47 | Yoast |
| `chudequebec.carrieresante.gouv.qc.ca` | 58 | 54 | Yoast |

**The blocker is licensing, not access.** The seven `carrieresante.gouv.qc.ca` sites link from their
footers to the Government of Quebec's copyright policy, which says:

> Il est interdit de reproduire, télécharger, stocker, traduire, adapter, publier ou représenter en
> public les contenus du gouvernement du Québec sans autorisation préalable.

It covers "tous les documents, données, compilations et autres œuvres qu'il produit, publie ou
diffuse". Storing and publishing a posting's description is exactly what the pipeline does. It is
stricter than canada.ca, which at least permits non-commercial reproduction — this one names
storage itself. MUHC is the exception: `carrieres.cusm.ca` links only privacy notices and publishes
no terms of use at all, so nothing explicit restricts it.

The policy's own heading offers a way through — "demande d'autorisation de reproduction", a
request for authorization — so this is a permission question with a named process, not a closed
door. Nothing has been built or ingested for Quebec pending the owner's decision.

Things any connector will need, recorded so they are not rediscovered:

- **`lastmod` is not the posted date here.** WordPress bumps it on every edit; it matched
  `datePosted` on 6 of 16 samples. It is still a safe *upper bound* — nothing is modified before it
  is posted — so it can skip old postings before fetching, with `datePosted` deciding afterwards.
  The runner already checks both (`workers/run.ts`, the stub check and the post-hydration check).
- **Parse sitemaps by `<url>` block.** `cn` puts `<xhtml:link hreflang>` alternates between `<loc>`
  and `<lastmod>`, so any pattern assuming they are adjacent reads zero postings and reports success.
- **Titles are double-encoded** (`l&amp;rsquo;exercice`) — decode twice. Descriptions arrive
  HTML-escaped. `hiringOrganization.name` is empty, so the employer comes from the registry.
  `jobLocation.address` is a bare string ("Montréal"), not a PostalAddress.
- **`validThrough` looks like a year-end placeholder** (2026-12-31); treat it as iCIMS's is treated.
- Pages carry Google reCAPTCHA on their forms, which a naive block-page check mistakes for a WAF.

Other Quebec platforms seen but not pursued: DigitalRecruiters at `emplois.sante.quebec` and at
`emploi.recrutementcisssme.com` (Montérégie-Est), and `emplois.santeestrie.qc.ca` (Estrie).

### The request to send Santé Québec

MUHC is live. The seven Santé Québec sites are seeded with `is_active = false` and need written
permission before they are switched on, because of the copyright clause above. Their career sites
carry no general enquiry address, so this goes to the recruitment contact on the regional site, or
through the "demande d'autorisation de reproduction" form the copyright page links:

> **Objet :** Demande d'autorisation — diffusion des offres d'emploi de Santé Québec sur medcareer.ca
>
> Bonjour,
>
> J'exploite medcareer.ca, un site d'emplois en santé au Canada. Nous regroupons les offres
> publiées par les employeurs du réseau de la santé et dirigeons les candidats directement vers
> l'affichage original de l'employeur pour postuler. Nous n'hébergeons aucune candidature et nous
> ne vendons pas d'espace publicitaire sur vos affichages.
>
> Nous souhaitons inclure les offres de Santé Québec. Vos sites de carrières autorisent
> l'indexation (robots.txt), mais la Politique de droit d'auteur du gouvernement du Québec interdit
> de reproduire, stocker ou publier vos contenus sans autorisation préalable. Nous préférons
> demander plutôt que présumer.
>
> Nous demandons donc l'autorisation de reproduire le titre, le lieu, la date d'affichage et le
> texte descriptif de vos offres, avec un lien vers l'affichage original. Nos engagements : une
> requête par seconde au maximum, un robot identifié (MedCareerBot) avec une adresse de contact,
> retrait immédiat de toute offre sur demande, et arrêt complet du traitement si vous le demandez.
>
> Si une portée plus limitée vous convient mieux — par exemple le titre et le lien seulement, sans
> le texte descriptif — nous nous y conformerons volontiers.
>
> Merci de votre considération,
> [nom, coordonnées]

If they decline the description but allow the facts, the fallback is a title-and-link-only variant
of the connector; the fields are already separated in `normalizeWpJobManager`, so that is a change
to what is stored, not to how it is fetched.

**Asked: not yet sent (as of 23 Sep 2026).** Record the date here when it goes out, as the Alberta
and Newfoundland asks are recorded.

## Ontario's long tail — started 24 Sep 2026

Njoyn's 14 hospitals are blocked (above), so what remains in Ontario is genuine long tail. The
cheapest wins are hospitals already running a platform we have a connector for; the first of
those is now live.

**Health Sciences North (Sudbury) is live, with no new code.** It runs the same SAP
SuccessFactors career-site template as Nova Scotia Health, and its robots.txt is *byte-identical*
to `jobs.nshealth.ca`'s. Detail pages carry the same microdata, and repeat requests with our own
User-Agent were served normally. 81 postings, all inside the 30-day window.

Two things it taught the connector:

- **A single-employer tenant has no site segment.** `/search/`, `/hsn/search/` and
  `/definitely-not-a-real-site/search/` all return the same 25 results — the segment is ignored
  entirely. So `sites` is `[""]` rather than a made-up name that would mislead the next reader,
  and `searchUrl()` omits the segment when the site is empty. The old loop guarded with
  `if (!site) return` and would have read `""` as "no more sites".
- **Canadian spelling.** HSN posts "Anaesthesia Assistant"; the rules carried only the American
  "anesthesia". The -ae- forms (anaesthesia, paediatrician, haematologist, gynaecologist) are now
  matched alongside the American ones, which picked up 8 more jobs across the provinces already
  live, not just Sudbury.

### `careerNNN.successfactors.eu` is closed, for every tenant

Kingston Health Sciences Centre and Hotel Dieu Hospital share the `KGH` tenant on
`career012.successfactors.eu`. Its robots.txt is 59 bytes:

```
User-agent: *
Disallow: /
Disallow: /*company
Allow: /login
```

Their career URL is `/career?company=KGH`, disallowed twice over. This is **SAP's own hosted
domain**, not an employer's — so every employer on a `careerNNN.successfactors.eu` tenant is
closed the same way, and it is worth checking which domain a SuccessFactors employer uses before
counting it. An employer on its own custom domain (Nova Scotia, Health Sciences North) is
crawlable; the same software on SAP's domain is not.

### What is worth doing next in Ontario

| Cluster | Hospitals | Note |
|---|---|---|
| ~~TalentPoolBuilder~~ | ~~6~~ | **Done** — 5 live. Lake of the Woods has no jobs widget on its board |
| SmartRecruiters | 4 | |
| UKG (UltiPro / UKG Pro) | 4 | Yukon's UltiPro board was blocked at the listing endpoint; check whether these tenants are the same shape before building |
| eRecruit | 4 | Not one vendor — separately hosted instances, likely per-instance work despite the shared name |
| PeopleSoft | 3 | London Health Sciences, Ottawa Hospital, SickKids, each self-hosted. PEI's PeopleSoft sat behind a Radware challenge |
| Dayforce, SilkRoad, StartDate, BambooHR | 2 each | |

48 Ontario hospitals have **no ATS at all** — postings are PDFs, inline forms or "email your
resume". No connector can reach those regardless of effort.

Every one of these needs the pre-flight before any code: Njoyn looked like the best cluster in
the province until its detail pages turned out to be behind a WAF.

### TalentPoolBuilder — live 24 Sep 2026, and the trap that hides in it

Five of the six hospitals are live: Providence Care (83 open), Windsor Regional (54), Hôpital
Montfort (41), Georgian Bay General (31), Guelph General (26). Lake of the Woods District
Hospital is **not** seeded — its board carries no jobs widget at all, so there is nothing to list.

TalentPoolBuilder is **NetHire's** ATS. The board is an AngularJS page that lists nothing in its
HTML; the postings come from `POST /jbApi/v1/jobs/list`.

**Two ways to get an answer that looks like "no openings":**

1. The page sends that request as **multipart form data**, not JSON — its `httpService.makeCall`
   builds a `FormData` and sets `Content-Type: undefined`. Post JSON and the API replies
   `{"result":true,"jobs":[]}`: a *success* with nothing in it.
2. The three parameters that select the postings — `cpId`, `brands`, `type` — sit in a
   **multi-line `ng-init`** on the jobs widget. Omit `brands` and the same empty success comes
   back. A single-line grep for `ng-init` captures only the first of the three, which is how
   this was nearly written off as six hospitals with no jobs.

Both failures are silent and both look like the employer, not the request. Sibling endpoints are
the way to tell them apart: an unknown endpoint answers `{"result":false,"error":"No Endpoint:…"}`,
so a `result:true` with an empty array means the request was accepted and the parameters were
wrong.

**The data is the richest of any source here.** Every open posting carries a wage range *with the
period named* (`wage_type`: "Hourly" or "Annually"), so nothing is inferred from magnitude, plus
city, province, department, brand, employment status and a real posted timestamp. Descriptions
are server-rendered into `.cp-job-description` on `/job/{campaign_id}`.

**Filter on `status`.** The API returns `"Hiring"` and `"Hired"` side by side, and `"Hired"` is a
filled post. Listing one sends an applicant at a job that no longer exists.

Permission: no tenant serves a robots.txt (all answer with HTML), nor does `ats.nethire.com`;
`nethire.com` itself is `Allow: /`. No terms of use are published to visitors — the terms inside
the page bundle are TPB's contract with the hospitals about paying to syndicate postings to job
boards, which is itself a sign these employers want to be aggregated. Repeat requests to the list
API and to a detail page were served normally.

## Long-term care and home care — started 24 Sep 2026

Everything above is hospitals and health authorities. This is the first pass at the other big
piece of the healthcare labour market: long-term care homes, retirement living and home care —
where the PSW and care-aide shortage is sharpest. The taxonomy already had the categories for it
(`support_care` carries most of the volume); what was missing was the employers.

Two employers checked out and are live. Three were checked and ruled out.

### Live

**CarePartners** (home care, Ontario-wide) needed no new connector — it runs iCIMS on
`careers-carepartners.icims.com`, the same platform as Vancouver Coastal and Humber River.
robots.txt names its own sitemap and disallows only the referral/login/candidate paths. 136
postings, in towns none of the hospital connectors ever reach — Kapuskasing, Penetanguishene,
Arnprior. `facility_type: 'home_care'`.

**Sienna Senior Living** (long-term care and retirement living, multi-province) needed a new
connector: [phenom.ts](../../workers/connectors/phenom.ts). Its board, `careers.siennaliving.ca`,
runs **Phenom** — an SPA, but every posting is also a real page carrying a complete schema.org
JobPosting, and a sitemap lists ~490 of them. robots.txt disallows only apply/chatbot/job-cart/
tracking paths; the job pages and sitemap are open. `datePosted` and the sitemap's `lastmod`
matched on the postings sampled, so `lastmod` filters the fetch before hydration, the same
pattern as the BC and Quebec connectors. Sienna runs homes in more than one province, so
**province comes from each posting**, not the registry row — the one connector so far where that
matters. `facility_type: 'long_term_care'`.

### Checked and not pursued

- **Chartwell** (`jobs.chartwell.com`) — robots.txt is `Disallow: /`. Blocked.
- **Revera** — `careers.reveraliving.com` no longer resolves. They appear to have rebranded or
  moved career sites since the last check; worth another look under a new name.
- **Extendicare** (~100 homes) — crawlable (`Allow: /`) and its own sitemaps name ~454 job posts
  across three files, but **every one of those URLs now redirects to the homepage**, and every
  sitemap `lastmod` is the same date (2026-07-08) — a stale sitemap of dead links, not a live
  feed. The real postings are server-rendered onto a `/job-posts/` index with city/address query
  filters instead. Worth a connector, but it needs its own investigation of that index page
  rather than reusing the sitemap pattern; not attempted here.

### Taxonomy gap this rollout exposed

Retirement-living operators use a vocabulary hospitals don't: 140 of Sienna's first 475 postings
(29%) came back uncategorised on the first ingest. Most were retirement-industry synonyms for
roles the taxonomy already had — "Guest Attendant", "Care Support Assistant" and "Resident
Attendant" are PSW/HCA work, "Server" and "Hospitality Aide" are dining and combined dietary/
housekeeping roles, "Concierge" is front desk, "Activation Aide" and "Resident Engagement
Assistant" are recreation. Added to [classify.ts](../../lib/taxonomy/classify.ts); coverage is
now 95%. The remainder — Sales Coordinator, Financial Analyst, HR Business Partner, Bus Driver —
are genuinely non-clinical corporate roles with no category to guess into, left unmatched on
purpose. The next chain (Schlegel, VON, SE Health, Bayshore) will likely reuse most of these
terms, since "guest attendant" and "concierge" are retirement-industry-wide, not Sienna-specific.

### What's next in this direction

The long-term care chains are worth more scouting: Schlegel Villages showed ADP/UltiPro signage
on its careers page but wasn't pre-flighted. VON, SE Health, Bayshore and ParaMed (home care)
weren't checked past a robots.txt probe — `jobs.sehc.com` returned a real robots.txt worth
following up. Each needs the full pre-flight (robots.txt, our UA on a listing *and* a detail
page, terms of use) before any connector work — Njoyn and Extendicare both looked promising on
a first pass and turned out not to be.
