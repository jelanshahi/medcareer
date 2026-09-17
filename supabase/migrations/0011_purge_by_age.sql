-- Delete jobs outright at 60 days, instead of keeping expired rows around.
--
-- 0006_purge_expired.sql deliberately refused to delete a job the employer still lists,
-- because ingest would re-add it on the next run and the deletion would reclaim nothing.
-- That is no longer true: the crawlers now skip any posting older than 30 days that they
-- have not already stored (workers/run.ts MAX_AGE_DAYS), so a 60-day-old job cannot come
-- back. Deleting on age is therefore stable, and the storage is actually reclaimed.
--
-- Two ways a job leaves:
--   * it turns `max_age_days` old, whether or not the employer still lists it;
--   * the employer took it down and it has gone `retention_days` unseen.
create or replace function purge_jobs(max_age_days int default 60, retention_days int default 7)
returns table (jobs_purged int, raw_postings_purged int)
language plpgsql
security definer
set search_path = public
as $$
declare jp int; rp int; orphans int;
begin
  create temp table _purge_candidates on commit drop as
    select j.id, j.slug
      from jobs j
     -- Never purge the RLS sentinel: it is permanently is_active = false by design, so it
     -- matches the unseen branch below, and deleting it would make the RLS tests vacuous.
     where j.slug <> 'rls-sentinel-inactive-do-not-delete'
       and (
         j.posted_at < now() - make_interval(days => max_age_days)
         or (
           j.is_active = false
           and not exists (
             select 1
               from job_sources js
               join raw_postings r on r.id = js.raw_posting_id
              where js.job_id = j.id
                and r.last_seen_at > now() - make_interval(days => retention_days)
           )
         )
       );

  -- Tombstone so the URL can answer 410 Gone rather than a bare 404: 410 tells search
  -- engines the posting is permanently gone and should be deindexed.
  insert into expired_slugs (slug)
  select slug from _purge_candidates
  on conflict (slug) do nothing;

  -- Postings first: job_sources cascades from raw_postings, so this clears the link rows.
  delete from raw_postings r
   where r.id in (
     select js.raw_posting_id
       from job_sources js
       join _purge_candidates p on p.id = js.job_id
   );
  get diagnostics rp = row_count;

  delete from jobs j using _purge_candidates p where j.id = p.id;
  get diagnostics jp = row_count;

  -- A raw posting whose job has already gone (or that never produced one) is invisible to
  -- the join above and would otherwise sit in the table forever.
  delete from raw_postings r
   where not exists (select 1 from job_sources js where js.raw_posting_id = r.id)
     and r.last_seen_at < now() - make_interval(days => retention_days);
  get diagnostics orphans = row_count;

  return query select jp, rp + orphans;
end;
$$;

-- Same lockdown as the function it replaces: PUBLIC holds EXECUTE by default on a new
-- function and anon inherits PUBLIC, so revoking anon alone would leave this
-- RLS-bypassing, row-deleting function callable by anonymous visitors.
revoke all on function purge_jobs(int, int) from public;
revoke all on function purge_jobs(int, int) from anon;
revoke all on function purge_jobs(int, int) from authenticated;
grant execute on function purge_jobs(int, int) to service_role;

-- purge_expired_jobs() is deliberately left in place: it is what the currently deployed
-- worker calls, and dropping it here would break the scheduled run in the window between
-- this migration and the deploy that switches to purge_jobs(). Drop it in a later migration.
