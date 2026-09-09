insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config) values
  ('Scarborough Health Network', 'scarborough-health-network', 'hospital', 'ON', 'Toronto',
   'https://www.shn.ca', 'workday',
   '{"tenant":"shn","site":"SHN_External_Career_Site","host":"shn.wd10.myworkdayjobs.com","parseDescriptionHeader":true}'),
  ('Children''s Hospital of Eastern Ontario', 'cheo', 'hospital', 'ON', 'Ottawa',
   'https://www.cheo.on.ca', 'workday',
   '{"tenant":"cheo","site":"External_Site","host":"cheo.wd10.myworkdayjobs.com","parseDescriptionHeader":false}'),
  ('Oak Valley Health', 'oak-valley-health', 'hospital', 'ON', 'Markham',
   'https://www.oakvalleyhealth.ca', 'workday',
   '{"tenant":"oakvalleyhealth","site":"OakValleyHealth","host":"oakvalleyhealth.wd10.myworkdayjobs.com","parseDescriptionHeader":false}');
