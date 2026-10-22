-- The /jobs "newest" order, with employers interleaved within each day.
--
-- Sorting on posted_at alone filled page one with a single employer: the Saskatchewan Health
-- Authority is a third of all active jobs, posts 150-200 on a busy day, and its dates carry
-- 06:00 UTC (midnight in Saskatchewan) where most sources store a bare date as 00:00 UTC, so
-- every SHA posting outranked every other posting from the same day. On 22 Oct 2026 the first
-- 25 results were all SHA.
--
-- This view keeps newest-first by day, and within a day takes one posting from each employer
-- in turn: each employer's newest of the day, then each one's second, and so on. Nothing is
-- dropped or moved to another day; a busy employer's extra postings come later in that day.
--
-- The rank is computed over all active jobs before any filter applies, so a filtered list
-- (one city, one discipline) keeps the same relative order with gaps in the ranks, which
-- still alternates employers.
--
-- security_invoker: the view reads jobs as the caller, so the "anon reads active jobs" policy
-- still applies. Without it a view runs as its owner and would bypass row level security.
create view jobs_feed with (security_invoker = true) as
select
  j.*,
  (j.posted_at at time zone 'UTC')::date as posted_day,
  row_number() over (
    partition by j.employer_name, (j.posted_at at time zone 'UTC')::date
    order by j.posted_at desc, j.id
  ) as employer_day_rank
from jobs j
where j.is_active;

grant select on jobs_feed to anon, authenticated;
