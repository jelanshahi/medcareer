-- Delivery side of the homepage job alerts (migration 0007).

-- Watermark for the digest worker: only jobs posted after this go in the next
-- send. Null until the first digest, when confirmed_at is used instead, so a
-- new subscriber's first email cannot include everything ever posted.
alter table job_alerts add column last_sent_at timestamptz;

create index on job_alerts (last_sent_at) where is_active and confirmed_at is not null;

-- Confirming and unsubscribing both mutate a row, which anon cannot do: its
-- only policy on this table is insert (0007), and the service-role key is
-- confined to workers/ and cannot be imported from app/ (enforced by
-- tests/db/key-isolation.test.ts). These two functions are the whole of what a
-- link in an email may do. They are SECURITY DEFINER, so the RLS bypass is
-- contained inside a body that can only ever act on the single row holding the
-- token — anon still cannot read, update or delete the table at large.
--
-- search_path is pinned empty and every object is schema-qualified: a
-- SECURITY DEFINER function with a mutable search_path can be tricked into
-- resolving `job_alerts` to an attacker-controlled table.

create function public.confirm_job_alert(token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched int;
begin
  -- `and is_active` on purpose: after an unsubscribe, the confirmation link
  -- from the original signup email must not resurrect the subscription.
  -- coalesce keeps the first confirmation time if the link is clicked twice.
  update public.job_alerts
     set confirmed_at = coalesce(confirmed_at, now())
   where unsubscribe_token = token
     and is_active;

  get diagnostics touched = row_count;
  return case when touched = 1 then 'ok' else 'unknown' end;
end;
$$;

create function public.unsubscribe_job_alert(token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched int;
begin
  -- Deliberately idempotent and not conditioned on is_active: clicking
  -- unsubscribe twice should say "unsubscribed" both times, never "bad link".
  update public.job_alerts
     set is_active = false
   where unsubscribe_token = token;

  get diagnostics touched = row_count;
  return case when touched = 1 then 'ok' else 'unknown' end;
end;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- include every unauthenticated role. Take it back, then hand it to anon only.
revoke all on function public.confirm_job_alert(uuid) from public;
revoke all on function public.unsubscribe_job_alert(uuid) from public;
grant execute on function public.confirm_job_alert(uuid) to anon;
grant execute on function public.unsubscribe_job_alert(uuid) to anon;

-- Supabase's database linter flags both functions (0028/0029,
-- "Public Can Execute SECURITY DEFINER Function"). That is expected here and
-- must not be "fixed" by revoking the grant: a link in an email is clicked by
-- someone who is not signed in, and this project has no accounts at all. The
-- exposure is bounded by the argument — each function can only ever touch the
-- one row carrying a 122-bit random token, and neither returns any row data.
