-- Two Ontario hospitals on the new SilkRoad connector (workers/connectors/silkroad.ts): Baycrest
-- and Muskoka Algonquin Healthcare (MAHC). Both run SilkRoad Technology's job board at
-- jobs-ca.silkroad.com.
--
-- Pre-flight rechecked 2026-10-01 with our own User-Agent:
--   robots.txt: Crawl-Delay: 10, disallows only internal asset/Ajax paths -- /MAHC/ and
--   /Baycrest/ are both allowed. (This connector's rate limiter is set to createHostLimiter(10_000)
--   in workers/connectors/silkroad.ts to honour the stated delay.)
--   MAHC:     200 text/html at jobs-ca.silkroad.com/MAHC/MAHCCareers
--   Baycrest: 200 text/html at jobs-ca.silkroad.com/Baycrest/Careers
--
-- Unlike 0024_seed_smartrecruiters_ontario.sql (left inactive because robots.txt blocked it),
-- both rows here go in active directly: robots.txt permits both tenant paths outright.
--
-- Note on page structure (see docs/superpowers/specs/2026-10-01-silkroad-connector-design.md):
-- the two tenants render detail pages two different ways -- Baycrest via a schema.org JobPosting
-- JSON-LD block, MAHC via labelled <h2>/<div> field pairs -- and normalizeSilkRoad() handles both.
--
-- Originally found via docs/research/ontario-hospitals-ats.md's baycrestcareers.silkroad.com
-- entry, which turned out to be a legacy front-door redirecting to a blocked host
-- (baycrest-hospital-openhire.silkroad.com, robots.txt Disallow: /). Baycrest's current presence
-- on jobs-ca.silkroad.com is the one actually used here.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('Baycrest', 'baycrest', 'hospital', 'ON', 'Toronto',
   'https://www.baycrest.org', 'silkroad',
   '{"host":"jobs-ca.silkroad.com","tenant":"Baycrest","boardCode":"Careers"}', true),
  ('Muskoka Algonquin Healthcare', 'muskoka-algonquin-healthcare', 'hospital', 'ON', 'Huntsville',
   'https://www.mahc.ca', 'silkroad',
   '{"host":"jobs-ca.silkroad.com","tenant":"MAHC","boardCode":"MAHCCareers"}', true)
on conflict (slug) do nothing;
