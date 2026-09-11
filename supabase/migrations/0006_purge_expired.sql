-- Reclaim space from jobs the employer has genuinely delisted.
--
-- WHY THE STALENESS CHECK IS NOT OPTIONAL: `dedupe` rebuilds `jobs` from
-- `raw_postings` on every run, and `ingest` re-inserts a raw posting for as long as
-- the employer still lists it. Deleting a job whose posting is still live therefore
-- reclaims nothing -- ingest re-adds it, dedupe recreates the job, expire re-expires
-- it, forever. Only a job whose backing postings have stopped being seen is safe to
-- remove. With the 60-day hard expiry this means the currently-expired-but-still-
-- advertised jobs are deliberately left alone; they are reclaimed once the hospital
-- takes them down.

-- Tombstone so an expired URL can still answer 410 Gone after its row is gone.
-- 410 tells search engines "permanently removed, deindex"; a bare 404 does not, and
-- for a job board living on search traffic that difference is worth one narrow table.
create table if not exists expired_slugs (
  slug       text primary key,
  expired_at timestamptz not null default now()
);

alter table expired_slugs enable row level security;

-- Slugs only -- no titles, employers or descriptions -- so public read is safe and
-- lets the 410 handler answer without the service-role key.
drop policy if exists "expired slugs are publicly readable" on expired_slugs;
create policy "expired slugs are publicly readable"
  on expired_slugs for select using (true);

create or replace function purge_expired_jobs(retention_days int default 30)
returns table (jobs_purged int, raw_postings_purged int)
language plpgsql
security definer
set search_path = public
as $$
declare jp int; rp int;
begin
  create temp table _purge_candidates on commit drop as
    select j.id, j.slug
      from jobs j
     where j.is_active = false
       -- Never purge the RLS sentinel. It is permanently is_active = false by design,
       -- so it matches every other condition here; deleting it would silently make
       -- Task 6's RLS assertions vacuous rather than failing them.
       and j.slug <> 'rls-sentinel-inactive-do-not-delete'
       and not exists (
         select 1
           from job_sources js
           join raw_postings r on r.id = js.raw_posting_id
          where js.job_id = j.id
            and r.last_seen_at > now() - make_interval(days => retention_days)
       );

  insert into expired_slugs (slug)
  select slug from _purge_candidates
  on conflict (slug) do nothing;

  -- Postings first: job_sources cascades from raw_postings, so this also clears the
  -- link rows. Anything still referenced by a job we are keeping is untouched.
  delete from raw_postings r
   where r.id in (
     select js.raw_posting_id
       from job_sources js
       join _purge_candidates p on p.id = js.job_id
   );
  get diagnostics rp = row_count;

  delete from jobs j using _purge_candidates p where j.id = p.id;
  get diagnostics jp = row_count;

  return query select jp, rp;
end;
$$;

-- Same lockdown as expire_stale_jobs: PUBLIC holds EXECUTE by default on a new
-- function and anon inherits PUBLIC, so revoking anon alone would leave this
-- RLS-bypassing, row-deleting function callable by anonymous visitors.
revoke all on function purge_expired_jobs(int) from public;
revoke all on function purge_expired_jobs(int) from anon;
revoke all on function purge_expired_jobs(int) from authenticated;
grant execute on function purge_expired_jobs(int) to service_role;
