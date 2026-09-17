-- British Columbia and three more Ontario hospitals, all on iCIMS.
--
-- Fraser Health is reached through its public Jibe board (jobs.fraserhealth.ca) rather than
-- its iCIMS portal: careers-fraserhealth.icims.com disallows crawling in robots.txt, while
-- the board allows it and asks for one request every 5 seconds, which the connector honours.
-- The other four are iCIMS portals whose robots.txt allows crawling and whose sitemaps list
-- every open posting.
--
-- cityAliases maps the grouped location names these boards use onto one real city;
-- default_city is the fallback when a posting names no location at all.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Fraser Health', 'fraser-health', 'health_authority', 'BC', 'Surrey',
   'https://www.fraserhealth.ca', 'jibe',
   '{"key":"fraserhealth","host":"jobs.fraserhealth.ca","cityAliases":{
      "Tri-Cities / Coquitlam / Port Coquitlam / Port Moody":"Coquitlam",
      "Maple Ridge / Pitt Meadows":"Maple Ridge",
      "Hope / Agassiz / Harrison Hot Springs / Kent":"Hope",
      "Bella Bella / Bella Coola":"Bella Bella"}}'),

  ('Vancouver Coastal Health', 'vancouver-coastal-health', 'health_authority', 'BC', 'Vancouver',
   'https://www.vch.ca', 'icims',
   '{"key":"vch","host":"careers-vch.icims.com"}'),

  ('Humber River Health', 'humber-river-health', 'hospital', 'ON', 'Toronto',
   'https://www.hrh.ca', 'icims',
   '{"key":"hrrh","host":"careersen-hrrh.icims.com","cityAliases":{"Greater Toronto":"Toronto"}}'),

  ('Mackenzie Health', 'mackenzie-health', 'hospital', 'ON', 'Richmond Hill',
   'https://www.mackenziehealth.ca', 'icims',
   '{"key":"mackenzie","host":"employment-mackenziehealth.icims.com"}'),

  ('Cambridge Memorial Hospital', 'cambridge-memorial-hospital', 'hospital', 'ON', 'Cambridge',
   'https://www.cmh.org', 'icims',
   '{"key":"cmh","host":"encareers-cmh.icims.com"}')
on conflict (slug) do nothing;
