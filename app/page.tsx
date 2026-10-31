import Link from 'next/link';
import { createServerClient } from '@/lib/db/server';
import { selectAll } from '@/lib/db/select-all';
import { groupCitiesByProvince, regionName } from '@/lib/provinces';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { formatSalary, postedAgo } from '@/lib/format';
import { HeroLatestPostings, PinIcon, type HeroPosting } from '@/components/HeroLatestPostings';
import { RecentTicker } from '@/components/RecentTicker';
import { EMPLOYMENT_TYPES, EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { tally, type FacetRow } from '@/lib/jobs/facets';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { PostedTodayCard, type PostedTodayJob } from '@/components/PostedTodayCard';
import { Stat } from '@/components/Stat';
import { DisciplineTile } from '@/components/DisciplineTile';
import { JobAlertForm } from '@/components/JobAlertForm';
import { H2, SECTION } from '@/lib/ui/styles';
import { SITE } from '@/lib/site';
import { HOME_DESCRIPTION, pageMeta } from '@/lib/seo';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { countBy } from '@/lib/jobs/catalog';
import { provinceName } from '@/lib/provinces';
import { JsonLd } from '@/components/JsonLd';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: `${SITE.name} — ${SITE.tagline}`,
  description: HOME_DESCRIPTION,
  path: '/',
});

// Ingestion runs on a fixed 4x/day cadence (.github/workflows/ingest.yml:
// `cron: '0 */6 * * *'`) — a true operational fact, not user data, so it is
// safe to state as a constant rather than derive it from a query.
const REFRESH_CADENCE = '6 hrs';

const OVERVIEW_COLUMNS = 'employer_name,category,city,province,employment_type';
const TODAY_COLUMNS = 'slug,title,employer_name,city,category,salary_min,salary_max,salary_period';

type OverviewRow = FacetRow & { province: string };

