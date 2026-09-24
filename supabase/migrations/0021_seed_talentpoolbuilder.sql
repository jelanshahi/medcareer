-- TalentPoolBuilder (NetHire's ATS), the largest reachable Ontario cluster now that njoyn is
-- blocked. Five of the six hospitals the research file lists are seeded; Lake of the Woods
-- District Hospital is not, because its board carries no jobs widget at all -- the page has no
-- jobsController, so there is nothing to list.
--
-- cpId, brands and type are per tenant and come from a multi-line ng-init on the board's jobs
-- widget. `brands` is the one that actually selects the postings: without it the API answers
-- {"result":true,"jobs":[]}, a success with nothing in it, which reads like an employer with no
-- openings rather than like a bad request. A multi-site tenant lists several brand ids.
--
-- Checked 24 Sep 2026: no tenant serves a robots.txt (all answer with HTML), ats.nethire.com
-- likewise, and nethire.com itself is "Allow: /". No terms of use are published to visitors.
-- Repeat requests to both the list API and a detail page were served normally.
--
-- Open postings when checked: Providence Care 83, Windsor Regional 54, Hopital Montfort 41,
-- Georgian Bay 31, Guelph General 26 -- 235 in total, of which the 30-day window admits fewer
-- (Windsor keeps postings open a long time: 6 of its 54 were within the window).
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Providence Care', 'providence-care', 'hospital', 'ON', 'Kingston',
   'https://providencecare.ca', 'talentpoolbuilder',
   '{"key":"providencecare","host":"providencecare.talentpoolbuilder.com","cpId":"268","brands":"1883, 1973, 1974, 1975, 1976, 2199","type":"Public"}'),

  ('Windsor Regional Hospital', 'windsor-regional-hospital', 'hospital', 'ON', 'Windsor',
   'https://www.wrh.on.ca', 'talentpoolbuilder',
   '{"key":"wrh","host":"wrh.talentpoolbuilder.com","cpId":"369","brands":"114","type":"Public"}'),

  ('Hôpital Montfort', 'hopital-montfort', 'hospital', 'ON', 'Ottawa',
   'https://www.hopitalmontfort.com', 'talentpoolbuilder',
   '{"key":"montfort","host":"hopitalmontfort.talentpoolbuilder.com","cpId":"412","brands":"3308, 3325, 3741","type":"Public"}'),

  ('Georgian Bay General Hospital', 'georgian-bay-general-hospital', 'hospital', 'ON', 'Midland',
   'https://www.gbgh.on.ca', 'talentpoolbuilder',
   '{"key":"gbgh","host":"gbgh.talentpoolbuilder.com","cpId":"381","brands":"3048, 3060","type":"Public"}'),

  ('Guelph General Hospital', 'guelph-general-hospital', 'hospital', 'ON', 'Guelph',
   'https://www.gghorg.ca', 'talentpoolbuilder',
   '{"key":"guelphgeneral","host":"guelphgeneralhospital.talentpoolbuilder.com","cpId":"265","brands":"1886, 2126","type":"Public"}')
on conflict (slug) do nothing;
