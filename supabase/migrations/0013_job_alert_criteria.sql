-- Lets a subscriber choose what they are alerted on, instead of only ever
-- getting "All healthcare roles" (request_job_alert, migration 0009). The
-- city and category columns and the (email, city, category) unique index have
-- existed since job_alerts was created (0007) for exactly this; only the
-- signup path never accepted them.
--
-- Function signatures are matched by argument types in Postgres, so adding
-- parameters means dropping the old one rather than replacing it in place —
-- otherwise both the 2-arg and 4-arg versions would exist at once and
-- supabase-js would have no reliable way to pick one.
drop function public.request_job_alert(text, uuid);

create function public.request_job_alert(
  p_email text,
  p_token uuid,
  p_city text default null,
  p_category text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.job_alerts%rowtype;
  throttle constant interval := interval '10 minutes';
  -- This function is directly callable by anon (it must be — see 0009's
  -- note on the linter warning), so it is the only thing standing between
  -- that open RPC and junk criteria, not just the form's own validation.
  -- '' and whitespace collapse to "no preference", matching how a blank
  -- <select> should behave. category is checked against the taxonomy
  -- (lib/taxonomy/categories.ts) below and silently downgraded rather than
  -- erroring — an unrecognised value becomes "all disciplines" instead of
  -- failing the whole signup. city has no fixed table to check against (the
  -- set of cities grows as new employers are added) and is left as free
  -- text, capped in length; a bogus value simply never matches a job, which
  -- is self-limiting rather than a security concern.
  v_city text := nullif(btrim(p_city), '');
  v_category text := nullif(btrim(p_category), '');
begin
  p_email := lower(btrim(p_email));

  if v_city is not null and length(v_city) > 100 then
    v_city := null;
  end if;

  if v_category is not null and v_category not in (
    'nursing', 'physicians', 'allied_health', 'mental_health', 'support_care',
    'paramedics', 'diagnostics_lab', 'pharmacy', 'admin_clerical', 'management', 'research'
  ) then
    v_category := null;
  end if;

  -- `is not distinct from` rather than `=`, so two NULLs (the "all
  -- roles/all cities" subscription) still count as a match — plain `=`
  -- never equates NULL to NULL and would insert a duplicate every time.
  select * into existing
    from public.job_alerts
   where lower(email) = p_email
     and city is not distinct from v_city
     and category is not distinct from v_category
   limit 1;

  if not found then
    insert into public.job_alerts (email, city, category, unsubscribe_token, confirmation_sent_at)
    values (p_email, v_city, v_category, p_token, now());
    return 'send';
  end if;

  -- Already subscribed to this exact criteria set and confirmed: nothing to
  -- do, and no second email. A different criteria set for the same address
  -- is a different row (the unique index is on the triple), so someone can
  -- hold more than one alert — e.g. "Nursing anywhere" and "any role in
  -- Hamilton" — and gets a separate digest for each that matches.
  if existing.is_active and existing.confirmed_at is not null then
    return 'confirmed';
  end if;

  if existing.confirmation_sent_at is not null
     and existing.confirmation_sent_at > now() - throttle then
    return 'throttled';
  end if;

  update public.job_alerts
     set unsubscribe_token    = p_token,
         confirmation_sent_at = now(),
         is_active            = true,
         confirmed_at         = null
   where id = existing.id;

  return 'send';
end;
$$;

revoke all on function public.request_job_alert(text, uuid, text, text) from public;
grant execute on function public.request_job_alert(text, uuid, text, text) to anon;
