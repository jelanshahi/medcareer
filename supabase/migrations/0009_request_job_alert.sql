-- Signup goes through a function instead of a direct insert (0007).
--
-- Double opt-in needs the row's token to put in the confirmation email, and
-- anon cannot read this table — it has no select policy and must not have one,
-- since that key ships to every browser. Handing the token back to the caller
-- is not an option either: anyone could then submit a stranger's address, take
-- the token from the reply and confirm the subscription themselves, which is
-- precisely the consent check double opt-in exists to enforce.
--
-- So the caller generates the token, passes it in, and learns only a coarse
-- status. The token never travels back out of the database.

alter table job_alerts add column confirmation_sent_at timestamptz;

create function public.request_job_alert(p_email text, p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.job_alerts%rowtype;
  -- A retry inside this window sends nothing, so the form cannot be used to
  -- mail-bomb an address by submitting it over and over.
  throttle constant interval := interval '10 minutes';
begin
  p_email := lower(btrim(p_email));

  select * into existing
    from public.job_alerts
   where lower(email) = p_email
     and city is null
     and category is null
   limit 1;

  if not found then
    insert into public.job_alerts (email, unsubscribe_token, confirmation_sent_at)
    values (p_email, p_token, now());
    return 'send';
  end if;

  -- Already subscribed and confirmed: nothing to do, and no second email.
  if existing.is_active and existing.confirmed_at is not null then
    return 'confirmed';
  end if;

  if existing.confirmation_sent_at is not null
     and existing.confirmation_sent_at > now() - throttle then
    return 'throttled';
  end if;

  -- Unconfirmed, or previously unsubscribed and signing up again. Re-issue the
  -- token so the newest email is the only one that works, and clear any earlier
  -- confirmation so a resubscribe still has to be confirmed.
  update public.job_alerts
     set unsubscribe_token    = p_token,
         confirmation_sent_at = now(),
         is_active            = true,
         confirmed_at         = null
   where id = existing.id;

  return 'send';
end;
$$;

revoke all on function public.request_job_alert(text, uuid) from public;
grant execute on function public.request_job_alert(text, uuid) to anon;

-- With signup behind the function, anon no longer needs to write the table
-- directly, and the open insert policy from 0007 was the one piece of surface
-- that let it create arbitrary rows. Dropping it leaves anon with no
-- table-level access to job_alerts at all: every path in and out is now a
-- function that constrains what it will do.
drop policy "anon creates job alerts" on job_alerts;
