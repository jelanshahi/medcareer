import Link from 'next/link';
import { createServerClient } from '@/lib/db/server';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_TYPES, EMPLOYMENT_LABELS } from '@/lib/taxonomy/employment';
import { tally, type FacetRow } from '@/lib/jobs/facets';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { PostedTodayCard, type PostedTodayJob } from '@/components/PostedTodayCard';
import { Stat } from '@/components/Stat';
import { DisciplineTile } from '@/components/DisciplineTile';
import { EYEBROW, FIELD, H2, PILL_OUTLINE, PILL_PRIMARY, SECTION } from '@/lib/ui/styles';

export const dynamic = 'force-dynamic';

// Ingestion runs on a fixed 4x/day cadence (.github/workflows/ingest.yml:
// `cron: '0 */6 * * *'`) — a true operational fact, not user data, so it is
// safe to state as a constant rather than derive it from a query.
const REFRESH_CADENCE = '6 hrs';

const OVERVIEW_COLUMNS = 'employer_name,category,city,employment_type';
const TODAY_COLUMNS = 'slug,title,employer_name,city,category,salary_min,salary_max,salary_period';

type OverviewRow = FacetRow;

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
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[820px] px-[22px] pb-[clamp(40px,6vw,64px)] pt-[clamp(56px,9vw,96px)]">
          <div className={EYEBROW}>Ontario · updated every 6 hours</div>
          <h1 className="mt-1.5 text-balance text-[clamp(38px,6.4vw,64px)] font-semibold leading-[1.06] tracking-[-0.025em]">
            Healthcare jobs across CANADA.
            <br />
            One click to apply.
          </h1>
          <p className="mx-auto mt-3.5 max-w-[30em] text-pretty text-[clamp(19px,2.4vw,25px)] leading-[1.32] tracking-[-0.015em] text-[var(--color-slate)]">
            Pulled straight from hospital career systems. Every listing applies on the employer&rsquo;s
            own page — no account, no résumé upload.
          </p>

          <div className="mt-5.5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/jobs" className={PILL_PRIMARY}>Browse {totalActive} open jobs</Link>
          </div>

          <form
            method="get"
            action="/jobs"
            className="mx-auto mt-8.5 flex max-w-[660px] flex-wrap gap-2 rounded-[18px] bg-[var(--color-canvas)] p-2.5 text-left"
          >
            <div className={`${FIELD} flex basis-full items-center gap-2.5 py-0`}>
              <span aria-hidden="true" className="text-[15px] text-[var(--color-meta)]">⌕</span>
              <label htmlFor="hero-q" className="sr-only">Role or keyword</label>
              <input
                id="hero-q"
                name="q"
                type="search"
                placeholder="Registered nurse, PSW, MLT…"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[17px] outline-offset-[6px]"
              />
            </div>
            <label htmlFor="hero-city" className="sr-only">City</label>
            <select id="hero-city" name="city" className={`${FIELD} flex-1 basis-[150px]`}>
              <option value="">All of Ontario</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" className={`${PILL_PRIMARY} flex-1 basis-[130px] rounded-xl`}>
              Search
            </button>
          </form>

          {popularSearches.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-sm text-[var(--color-meta)]">Popular:</span>
              {popularSearches.map((p) => (
                <Link key={p.label} href={p.href} className={PILL_OUTLINE}>{p.label}</Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-3.5">
          <h2 className={`m-0 ${H2}`}>Posted today</h2>
          <Link href="/jobs" className="text-[17px]">See all {totalActive} jobs ›</Link>
        </div>
        {todayJobs.length > 0 ? (
          <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3.5">
            {todayJobs.map((job) => <PostedTodayCard key={job.slug} job={job} />)}
          </div>
        ) : (
          <p className="mt-4.5 text-[17px] text-[var(--color-slate)]">
            No new postings yet — check back soon.
          </p>
        )}
        {postedToday === 0 && todayJobs.length > 0 && (
          <p className="mt-3.5 text-[15px] text-[var(--color-slate)]">
            Nothing new since midnight yet. These are the most recent postings.
          </p>
        )}
      </section>

      <section className={SECTION}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-7 rounded-[18px] bg-[var(--color-ink)] p-[clamp(28px,4vw,44px)] text-[var(--color-canvas)]">
          {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} />)}
        </div>
      </section>

      <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
        <h2 className={`m-0 ${H2}`}>Browse by discipline</h2>
        <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {disciplineTiles.map((tile) => (
            <DisciplineTile
              key={tile.category}
              href={buildJobsQuery({ category: [tile.category] })}
              label={tile.label}
              count={tile.count}
            />
          ))}
        </div>
      </section>
    </>
  );
}
