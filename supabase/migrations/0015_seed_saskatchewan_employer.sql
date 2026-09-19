-- Saskatchewan: the Saskatchewan Health Authority runs the province's public health system
-- on its own, so this single employer is the whole province — ~2,120 open postings, of which
-- ~1,300 were posted in the last 30 days.
--
-- It hires through Oracle Cloud Recruiting, whose REST API lists 200 requisitions per
-- request, so the whole province costs ~11 list requests plus one call per new posting.
--
-- robots.txt is absent (404, which the robots standard treats as no restrictions) and the
-- site does not block our crawler (checked 19 Sep 2026 — docs/research/canada-health-ats.md).
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Saskatchewan Health Authority', 'saskatchewan-health-authority', 'health_authority', 'SK', 'Saskatoon',
   'https://www.saskhealthauthority.ca', 'oraclecloud',
   '{"key":"sha","host":"emqk.fa.ca3.oraclecloud.com","site":"CX_1001"}')
on conflict (slug) do nothing;
