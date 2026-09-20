-- Manitoba: almost the whole province posts through one shared SAP SuccessFactors site,
-- careers.wrha.mb.ca, branded "Manitoba Health-Care Careers". ~853 open postings, every one
-- of them posted within the last 30 days (the oldest on the board was 28 days old when
-- checked), so the province arrives in full rather than trimmed by the ingest cutoff.
--
-- This single row is the crawl entry, not the employer: the site carries about thirty
-- organisations — Southern Health-Santé Sud, Shared Health, the Winnipeg hospitals,
-- CancerCare Manitoba, personal care homes — and every posting names its own employer,
-- which the connector reads and stores per job. `hiringOrganization` claims "Winnipeg
-- Regional Health Authority" on all of them and is ignored.
--
-- robots.txt allows /search/ and every job page; only apply, talent-community and service
-- paths are disallowed, none of which we touch. Our crawler is not blocked (checked
-- 19 Sep 2026 — docs/research/canada-health-ats.md).
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Manitoba Health-Care Careers', 'manitoba-health-care-careers', 'health_authority', 'MB', 'Winnipeg',
   'https://healthcareersmanitoba.ca', 'successfactors_mb',
   '{"key":"mb","host":"careers.wrha.mb.ca"}')
on conflict (slug) do nothing;
