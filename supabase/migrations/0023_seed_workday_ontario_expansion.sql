-- Three more Ontario hospitals on the existing Workday connector (workers/connectors/workday.ts) --
-- no new connector code, just registry rows. Identified in docs/research/ontario-hospitals-ats.md,
-- each confirmed Workday by its careers URL (wd10.myworkdayjobs.com tenant/site pattern).
--
-- Pre-flight checked 29 Sep 2026 with our own User-Agent:
--   Southlake Regional Health Centre -> robots.txt allows /Southlake/, jobs API answers normally.
--   St. Joseph's Healthcare Hamilton -> robots.txt allows /STJOESHAM/, jobs API answers normally.
-- Both seeded ACTIVE.
--
-- Peterborough Regional Health Centre is seeded INACTIVE and stays that way: its robots.txt is
--   User-agent: *
--   Disallow: /PRHC/
-- which disallows the entire path job postings live under, even though the jobs API itself answers
-- the request without any bot-block. Per this project's crawling rules (see
-- docs/superpowers/specs/2026-09-08-careportal-phase-1-design.md §3.2, "respect robots.txt"),
-- disallowed-but-technically-reachable is treated the same as blocked -- same category as Island
-- Health / PHSA in docs/research/canada-health-ats.md. Do not activate this row without PRHC's
-- explicit permission (see the Quebec/Santé Québec migration for the licence-request pattern).
--
-- parseDescriptionHeader is the SHN-only authoring convention (plaintext "Job Number: ..." /
-- "Union: ..." / "Hours: ..." lines, see workers/connectors/workday.ts). Checked both live detail
-- pages: Southlake's header fields are HTML-separated by empty <h3></h3> tags, not the SHN
-- plaintext-with-&#xa;-newlines format, and St. Joseph's wraps each label in <p><b>...</b></p>
-- rather than putting the value on the same line. Neither matches the SHN regexes (confirmed:
-- turning the flag on would be a harmless no-op, not a working parse), so both stay false.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('Southlake Regional Health Centre', 'southlake-regional-health-centre', 'hospital', 'ON', 'Newmarket',
   'https://southlake.ca', 'workday',
   '{"tenant":"southlake","site":"Southlake","host":"southlake.wd10.myworkdayjobs.com","parseDescriptionHeader":false}', true),
  ('St. Joseph''s Healthcare Hamilton', 'st-josephs-healthcare-hamilton', 'hospital', 'ON', 'Hamilton',
   'https://www.stjoes.ca', 'workday',
   '{"tenant":"stjoes","site":"STJOESHAM","host":"stjoes.wd10.myworkdayjobs.com","parseDescriptionHeader":false}', true),
  ('Peterborough Regional Health Centre', 'peterborough-regional-health-centre', 'hospital', 'ON', 'Peterborough',
   'https://www.prhc.on.ca', 'workday',
   '{"tenant":"prhc","site":"PRHC","host":"prhc.wd10.myworkdayjobs.com","parseDescriptionHeader":false}', false)
on conflict (slug) do nothing;
