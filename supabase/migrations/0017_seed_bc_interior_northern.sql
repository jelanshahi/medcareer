-- Interior Health and Northern Health both run the same unbranded ASP.NET careers
-- application, recognisable by its /ViewJobPosting/{id} URLs. One connector, two hosts, one
-- registry row each -- unlike Manitoba, where a single shared site carries thirty employers.
--
-- Volume is smaller than the raw posting counts suggest. Interior lists ~1,354 postings and
-- Northern ~657, but both leave requisitions open until filled: 83% of each sitemap is older
-- than 30 days, so the ingest cutoff admits roughly 232 and 121 respectively. The sitemap's
-- <lastmod> equals the posting's own datePosted (checked on 10 postings spanning 3.5 years),
-- which is what lets the runner drop the other 83% without fetching them.
--
-- robots.txt on both hosts disallows nothing and names the sitemap, our User-Agent is served
-- normally, and neither authority publishes terms of use restricting automated access
-- (checked 20 Sep 2026 -- docs/research/canada-health-ats.md).
--
-- Not seeded, and blocked rather than missed: Island Health allows only Googlebot in
-- robots.txt, and PHSA and Providence Health Care answer 403 to our User-Agent while serving
-- a browser normally. See the research file.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Interior Health', 'interior-health', 'health_authority', 'BC', 'Kelowna',
   'https://www.interiorhealth.ca', 'bchealthjobs',
   '{"key":"interior","host":"jobs.interiorhealth.ca"}'),
  ('Northern Health', 'northern-health', 'health_authority', 'BC', 'Prince George',
   'https://www.northernhealth.ca', 'bchealthjobs',
   '{"key":"northern","host":"expectmore.northernhealth.ca"}')
on conflict (slug) do nothing;
