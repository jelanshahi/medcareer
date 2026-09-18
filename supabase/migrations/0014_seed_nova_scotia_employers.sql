-- Nova Scotia: Nova Scotia Health and IWK Health, both on one SAP SuccessFactors host
-- (jobs.nshealth.ca) with a career site each. Between them they are the province's public
-- hospital system: ~169 and ~44 open postings in September 2026.
--
-- Every posting on the host claims the same hiringOrganization ("Nova Scotia Health and IWK
-- Health"), so the two employers are told apart by career site: `sites` lists the URL
-- segments each one owns. Nova Scotia Health takes the physician site as well as its own.
--
-- robots.txt allows the search pages and the postings, and the site does not block our
-- crawler (checked 18 Sep 2026 — see docs/research/canada-health-ats.md).
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Nova Scotia Health', 'nova-scotia-health', 'health_authority', 'NS', 'Halifax',
   'https://www.nshealth.ca', 'successfactors',
   '{"key":"nsha","host":"jobs.nshealth.ca","sites":["nsha","physicians"]}'),
  ('IWK Health', 'iwk-health', 'hospital', 'NS', 'Halifax',
   'https://www.iwk.nshealth.ca', 'successfactors',
   '{"key":"iwk","host":"jobs.nshealth.ca","sites":["iwk"]}')
on conflict (slug) do nothing;
