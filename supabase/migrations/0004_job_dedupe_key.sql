-- Separate a job's IDENTITY from its cross-source MATCH key.
--
-- 0001 made jobs.fingerprint unique, which assumed one job per
-- (title, employer, city, province). Real data falsified that: the first live
-- ingest found 9 fingerprints covering 11 distinct requisitions, all WITHIN a
-- single hospital -- e.g. SHN had three concurrent "Primary Care Physician -
-- Interprofessional Primary Care Team (IPCT) CEN" openings (JR106052, JR106062,
-- JR106765) and Oak Valley had two consecutive ER nurse reqs (JR103356, JR103357).
-- Collapsing those hid real vacancies and dropped two of every three apply links.
--
-- fingerprint keeps its real job: matching the SAME posting across DIFFERENT
-- sources (Workday and Job Bank in Phase 2). It therefore must NOT be unique --
-- several requisitions can legitimately share one. dedupe_key is the per-job
-- identity and carries the uniqueness instead.

alter table jobs add column dedupe_key text;

-- Backfill: before this migration one job == one fingerprint, so they coincide.
update jobs set dedupe_key = fingerprint where dedupe_key is null;

alter table jobs alter column dedupe_key set not null;
alter table jobs add constraint jobs_dedupe_key_key unique (dedupe_key);

-- Drop uniqueness from fingerprint but keep it indexed: Phase 2 cross-source
-- matching looks jobs up by it.
alter table jobs drop constraint jobs_fingerprint_key;
create index on jobs (fingerprint);
