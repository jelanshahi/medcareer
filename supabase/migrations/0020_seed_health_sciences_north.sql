-- Health Sciences North (Sudbury), the first of Ontario's long tail. No new connector: it runs
-- the same SAP SuccessFactors career-site template as Nova Scotia Health, and its robots.txt is
-- byte-identical to jobs.nshealth.ca's -- only apply, talent-community and service paths are
-- disallowed. Detail pages carry the same schema.org microdata, and three repeat requests with
-- our own User-Agent were served normally (checked 24 Sep 2026).
--
-- `sites` is [""] rather than a made-up segment. This is a single-employer tenant whose board
-- lives at the host root: /search/, /hsn/search/ and /definitely-not-a-real-site/search/ all
-- return the same 25 results, so any segment would be decoration that misleads the next reader.
-- successfactors.ts builds the URL without a segment when the site is empty.
--
-- 81 postings, all within the 30-day window when checked.
--
-- Not seeded, and blocked rather than missed: Kingston Health Sciences Centre and Hotel Dieu
-- Hospital share the KGH tenant on career012.successfactors.eu, whose robots.txt is 59 bytes of
-- "Disallow: /" plus "Disallow: /*company", allowing only /login. Their career URL is
-- /career?company=KGH, disallowed twice over. That is SAP's own hosted domain, so every employer
-- on a careerNNN.successfactors.eu tenant is closed the same way -- see
-- docs/research/canada-health-ats.md.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Health Sciences North', 'health-sciences-north', 'hospital', 'ON', 'Sudbury',
   'https://www.hsnsudbury.ca', 'successfactors',
   '{"key":"hsn","host":"careers.hsnsudbury.ca","sites":[""]}')
on conflict (slug) do nothing;
