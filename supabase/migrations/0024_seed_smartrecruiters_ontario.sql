-- Four more Ontario hospitals on the new SmartRecruiters connector (workers/connectors/smartrecruiters.ts):
-- Halton Healthcare, University Health Network, West Nipissing General Hospital, and William Osler
-- Health System. Identified in docs/research/ontario-hospitals-ats.md; company identifiers confirmed
-- live on 1 Oct 2026 by calling https://api.smartrecruiters.com/v1/companies/{key}/postings?limit=1
-- with our own User-Agent:
--   Halton Healthcare                -> HaltonHealthcare1        (200, 85 postings)
--   University Health Network        -> UniversityHealthNetwork  (200, 218 postings)
--   West Nipissing General Hospital  -> WestNipissingGeneralHospital (200, 0 postings -- identifier
--                                        confirmed correct via its careers.smartrecruiters.com page
--                                        title "Careers at West Nipissing General Hospital"; the
--                                        hospital simply has no open postings right now)
--   William Osler Health System      -> WilliamOslerHealthSystem1 (200, 87 postings; API echoes this
--                                        canonical casing even though the careers-page slug is
--                                        lowercase "williamoslerhealthsystem1")
--
-- Seeded INACTIVE, all four, and they stay that way. The API itself answers every request normally
-- (no bot challenge, no CAPTCHA, real JSON every time) -- but api.smartrecruiters.com's own
-- robots.txt is:
--   User-agent: LinkedInBot
--   Allow: /v1/companies/
--   User-agent: *
--   Disallow: /
-- which disallows every crawler except LinkedInBot by name, including the exact /v1/companies/
-- path this connector calls. We are MedCareerBot, not LinkedInBot, and do not pretend otherwise.
-- Per this project's crawling rules (docs/superpowers/specs/2026-09-08-careportal-phase-1-design.md
-- §3.2, "respect robots.txt"), a technically-answering endpoint that robots.txt disallows is treated
-- as blocked, not as available -- the same call already made for Peterborough Regional Health Centre
-- in 0023_seed_workday_ontario_expansion.sql. SmartRecruiters' API terms of use and published rate
-- limit were not checked further: the robots.txt disallow is sufficient on its own to keep every row
-- here off, so it would be moot until that changes.
--
-- To reconsider: either SmartRecruiters updates robots.txt to allow MedCareerBot (or crawlers
-- generally) on /v1/companies/, or we get explicit written permission the way the Quebec migration
-- (0019_seed_quebec_wpjobmanager.sql) sought it from Santé Québec. Until then:
--   update employers set is_active = true where ats_platform = 'smartrecruiters' and slug in (...);
--
-- cityAliases: checked a full pull of every CURRENT posting per employer (not just the one sample
-- the pre-flight curl above returns), via `location.city` across all pages:
--   Halton (89 postings): Oakville / Milton / Halton Hills only -- real municipalities, no grouping.
--   UHN (218 postings): overwhelmingly Toronto (192), plus Mississauga, Brampton, Ajax -- real
--     cities, no grouping. (This also confirms default_city = 'Toronto' below is the right fallback,
--     even though the single pre-flight sample above happened to be a Mississauga posting.)
--   William Osler (87 postings): mostly Brampton/Etobicoke/Toronto, but 4 postings use a combined
--     string -- "Brampton & Etobicoke" (x3) and "Etobicoke & Brampton" (x1) -- exactly the grouped-
--     location case this connector's cityAliases config exists for (see the design spec's own
--     synthetic "GTA" test fixture, written anticipating this). Mapped both variants to Brampton,
--     Osler's primary/largest site, below.
-- West Nipissing has no current postings to sample; revisit if a grouped name appears once it does.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('Halton Healthcare', 'halton-healthcare', 'hospital', 'ON', 'Oakville',
   'https://www.haltonhealthcare.on.ca', 'smartrecruiters',
   '{"key":"HaltonHealthcare1","host":"api.smartrecruiters.com"}', false),
  ('University Health Network', 'university-health-network', 'hospital', 'ON', 'Toronto',
   'https://www.uhn.ca', 'smartrecruiters',
   '{"key":"UniversityHealthNetwork","host":"api.smartrecruiters.com"}', false),
  ('West Nipissing General Hospital', 'west-nipissing-general-hospital', 'hospital', 'ON', 'Sturgeon Falls',
   'https://www.wngh.ca', 'smartrecruiters',
   '{"key":"WestNipissingGeneralHospital","host":"api.smartrecruiters.com"}', false),
  ('William Osler Health System', 'william-osler-health-system', 'hospital', 'ON', 'Brampton',
   'https://www.williamoslerhs.ca', 'smartrecruiters',
   '{"key":"WilliamOslerHealthSystem1","host":"api.smartrecruiters.com","cityAliases":{"Brampton & Etobicoke":"Brampton","Etobicoke & Brampton":"Brampton"}}', false)
on conflict (slug) do nothing;
