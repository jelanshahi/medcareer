-- Email alert signups from the homepage form (app/page.tsx).
--
-- Criteria are nullable and currently always null: the form offers one
-- subscription, "All healthcare roles · Ontario". They exist as columns rather
-- than a jsonb blob so the eventual matching query can index them.
create table job_alerts (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  city              text,
  category          text,
  unsubscribe_token uuid not null default gen_random_uuid(),
  is_active         boolean not null default true,
  -- Reserved for double opt-in. Nothing sets it yet; no mail is sent until a
  -- delivery provider is wired up, so no row is confirmed.
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),

  -- The insert policy below is open to anon by necessity (the form is public
  -- and unauthenticated), so the column constraints are the only thing
  -- standing between that policy and arbitrary junk.
  constraint job_alerts_email_shape check (
    email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    and length(email) <= 254
  )
);

-- One subscription per address per criteria set, case-insensitively: nobody
-- expects Foo@x.com and foo@x.com to be two separate alerts.
create unique index job_alerts_email_criteria_key
  on job_alerts (lower(email), coalesce(city, ''), coalesce(category, ''));

create index on job_alerts (created_at);

alter table job_alerts enable row level security;

-- Insert-only for anon: the public form has to create a row and must do
-- nothing else. There is deliberately NO select policy — these are real email
-- addresses, RLS denies by default, and the anon key ships to every browser,
-- so the list cannot be read back with it. Workers read it with the
-- service-role key, which bypasses RLS.
create policy "anon creates job alerts"
  on job_alerts for insert
  to anon
  with check (true);
