create extension if not exists pgcrypto;

create table employers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  facility_type text,
  province      text not null,
  default_city  text not null,
  website       text,
  ats_platform  text,
  ats_config    jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table raw_postings (
  id            uuid primary key default gen_random_uuid(),
  source_id     text not null,
  source_job_id text not null,
  source_url    text not null,
  payload       jsonb not null,
  normalized    jsonb not null,
  content_hash  text not null,
  fingerprint   text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source_id, source_job_id)
);
create index on raw_postings (fingerprint);
create index on raw_postings (last_seen_at);

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  fingerprint      text not null unique,
  title            text not null,
  employer_id      uuid references employers(id),
  employer_name    text not null,
  facility_name    text,
  description      text not null,
  city             text not null,
  province         text not null,
  latitude         double precision,
  longitude        double precision,
  noc_code         text,
  category         text,
  employment_type  text,
  shift_type       text,
  salary_min       numeric,
  salary_max       numeric,
  salary_period    text,
  apply_url        text not null,
  canonical_source text not null,
  posted_at        timestamptz not null,
  closes_at        timestamptz,
  expires_at       timestamptz not null,
  is_active        boolean not null default true,
  search_vector    tsvector generated always as (
                     setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                     setweight(to_tsvector('english', coalesce(employer_name,'')), 'B') ||
                     setweight(to_tsvector('english', coalesce(description,'')), 'C')
                   ) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on jobs using gin (search_vector);
create index on jobs (province, category, is_active, posted_at desc);
create index on jobs (is_active, posted_at desc);
create index on jobs (is_active, city);

create table job_sources (
  job_id         uuid references jobs(id) on delete cascade,
  raw_posting_id uuid references raw_postings(id) on delete cascade,
  primary key (job_id, raw_posting_id)
);

create table ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  source_id   text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null,
  fetched     int default 0,
  inserted    int default 0,
  updated     int default 0,
  error       text
);
