-- Quebec's health employers share one WordPress WP Job Manager setup: /poste/{slug} pages, a
-- job_listing sitemap, and JobPosting JSON-LD. Eight sites, ~857 postings, all crawlable, all
-- serving our User-Agent on listing and detail pages (checked 22 Sep 2026).
--
-- Only MUHC is active. The seven Sante Quebec sites link from their footers to the Government
-- of Quebec's copyright policy, which forbids reproducing, storing or publishing its content
-- "sans autorisation prealable" -- and storing a description is precisely what this pipeline
-- does. That is a licence question, not a technical one: the policy's own heading is a
-- "demande d'autorisation de reproduction", so there is a process to ask. Until Sante Quebec
-- answers, those rows exist but are switched off, the way Alberta's are.
--
-- MUHC publishes no terms of use and links only privacy notices, so nothing restricts it.
--
-- To switch the rest on after a yes:
--   update employers set is_active = true where ats_platform = 'wpjobmanager';
--
-- cissslaval runs WordPress core sitemaps rather than Yoast's, hence the sitemapPath override.
insert into employers (name, slug, facility_type, province, default_city, website, ats_platform, ats_config, is_active) values
  ('McGill University Health Centre', 'muhc', 'hospital', 'QC', 'Montréal',
   'https://cusm.ca', 'wpjobmanager',
   '{"key":"muhc","host":"carrieres.cusm.ca"}', true),

  ('Santé Québec – Laval', 'sante-quebec-laval', 'health_authority', 'QC', 'Laval',
   'https://cissslaval.carrieresante.gouv.qc.ca', 'wpjobmanager',
   '{"key":"laval","host":"cissslaval.carrieresante.gouv.qc.ca","sitemapPath":"/wp-sitemap-posts-job_listing-1.xml"}', false),

  ('Santé Québec – Laurentides', 'sante-quebec-laurentides', 'health_authority', 'QC', 'Saint-Jérôme',
   'https://laurentides.carrieresante.gouv.qc.ca', 'wpjobmanager',
   '{"key":"laurentides","host":"laurentides.carrieresante.gouv.qc.ca"}', false),

  ('Santé Québec – Capitale-Nationale', 'sante-quebec-capitale-nationale', 'health_authority', 'QC', 'Québec',
   'https://cn.carrieresante.gouv.qc.ca', 'wpjobmanager',
   '{"key":"capitale-nationale","host":"cn.carrieresante.gouv.qc.ca"}', false),

  ('Santé Québec – Chaudière-Appalaches', 'sante-quebec-chaudiere-appalaches', 'health_authority', 'QC', 'Lévis',
   'https://cisssca.carrieresante.gouv.qc.ca', 'wpjobmanager',
   '{"key":"chaudiere-appalaches","host":"cisssca.carrieresante.gouv.qc.ca"}', false),

  ('Santé Québec – Lanaudière', 'sante-quebec-lanaudiere', 'health_authority', 'QC', 'Joliette',
   'https://lanaudiere.carrieresante.gouv.qc.ca', 'wpjobmanager',
   '{"key":"lanaudiere","host":"lanaudiere.carrieresante.gouv.qc.ca"}', false),

  ('Santé Québec – Bas-Saint-Laurent', 'sante-quebec-bas-saint-laurent', 'health_authority', 'QC', 'Rimouski',
   'https://emplois.cisssbsl.com', 'wpjobmanager',
   '{"key":"bas-saint-laurent","host":"emplois.cisssbsl.com"}', false),

  ('CHU de Québec – Université Laval', 'chu-de-quebec', 'hospital', 'QC', 'Québec',
   'https://chudequebec.carrieresante.gouv.qc.ca', 'wpjobmanager',
   '{"key":"chu-de-quebec","host":"chudequebec.carrieresante.gouv.qc.ca"}', false)
on conflict (slug) do nothing;
