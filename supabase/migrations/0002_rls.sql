alter table employers    enable row level security;
alter table raw_postings enable row level security;
alter table jobs         enable row level security;
alter table job_sources  enable row level security;
alter table ingest_runs  enable row level security;

create policy "anon reads active jobs"
  on jobs for select
  to anon
  using (is_active = true);
