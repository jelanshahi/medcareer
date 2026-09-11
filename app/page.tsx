import Link from 'next/link';
import { createServerClient } from '@/lib/db/server';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_TYPES, EMPLOYMENT_LABELS } from '@/lib/taxonomy/employment';
import { tally, type FacetRow } from '@/lib/jobs/facets';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { PostedTodayRow, type PostedTodayJob } from '@/components/PostedTodayRow';
import { Stat } from '@/components/Stat';
import { DisciplineTile } from '@/components/DisciplineTile';

export const dynamic = 'force-dynamic';

// Ingestion runs on a fixed 4x/day cadence (.github/workflows/ingest.yml:
// `cron: '0 */6 * * *'`) — a true operational fact, not user data, so it is
// safe to state as a constant rather than derive it from a query.
const REFRESH_CADENCE = '6 hrs';

const OVERVIEW_COLUMNS = 'employer_name,category,city,employment_type';
const TODAY_COLUMNS = 'slug,title,employer_name,city,salary_min,salary_max,salary_period';

type OverviewRow = FacetRow & { employer_name: string };

export default async function HomePage() {
  const db = createServerClient();
  const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

  // One unfiltered fetch of every active job's facet columns drives every
  // stat and tile on this page (employer/category/city breakdowns). Cheap at
  // the current scale (a few hundred rows) and mirrors the same approach
  // used for facet counts on /jobs. If active volume ever nears Postgrest's
  // default 1000-row cap this would need an explicit count query instead.
  const overview = db.from('jobs').select(OVERVIEW_COLUMNS).eq('is_active', true);
  const today = db
    .from('jobs')
    .select(TODAY_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .gte('posted_at', todayStart)
    .order('posted_at', { ascending: false })
    .limit(4);

  // supabase-js resolves { data, error } rather than rejecting on failure;
  // both calls are checked so a real database failure never renders as a
  // quiet "0 jobs" home page.
  const [{ data: overviewRows, error: overviewError }, { data: todayRows, count: todayCount, error: todayError }] =
    await Promise.all([overview, today]);
  if (overviewError) throw overviewError;
  if (todayError) throw todayError;

  const rows = (overviewRows ?? []) as OverviewRow[];
  const totalActive = rows.length;
  const employerNames = [...new Set(rows.map((r) => r.employer_name))].sort();
  const cities = [...new Set(rows.map((r) => r.city))].sort();
  const categoryCounts = tally(rows, 'category');
  const typeCounts = tally(rows, 'employment_type');

  let todayJobs = (todayRows ?? []) as PostedTodayJob[];
  const postedToday = todayCount ?? 0;

  // Honest fallback: never invent postings. If nothing has landed yet today,
  // show the most recent postings instead of an empty panel, with copy that
  // says so rather than implying they are from today.
  if (postedToday === 0) {
    const { data: recentRows, error: recentError } = await db
      .from('jobs')
      .select(TODAY_COLUMNS)
      .eq('is_active', true)
      .order('posted_at', { ascending: false })
      .limit(4);
    if (recentError) throw recentError;
    todayJobs = (recentRows ?? []) as PostedTodayJob[];
  }

  const topCategories = [...CATEGORIES]
    .filter((c) => (categoryCounts[c] ?? 0) > 0)
    .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))
    .slice(0, 2);
  const topType = [...EMPLOYMENT_TYPES]
    .filter((t) => (typeCounts[t] ?? 0) > 0)
    .sort((a, b) => (typeCounts[b] ?? 0) - (typeCounts[a] ?? 0))[0];

  const popularSearches = [
    ...topCategories.map((c) => ({ label: CATEGORY_LABELS[c], href: buildJobsQuery({ category: [c] }) })),
    cities[0] ? { label: cities[0], href: buildJobsQuery({ city: [cities[0]] }) } : null,
    topType ? { label: EMPLOYMENT_LABELS[topType], href: buildJobsQuery({ employment_type: [topType] }) } : null,
  ].filter((x): x is { label: string; href: string } => x !== null);

  const disciplineTiles = [...CATEGORIES]
    .filter((c) => (categoryCounts[c] ?? 0) > 0)
    .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))
    .map((c) => ({ category: c, label: CATEGORY_LABELS[c], count: categoryCounts[c] ?? 0 }));

  const stats = [
    { value: String(totalActive), label: 'active Ontario listings' },
    { value: String(employerNames.length), label: 'hospital networks connected' },
    { value: REFRESH_CADENCE, label: 'between refreshes' },
    { value: '0', label: 'accounts required' },
  ];

  return (
    <>
      <section className="border-b border-[var(--color-rule)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-x-14 gap-y-8 px-4 py-9 sm:px-6 sm:py-14">
          <div className="min-w-0 flex-1 basis-[460px]">
            <div className="inline-flex items-center gap-2 border border-[var(--color-rule)] bg-white px-2.5 py-1 text-[13px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--color-signal)]" aria-hidden="true" />
              Ontario · updated every 6 hours
            </div>

            <h1 className="mt-5 text-balance font-display text-[40px] font-bold uppercase leading-[0.95] tracking-tight sm:text-[64px] lg:text-[74px]">
              Healthcare jobs
              <br />
              across CANADA.
              <br />
              <span className="text-[var(--color-signal)]">One click to apply.</span>
            </h1>

            <form
              method="get"
              action="/jobs"
              className="mt-7 flex flex-wrap border-2 border-[var(--color-ink)] bg-white"
            >
              <div className="flex flex-1 basis-[260px] flex-col border-r border-[var(--color-rule)] px-4 py-3">
                <label htmlFor="hero-q" className="text-xs font-bold uppercase tracking-wider text-[var(--color-slate)]">
                  Role or keyword
                </label>
                <input
                  id="hero-q"
                  name="q"
                  type="search"
                  placeholder="Registered nurse, PSW, MLT…"
                  className="mt-1 border-0 bg-transparent p-0 text-lg outline-offset-4"
                />
              </div>
              <div className="flex flex-1 basis-[180px] flex-col border-r border-[var(--color-rule)] px-4 py-3">
                <label htmlFor="hero-city" className="text-xs font-bold uppercase tracking-wider text-[var(--color-slate)]">
                  City
                </label>
                <select id="hero-city" name="city" className="-ml-0.5 mt-1 border-0 bg-transparent p-0 text-lg">
                  <option value="">All of Ontario</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                type="submit"
                className="border-0 bg-[var(--color-signal)] px-8 font-display text-xl font-bold uppercase tracking-wide text-white hover:bg-[var(--color-signal-hover)]"
              >
                Search
              </button>
            </form>

            {popularSearches.length > 0 && (
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <span className="text-sm text-[var(--color-slate)]">Popular:</span>
                {popularSearches.map((p) => (
                  <Link
                    key={p.label}
                    href={p.href}
                    className="rounded-full border border-[var(--color-rule)] bg-white px-3.5 py-1 text-sm text-[var(--color-ink)] no-underline hover:border-[var(--color-ink)]"
                  >
                    {p.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 basis-[300px] border border-[var(--color-rule)] bg-white">
            <div className="flex items-baseline justify-between border-b border-[var(--color-rule)] px-[18px] py-3.5">
              <span className="font-display text-xl font-bold uppercase tracking-wider">Posted today</span>
              <Link href="/jobs" className="text-sm font-semibold text-[var(--color-signal)]">
                See all {totalActive} jobs
              </Link>
            </div>
            {todayJobs.length > 0 ? (
              todayJobs.map((job) => <PostedTodayRow key={job.slug} job={job} />)
            ) : (
              <p className="px-[18px] py-4 text-[15px] text-[var(--color-slate)]">
                No new postings yet — check back soon.
              </p>
            )}
            {postedToday === 0 && todayJobs.length > 0 && (
              <p className="px-[18px] pt-3 text-sm text-[var(--color-slate)]">
                Nothing new since midnight yet. Here are the most recent postings.
              </p>
            )}
            {employerNames.length > 0 && (
              <p className="px-[18px] py-3.5 text-sm text-[var(--color-slate)]">
                Sources: {employerNames.join(', ')}.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--color-rule)] bg-[var(--color-ink)] text-[var(--color-paper)]">
        <div className="mx-auto grid max-w-[1180px] grid-cols-[repeat(auto-fit,minmax(150px,1fr))] px-4 sm:px-6">
          {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} />)}
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1180px] px-4 py-9 sm:px-6 sm:py-14">
          <h2 className="font-display text-[32px] font-bold uppercase tracking-wide sm:text-[38px]">
            Browse by discipline
          </h2>
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-px border border-[var(--color-rule)] bg-[var(--color-rule)]">
            {disciplineTiles.map((tile) => (
              <DisciplineTile
                key={tile.category}
                href={buildJobsQuery({ category: [tile.category] })}
                label={tile.label}
                count={tile.count}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
