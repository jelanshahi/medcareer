-- SE Health (home care, nursing, PSW, rehab; Ontario and Alberta) on the new connector
-- workers/connectors/sehc.ts. ~311 open postings on careers.sehc.com, the largest home-care
-- employer reachable without a new platform.
--
-- Seeded INACTIVE, and it stays that way until SE Health agrees. Pre-flight on 2 Oct 2026:
--   robots.txt   "User-agent: * / Disallow:" (allows everything) and names a sitemap. Fine.
--   Our User-Agent is served normally on the list and on posting pages, which carry real
--   datePosted values, so this is not a permission problem on paper.
--   BUT, after about 350 requests in half an hour from one address (a full crawl of the 33
--   list pages plus ~100 posting pages, run a few times while building the connector), the
--   host's F5 WAF began answering EVERY request, with a browser User-Agent too, with HTTP 200
--   and a CAPTCHA page: "Validation needed due to the detection of invalid input from this
--   client IP address, error code 338". Same category as Njoyn and Alberta in
--   docs/research/canada-health-ats.md. A production first run is the same size, and we do not
--   disguise the crawler, so it is treated as blocked rather than risked.
--
-- To reconsider: ask SE Health to allowlist the crawler (it identifies itself as MedCareerBot),
-- then:  update employers set is_active = true where slug = 'se-health';
-- Re-check from a clean address first; the block may have been triggered by testing volume.
--
-- If it is enabled, the workflow already sets NODE_EXTRA_CA_CERTS (see .github/workflows/
-- ingest.yml): the host serves an incomplete certificate chain, which Node cannot verify.
--
-- default_city is only a fallback: every posting names its own city and province, including
-- Alberta ones, and a handful say just "Ontario".
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('SE Health', 'se-health', 'home_care', 'ON', 'Markham',
   'https://www.sehc.com', 'sehc',
   '{"key":"sehc","host":"careers.sehc.com"}', false)
on conflict (slug) do nothing;
