-- Freshness rules, server-side so the "unseen for 7 days" join never round-trips.
--
-- Numbered 0005, not 0004: 0004_job_dedupe_key.sql took that slot.

create or replace function expire_stale_jobs()
returns table (hard_expired int, unseen_expired int)
language plpgsql
security definer
set search_path = public
as $$
declare h int; u int;
begin
  update jobs set is_active = false, updated_at = now()
   where is_active = true and expires_at <= now();
  get diagnostics h = row_count;

  update jobs j set is_active = false, updated_at = now()
   where j.is_active = true
     and not exists (
       select 1
         from job_sources js
         join raw_postings rp on rp.id = js.raw_posting_id
        where js.job_id = j.id
          and rp.last_seen_at > now() - interval '7 days'
     );
  get diagnostics u = row_count;

  return query select h, u;
end;
$$;

-- Lock down EXECUTE.
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and Supabase's
-- anon role inherits PUBLIC. Revoking from `anon` alone therefore leaves the function
-- callable by anonymous visitors -- and because it is SECURITY DEFINER it runs as its
-- owner and bypasses RLS entirely, so any visitor could deactivate the whole board.
-- PUBLIC is the grant that actually has to go.
revoke all on function expire_stale_jobs() from public;
revoke all on function expire_stale_jobs() from anon;
revoke all on function expire_stale_jobs() from authenticated;
grant execute on function expire_stale_jobs() to service_role;
