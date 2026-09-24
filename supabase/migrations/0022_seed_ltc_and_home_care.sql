-- First employers outside hospitals and health authorities: long-term care, retirement living
-- and home care. These are where the PSW and care-aide shortage actually is, and the taxonomy
-- already has the categories for it (support_care carries most of the volume).
--
-- CarePartners is home care across Ontario and needs no new connector: it runs iCIMS on
-- careers-carepartners.icims.com, whose robots.txt names its sitemap and disallows only the
-- referral, login and candidate paths. 136 postings, in towns the hospital connectors never
-- reach -- Kapuskasing, Penetanguishene, Arnprior.
--
-- Sienna Senior Living is long-term care and retirement living, and needed a new connector:
-- its board (careers.siennaliving.ca) runs Phenom, an SPA whose every posting is also a real
-- page carrying a complete schema.org JobPosting, listed in a sitemap that names ~490 of them.
-- robots.txt disallows only apply/chatbot/job-cart/tracking paths -- the job pages and sitemap
-- are open. Sienna runs homes in more than one province, so its connector reads province from
-- each posting instead of the registry row.
--
-- facility_type gains two values beyond the existing 'hospital' and 'health_authority'. The
-- column is free text, so this needs no schema change, but keep the vocabulary small.
--
-- Checked 24 Sep 2026. Not seeded:
--   Chartwell (jobs.chartwell.com)  -- robots.txt is "Disallow: /", blocked.
--   Revera                          -- careers.reveraliving.com no longer resolves; rebranded.
--   Extendicare                     -- crawlable ("Allow: /") and ~454 job posts, but every URL
--                                      in its three job sitemaps now redirects to the home page
--                                      and every lastmod is 2026-07-08. The live postings are on
--                                      the /job-posts/ index instead, so it needs its own work.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('CarePartners', 'carepartners', 'home_care', 'ON', 'Kitchener',
   'https://carepartners.ca', 'icims',
   '{"key":"carepartners","host":"careers-carepartners.icims.com"}'),
  ('Sienna Senior Living', 'sienna-senior-living', 'long_term_care', 'ON', 'Markham',
   'https://www.siennaliving.ca', 'phenom',
   '{"key":"sienna","host":"careers.siennaliving.ca"}')
on conflict (slug) do nothing;