export default async function HomePage() {
  const db = createServerClient();
  const todayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

  // One unfiltered fetch of every active job's facet columns drives every
  // stat and tile on this page (employer/category/city breakdowns), the same
  // approach used for facet counts on /jobs. Paged: the active set is past
  // PostgREST's 1000-row cap, and an unpaged read would quietly stop there.
  const overview = selectAll<OverviewRow>((from, to) =>
    db.from('jobs').select(OVERVIEW_COLUMNS).eq('is_active', true).order('id').range(from, to),
  );
  const today = db
    .from('jobs')
    .select(TODAY_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .gte('posted_at', todayStart)
    .order('posted_at', { ascending: false })
    .limit(4);

  // supabase-js resolves { data, error } rather than rejecting on failure;
  // both calls are checked so a real database failure never renders as a
  // quiet "0 jobs" home page. selectAll throws on its own.
  const recent = db
    .from('jobs')
    .select(`${TODAY_COLUMNS},province,employment_type,posted_at`)
    .eq('is_active', true)
    .order('posted_at', { ascending: false })
    .limit(12);

  const [rows, { data: todayRows, count: todayCount, error: todayError }, { data: recentRows, error: recentError }] =
    await Promise.all([overview, today, recent]);
  if (todayError) throw todayError;
  if (recentError) throw recentError;

  // Real recent postings feed the hero panel and the ticker; nothing is invented.
  const recentJobs = (recentRows ?? []) as (PostedTodayJob & { posted_at: string; province: string; employment_type: string | null })[];
  const latestPostings: HeroPosting[] = recentJobs.slice(0, 3).map((j) => ({
    slug: j.slug,
    title: j.title,
    employer: j.employer_name,
    location: `${j.city}, ${j.province}`,
    employmentType: j.employment_type && j.employment_type in EMPLOYMENT_LABELS ? EMPLOYMENT_LABELS[j.employment_type as EmploymentType] : null,
    category: j.category && j.category in CATEGORY_LABELS ? CATEGORY_LABELS[j.category as Category] : null,
    salary: formatSalary(j.salary_min, j.salary_max, j.salary_period),
    posted: postedAgo(j.posted_at),
  }));

  const region = regionName(rows.map((r) => r.province));
  const totalActive = rows.length;
  const employerNames = [...new Set(rows.map((r) => r.employer_name))].sort();
  const citiesByProvince = groupCitiesByProvince(rows);
  const provinceGroups = (Object.entries(citiesByProvince) as [string, string[]][]).sort(([a], [b]) =>
    provinceName(a).localeCompare(provinceName(b)),
  );
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

  // The searches this site most wants to rank for, linked from the most-linked page, so the
  // role and discipline pages that answer them carry the home page's weight.
  const popularSearches = [
    { label: 'Nurse jobs', href: paths.nationalDiscipline('nursing') },
    { label: 'RN jobs', href: paths.role('registered-nurse') },
    { label: 'LPN / RPN jobs', href: paths.role('practical-nurse') },
    { label: 'PSW jobs', href: paths.role('personal-support-worker') },
    { label: 'NP jobs', href: paths.role('nurse-practitioner') },
    ...topCategories
      .filter((c) => c !== 'nursing' && c !== 'support_care')
      .map((c) => ({ label: CATEGORY_LABELS[c], href: paths.nationalDiscipline(c) })),
    topType ? { label: EMPLOYMENT_LABELS[topType], href: buildJobsQuery({ employment_type: [topType] }) } : null,
  ].filter((x): x is { label: string; href: string } => x !== null);

  const provinceTiles = countBy(rows, (r) => r.province).filter(([, n]) => n >= LINK_THRESHOLD);

  const disciplineTiles = [...CATEGORIES]
    .filter((c) => (categoryCounts[c] ?? 0) > 0)
    .sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))
    .map((c) => ({ category: c, label: CATEGORY_LABELS[c], count: categoryCounts[c] ?? 0 }));

  const stats = [
    { value: String(totalActive), label: `active ${region} listings` },
    { value: String(employerNames.length), label: 'hospital networks connected' },
    { value: REFRESH_CADENCE, label: 'between refreshes' },
    { value: '0', label: 'accounts required' },
  ];

  return (
    <>
      <JsonLd
        data={[
          { '@context': 'https://schema.org', '@type': 'Organization', name: SITE.name, url: SITE.url, logo: `${SITE.url}/icon.svg` },
          { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url },
        ]}
      />
      <section className="bg-[var(--color-paper)]">
        <div className="mx-auto grid max-w-[1240px] gap-[clamp(36px,5vw,72px)] grid-cols-[minmax(0,1fr)] px-[22px] pb-[clamp(48px,7vw,96px)] pt-[clamp(40px,6vw,80px)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,500px)] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mint)] px-3.5 py-1.5 text-[14px] font-medium text-[var(--color-forest)]">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-coral)]" />
              {region === 'Canada' ? 'Canada’s' : `${region}’s`} healthcare-only job search
            </div>
            <h1 className="mt-6 text-balance font-display text-[clamp(44px,6.2vw,72px)] font-bold leading-[1.02] tracking-[-0.035em] [font-stretch:condensed]">
              Every healthcare job in {region},{' '}
              <span className="text-[var(--color-pine)]">in one search.</span>
            </h1>
            <p className="mt-6 max-w-[34em] text-[clamp(17px,1.6vw,20px)] leading-[1.55] text-[var(--color-slate)]">
              Nursing, PSW, allied health and physician roles straight from hospital, health authority and care-home
              career sites — gathered in one place, so you don’t have to check twenty.
            </p>

            <form
              method="get"
              action="/jobs"
              className="mt-8 flex flex-col gap-1 rounded-[18px] border border-[var(--color-divider)] bg-[var(--color-surface)] p-2 shadow-[0_18px_40px_-24px_rgba(28,59,52,0.35)] sm:flex-row sm:items-center"
            >
              <div className="flex min-h-[52px] min-w-0 flex-[1.4] items-center gap-3 px-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px] shrink-0 text-[var(--color-slate)]" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path strokeLinecap="round" d="m20 20-3.5-3.5" />
                </svg>
                <label htmlFor="hero-q" className="sr-only">Job title or profession</label>
                <input
                  id="hero-q"
                  name="q"
                  type="search"
                  placeholder="Job title or profession"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[17px] outline-offset-[6px] placeholder:text-[var(--color-slate)]"
                />
              </div>
              <span aria-hidden="true" className="mx-4 h-px bg-[var(--color-divider)] sm:mx-0 sm:h-9 sm:w-px" />
              <div className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-4">
                <PinIcon className="h-[18px] w-[18px] shrink-0 text-[var(--color-slate)]" />
                <label htmlFor="hero-city" className="sr-only">City</label>
                {/* One select, cities grouped by province: /jobs filters on city, so a
                    free-text "city or province" box would accept places it can't match. */}
                <select
                  id="hero-city"
                  name="city"
                  defaultValue=""
                  className="min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent p-0 text-[17px] text-[var(--color-ink)] outline-offset-[6px]"
                >
                  <option value="">All of {region}</option>
                  {provinceGroups.map(([code, cities]) => (
                    <optgroup key={code} label={provinceName(code)}>
                      {cities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="pill-fx mt-1 min-h-[52px] shrink-0 cursor-pointer whitespace-nowrap rounded-xl border-0 bg-[var(--color-pine)] px-7 text-[17px] font-medium text-white hover:bg-[var(--color-pine-hover)] sm:mt-0"
              >
                Search jobs
              </button>
            </form>

            {popularSearches.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <span className="text-[15px] text-[var(--color-slate)]">Popular:</span>
                {popularSearches.map((p) => (
                  <Link
                    key={p.label}
                    href={p.href}
                    className="inline-flex min-h-[38px] items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-4 text-[15px] text-[var(--color-ink)] no-underline hover:border-[var(--color-pine)] hover:text-[var(--color-pine)] hover:no-underline"
                  >
                    {p.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <HeroLatestPostings jobs={latestPostings} />
        </div>
      </section>

      <RecentTicker jobs={recentJobs} />

      <section className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-3.5">
          <h2 className={`m-0 ${H2}`}>Posted today</h2>
          <Link href="/jobs" className="text-[17px]">See all {totalActive} jobs ›</Link>
        </div>
        {todayJobs.length > 0 ? (
          <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3.5">
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
        {/* Sourcing attribution. The v2 canvas has no equivalent element, but naming
            the networks we collect from is close to this product's central claim, so
            it carries over from v1 rather than being dropped with the canvas's layout. */}
        {employerNames.length > 0 && (
          <p className="mt-3.5 text-[15px] text-[var(--color-slate)]">
            Sources: {employerNames.join(', ')}.
          </p>
        )}
      </section>

      <section className={SECTION}>
        <div className="reveal grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-7 rounded-[18px] bg-[var(--color-ink)] p-[clamp(28px,4vw,44px)] text-[var(--color-canvas)]">
          {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} />)}
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={`m-0 ${H2}`}>Browse by discipline</h2>
        <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {disciplineTiles.map((tile) => (
            <DisciplineTile
              key={tile.category}
              href={paths.nationalDiscipline(tile.category)}
              label={tile.label}
              count={tile.count}
            />
          ))}
        </div>
      </section>

      {provinceTiles.length > 0 && (
        <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
          <h2 className={`m-0 ${H2}`}>Browse by province</h2>
          <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            {provinceTiles.map(([code, count]) => (
              <DisciplineTile key={code} href={paths.province(code)} label={provinceName(code)} count={count} />
            ))}
          </div>
        </section>
      )}

      <section id="job-alerts" className="mx-auto w-full max-w-[1240px] px-[22px] pb-[clamp(48px,7vw,80px)] pt-[clamp(36px,5vw,56px)]">
        <div className="reveal rounded-[26px] border border-[var(--color-rule)] bg-[var(--color-surface)] px-[clamp(20px,4vw,44px)] py-[clamp(24px,4vw,42px)] shadow-[0_1px_0_rgba(15,23,42,0.02)]">
          <div className="grid grid-cols-1 items-center gap-[clamp(24px,5vw,64px)] lg:grid-cols-[1.05fr_1.2fr]">
            <div>
              <h2 className="m-0 max-w-[560px] text-[clamp(38px,4vw,64px)] font-semibold leading-[0.96] tracking-[-0.04em] text-[var(--color-ink)]">
                Tell us what you&apos;re
                <br />
                looking for.
                <br />
              </h2>
            </div>

            <JobAlertForm region={region} citiesByProvince={citiesByProvince} />
          </div>
        </div>
      </section>
    </>
  );
}
