-- Alberta: Alberta Health Services and Covenant Health, both on Oracle Taleo behind a
-- SelectMinds job board (workers/connectors/taleo.ts). Together they post most public
-- hospital and continuing-care jobs in the province (~1,050 and ~110 open roles in Sept 2026).
--
-- Seeded INACTIVE. Both portals answer 403 to any User-Agent containing "bot", MedCareerBot
-- included, while their robots.txt allows everything. We identify ourselves honestly (see
-- /about), so these stay off until AHS allows the crawler. To switch them on:
--   update employers set is_active = true where slug in ('alberta-health-services', 'covenant-health');
--
-- default_city is only a fallback: the connector reads each job's city from its location
-- ("Calgary Zone, Calgary, Foothills Medical Centre"). It is used for the few province-wide
-- postings that name no location.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('Alberta Health Services', 'alberta-health-services', 'health_authority', 'AB', 'Edmonton',
   'https://www.albertahealthservices.ca', 'taleo',
   '{"key":"ahs","host":"careers.albertahealthservices.ca"}', false),
  ('Covenant Health', 'covenant-health', 'health_authority', 'AB', 'Edmonton',
   'https://www.covenanthealth.ca', 'taleo',
   '{"key":"covenant","host":"careers.covenanthealth.ca"}', false)
on conflict (slug) do nothing;
