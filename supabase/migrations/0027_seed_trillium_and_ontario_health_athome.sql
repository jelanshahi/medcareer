-- Two more Ontario employers on connectors we already run -- registry rows, plus a small
-- location fix in each connector (see docs/coverage-plan.md).
--
-- Trillium Health Partners (Mississauga Hospital, Credit Valley, Queensway) moved off iCIMS in
-- 2026: careersen-trilliumhealthpartners.icims.com now answers "gone". Its board is Oracle Cloud
-- Recruiting, the same API as the Saskatchewan Health Authority. 53 open postings on
-- 21 Oct 2026, 37 of them inside the 30-day window. robots.txt on the Oracle host is 404 (no
-- restrictions, as for SHA) and the list and detail endpoints answered our User-Agent normally.
-- Its PrimaryLocation is often just "ON, Canada", so city and facility come from the posting's
-- workLocation instead.
--
-- Ontario Health atHome (the province's home and community care organisation, formerly the
-- LHIN home care teams) runs iCIMS on healthcareathomejobs-en.icims.com. robots.txt names its
-- sitemap and disallows only the referral/login/candidate paths, the same file as CarePartners.
-- 80 postings, ~47 updated in October 2026. Like VCH it publishes the two-year-old placeholder
-- datePosted, which the connector already replaces with the sitemap date. Branches are named
-- for regions, so "Niagara" is aliased to a city; multi-site postings use the first site.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Trillium Health Partners', 'trillium-health-partners', 'hospital', 'ON', 'Mississauga',
   'https://www.thp.ca', 'oraclecloud',
   '{"key":"thp","host":"iadyup.fa.ocs.oraclecloud.com","site":"CX_4001"}'),
  ('Ontario Health atHome', 'ontario-health-athome', 'home_care', 'ON', 'Toronto',
   'https://ontariohealthathome.ca', 'icims',
   '{"key":"ohah","host":"healthcareathomejobs-en.icims.com","cityAliases":{"Niagara":"St. Catharines"}}')
on conflict (slug) do nothing;
