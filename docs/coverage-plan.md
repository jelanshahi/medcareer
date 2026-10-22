# Coverage plan — where the next Canadian healthcare jobs come from

Written 21 Oct 2026. The research behind this lives in
[research/canada-health-ats.md](research/canada-health-ats.md) and
[research/ontario-hospitals-ats.md](research/ontario-hospitals-ats.md). This file is the
short version: what we cover today, and what to add next, cheapest first.

Fixed rules, unchanged: **no Job Bank**, never take applications or log in, identify the
crawler, at most one request a second, honour robots.txt, and never get around a WAF.

## Where we are (live database, 21 Oct 2026)

| Province | Active jobs | Comes from |
|---|---:|---|
| SK | 2,553 | Saskatchewan Health Authority (Oracle Cloud) — the whole province |
| BC | 2,387 | Vancouver Coastal (iCIMS), Fraser (Jibe), Interior and Northern (shared BC app) |
| ON | 1,436 | 6 Workday hospitals, 5 TalentPoolBuilder, 3 iCIMS, 2 SilkRoad, HSN, CarePartners, Sienna |
| MB | 1,297 | The shared SuccessFactors site — ~30 employers |
| NS | 354 | Nova Scotia Health, IWK |
| QC | 57 | MUHC only |
| AB | 17 | Sienna's Alberta homes only |
| NB, NL, PE, YT, NT, NU | 0 | All blocked (see below) |

Ontario is the biggest labour market and the thinnest relative to its size. Alberta and
Quebec are close to empty. That decides the order below.

**One thing to fix first:** Peterborough Regional Health Centre is **active** in the
database (14 jobs) although migration 0023 seeded it inactive, and its Workday robots.txt
still says `Disallow: /PRHC/` (re-checked today). Someone switched it on outside a
migration. **Switched back off on 21 Oct 2026** at the owner's request; its stored jobs drop
off within about 7 days once ingest stops seeing them.

## The plan

Effort: **seed** = a registry row only · **small** = a row plus a connector tweak ·
**new** = a new connector · **ask** = needs someone's permission first.

| # | Employer | Prov. | ATS | Connector | Est. jobs (30 days) | Effort | Blocker | Status |
|---|---|---|---|---|---:|---|---|---|
| 1 | **Trillium Health Partners** | ON | Oracle Cloud (`iadyup.fa.ocs.oraclecloud.com`, CX_4001) | existing `oraclecloud` | ~37 (53 open) | small | none | **done** — seeded in 0027 |
| 2 | **Ontario Health atHome** | ON | iCIMS (`healthcareathomejobs-en.icims.com`) | existing `icims` | ~50 (80 open) | small | none | **done** — seeded in 0027 |
| 3 | **Extendicare** (LTC, ~100 homes) | ON, AB, MB | Workday (`extendicare.wd10`, site `Extendicare2023`) | existing `workday` | ~250 (472 open) | small–medium | Workday has no city per posting | next |
| 4 | **ParaMed** (home care, Extendicare's) | ON, AB, NS | Workday (same tenant, `Paramed2023`) | existing `workday` | ~120 (203 open) | with #3 | same | next |
| 5 | Santé Québec regions + CHU de Québec | QC | WP Job Manager | existing, rows seeded inactive | ~500 | ask | Quebec government copyright licence; French taxonomy | waiting on Santé Québec |
| 6 | Alberta Health Services, Covenant | AB | Taleo/SelectMinds | existing, rows seeded inactive | ~1,500+ | ask | WAF 403s any "bot" User-Agent | asked 17 Sep, no reply |
| 7 | SE Health | ON, AB, BC | own Kentico site | existing `sehc`, seeded inactive | ~150 | ask | F5 WAF challenge after ~350 requests | ask SE Health to allowlist |
| 8 | UHN, Halton, Osler, West Nipissing | ON | SmartRecruiters | existing, built | ~400 | ask | vendor robots.txt allows only LinkedInBot | request drafted, not sent |
| 9 | Island Health, PHSA, Providence | BC | HRSmart / CloudFront | new / none | ~1,000 | ask | Googlebot-only robots; WAF 403 | not asked |
| 10 | Horizon + Vitalité (NB), NL Health Services, Health PEI | NB, NL, PE | iTacit / ServiceNow / PeopleSoft | new | ~1,500 | ask | 401 robots.txt; `Disallow: /`; Radware | not asked |
| 11 | VON, Ornge, Dynacare | ON + national | Jobvite (`jobs.jobvite.com/{co}`) | **new** | ~150 | new | none found yet — pre-flight needed | not started |
| 12 | Hamilton Health Sciences | ON | classic Taleo (`hhsc.taleo.net`) | **new** (not the AB front end) | ~150 | new | pre-flight needed | not started |
| 13 | Lakeridge, Niagara Health, Thunder Bay Regional, St. Joseph's Care Group | ON | eRecruit (`/erecruit/`, "AODA 2019.1.x" footer) | **new** | ~300 | new | separate instances, same product | not started |
| 14 | Unity Health, Sunnybrook, CBI Health, Bayshore, Canadian Blood Services | ON + national | unknown — no ATS link in server-rendered HTML | ? | large | investigate | needs a look in a real browser | not started |

### Notes on the "next" items

**3–4. Extendicare and ParaMed** are the single biggest reachable win left: ~675 open
long-term-care and home-care postings, robots.txt explicitly `Allow`s both sites, and the
Workday API answered our User-Agent normally (checked 21 Oct 2026). Alberta would go from 17
jobs to well over 100. The catch is the one recorded in `workday.ts`: Workday gives no city,
so today every posting would get the registry's default city **and province** — an Edmonton
care aide filed under Markham, Ontario. Of 145 Extendicare location strings, 103 end in a city
and province ("…, Fort Macleod, Alberta", "…\nEdmonton, AB") and 42 are bare home names
("LTC - Athabasca (53rd St.)"). ParaMed adds ~190 more, plus "N Locations" for multi-site
postings. The work is:

1. An opt-in `locationFromPosting` flag on the Workday config that parses a trailing
   "City, Province" from `jobPostingInfo.location`.
2. A `locationAliases` map in the registry row for the bare home names (built once from the
   API's `locationMainGroup` facet, one request per site).
3. Unmapped and "N Locations" postings: fall back to the default city, and log them so the
   map can be kept up to date — or skip them, if a wrong province is judged worse than a
   missing job.

**5–10** need nothing built; they need permission. The drafted requests are in the research
file. Each yes turns on rows that already exist.

**11–14** are new connectors. Every one needs the full pre-flight in the research file
(terms, robots.txt, our User-Agent on a list *and* several detail pages) before code —
Njoyn and SE Health both looked fine until they didn't.

## Not on the plan

- **Job Bank** — ruled out by the owner, permanently.
- **Njoyn** (14 Ontario hospitals, Montréal, Shannex in NS/NB) — Radware CAPTCHA on every
  detail page.
- **UKG/UltiPro** (Bruyère, Homewood, Huron Perth, Ontario Shores, Schlegel Villages, Yukon) —
  robots.txt disallows the listing endpoint.
- **Chartwell** — `Disallow: /`.
- **Kingston Health Sciences, Hotel Dieu** — SAP's hosted SuccessFactors domain is
  `Disallow: /`.
- **Saskatchewan Cancer Agency** — already covered: it posts on SHA's Oracle Cloud site.
- ~48 Ontario hospitals with no ATS at all (PDFs and email).
