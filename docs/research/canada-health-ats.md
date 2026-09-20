# Canadian health employers — which job system each one uses

What every province's main health employers post their jobs through, whether we may crawl
them, and what is odd about each system's data. Written so nobody has to redo this research.

Ontario's 134 individual hospitals are in a separate file: [ontario-hospitals-ats.md](./ontario-hospitals-ats.md).

**Last checked: 19 September 2026.** Employers change job systems every few years, so
re-check a row before trusting it.

## Connectors we have built

| Connector | Employers | Source | Requests per run |
|---|---|---|---|
| [workday.ts](../../workers/connectors/workday.ts) | 6 Ontario hospitals: Scarborough, CHEO, Oak Valley, Southlake, St. Joseph's Hamilton, Peterborough | JSON API per tenant | ~1 per posting, every run |
| [taleo.ts](../../workers/connectors/taleo.ts) | Alberta Health Services, Covenant Health (**inactive — blocked, see below**) | HTML search pages + one page per posting | ~110 list pages + new postings |
| [icims.ts](../../workers/connectors/icims.ts) | Vancouver Coastal Health, Humber River, Mackenzie, Cambridge Memorial | Sitemap + one page per posting | 1 sitemap + new postings |
| [jibe.ts](../../workers/connectors/jibe.ts) | Fraser Health | JSON API, whole postings, 100 at a time | ~22, no per-posting fetches |
| [successfactors.ts](../../workers/connectors/successfactors.ts) | Nova Scotia Health, IWK Health | Paged search HTML + one page per posting | ~10 search pages + new postings |
| [successfactors-mb.ts](../../workers/connectors/successfactors-mb.ts) | The shared Manitoba site — ~30 employers | Paged search HTML + one page per posting | ~35 search pages + new postings |
| [oraclecloud.ts](../../workers/connectors/oraclecloud.ts) | Saskatchewan Health Authority | REST API, 200 requisitions per request | ~11 list requests + new postings |

## Province by province

Status: **live** = on the site; **blocked** = they refuse our crawler; **available** = checked
and crawlable, no connector yet; **unchecked** = system identified, crawl permission not tested.

| Province | Employer | Job system | Status | Notes |
|---|---|---|---|---|
| **ON** | 6 hospitals (above) | Workday | live | |
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
| **BC** | Island Health | HRSmart (`islandhealth.hua.hrsmart.com`) | unchecked | |
| **BC** | Interior Health, Northern Health | Shared custom system (`jobs.interiorhealth.ca`, `jobs.northernhealth.ca`) | unchecked | One connector should cover both |
| **BC** | PHSA (BC Children's, BC Cancer) | Own Drupal site (`jobs.phsa.ca`) | unchecked | Covers several provincial programs |
| **BC** | Providence Health Care | Unknown | unchecked | Site blocked automated requests during research |
| **BC** | First Nations Health Authority | PeopleSoft | unchecked | Small |
| **AB** | Alberta Health Services, Covenant Health | Taleo behind SelectMinds | **blocked** | See below. Rows seeded inactive in the database |
| **SK** | Saskatchewan Health Authority | Oracle Cloud Recruiting | live | The whole province: ~2,120 open, ~1,300 within 30 days |
| **MB** | ~30 employers on one shared site | SAP SuccessFactors (`careers.wrha.mb.ca`) | live | Almost the whole province — see below |
| **MB** | Prairie Mountain Health | Own Joomla component (`careers.pmh-mb.ca`) | unchecked | Posts only 1 job to the shared site |
| **MB** | Interlake-Eastern RHA | QSS self-service (`selfservice.ierha.ca`) | unchecked | Posts only 2 jobs to the shared site |
| **MB** | Northern Health Region | Own WordPress listing | unchecked | Posts only 5 jobs to the shared site |
| **NS** | Nova Scotia Health **and** IWK Health | SAP SuccessFactors (`jobs.nshealth.ca`) | live | Both employers on one site — see below |
| **NB** | Horizon and Vitalité | **iTacit** (`horizonnb.itacit.com`, `vitalitenb.itacit.com`) | **blocked** | Not Salesforce — that site is only for internationally educated professionals. See below |
| **NL** | NL Health Services | ServiceNow (`nlhs.service-now.com/nlhsjobs`) | unchecked | |
| **PE** | Health PEI | PEI government job site (`jobspei.ca`) | unchecked | Site blocked automated requests during research |
| **QC** | MUHC | Salesforce (`carrieres.cusm.ca`) | unchecked | |
| **QC** | Public network (CIUSSS/CISSS) | Quebec government site | unchecked | Postings in French; our category matching is English-only |
| **YT** | Yukon Hospitals | UKG UltiPro | unchecked | |
| **NT** | NTHSSA | Territorial government site | unchecked | |
| **NU** | Government of Nunavut | Territorial government site | unchecked | |

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
- **SuccessFactors (Nova Scotia)** — `addressRegion` is truncated to "Nova", so province comes
  from the registry. `hiringOrganization` says "Nova Scotia Health and IWK Health" on every
  posting, so the two employers are told apart by the URL path (`/nsha/`, `/iwk/`,
  `/physicians/`) instead.

## Pre-flight checklist for a new source

Run this before writing any connector. It has caught a blocker twice.

1. **robots.txt** — fetch it. Does it allow the job list and the postings?
2. **Our User-Agent** — request the job list with `MedCareerBot/0.1 (+https://www.medcareer.ca/about; mailto:…)`
   and again with a browser User-Agent. Different status codes mean they block bots.
3. **Crawl-delay** — honour it if stated; the connector gets its own rate limiter if it differs
   from our default of one request per second.
4. **How to list every posting** — a feed, sitemap, JSON API or paged HTML. Count them.
5. **Posted date** — is there a real one, on the list or the posting? Without it the 30-day
   ingest cutoff cannot work, and a first crawl marks every old job "posted today".
6. **Fields** — city, employment type, pay, closing date. Check across several postings, and
   at each employer on a shared site.
7. **Volume within 30 days** — how many postings we would actually store.

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
