-- Three more Ontario hospitals on the existing Workday connector (workers/connectors/workday.ts) --
-- no new connector code, just registry rows. Identified in docs/research/ontario-hospitals-ats.md,
-- each confirmed Workday by its careers URL (wd10.myworkdayjobs.com tenant/site pattern):
--   Southlake Regional Health Centre    -> southlake.wd10.myworkdayjobs.com/Southlake
--   St. Joseph's Healthcare Hamilton    -> stjoes.wd10.myworkdayjobs.com/STJOESHAM
--   Peterborough Regional Health Centre -> prhc.wd10.myworkdayjobs.com/PRHC
--
-- Seeded INACTIVE. Every other Workday/iCIMS/etc. employer in this table got a live pre-flight
-- (robots.txt + a real request with our own User-Agent) before going active -- see the Alberta and
-- BC-interior migrations. Network tools were unavailable in the session that wrote this migration,
-- so that check has NOT been done for these three. Do it, then:
--   update employers set is_active = true where slug in (
--     'southlake-regional-health-centre', 'st-josephs-healthcare-hamilton', 'peterborough-regional-health-centre');
--
-- parseDescriptionHeader is a per-employer authoring convention (see workers/connectors/workday.ts) --
-- true only for Scarborough Health Network among current Workday employers. Left false here; flip it
-- only if a fetched detail page shows the same "Job Number: ..." structured header block.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('Southlake Regional Health Centre', 'southlake-regional-health-centre', 'hospital', 'ON', 'Newmarket',
   'https://southlake.ca', 'workday',
   '{"tenant":"southlake","site":"Southlake","host":"southlake.wd10.myworkdayjobs.com","parseDescriptionHeader":false}', false),
  ('St. Joseph''s Healthcare Hamilton', 'st-josephs-healthcare-hamilton', 'hospital', 'ON', 'Hamilton',
   'https://www.stjoes.ca', 'workday',
   '{"tenant":"stjoes","site":"STJOESHAM","host":"stjoes.wd10.myworkdayjobs.com","parseDescriptionHeader":false}', false),
  ('Peterborough Regional Health Centre', 'peterborough-regional-health-centre', 'hospital', 'ON', 'Peterborough',
   'https://www.prhc.on.ca', 'workday',
   '{"tenant":"prhc","site":"PRHC","host":"prhc.wd10.myworkdayjobs.com","parseDescriptionHeader":false}', false)
on conflict (slug) do nothing;
