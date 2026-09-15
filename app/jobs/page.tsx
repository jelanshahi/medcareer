import Link from 'next/link';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/db/server';
import { parseSearchParams, PAGE_SIZE, type SearchParams } from '@/lib/schemas/search-params';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_TYPES, EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { tally, type FacetRow } from '@/lib/jobs/facets';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { SearchForm } from '@/components/SearchForm';
import { FacetGroup, type FacetItem } from '@/components/FacetGroup';
import { HiddenFilterFields } from '@/components/HiddenFilterFields';
import { Pagination } from '@/components/Pagination';
import { CARD, CHIP, CONTAINER, H2, LIST, PILL_OUTLINE, PILL_PRIMARY } from '@/lib/ui/styles';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: PageProps<'/jobs'>): Promise<Metadata> {
  const params = parseSearchParams(await props.searchParams);

  const subject =
    params.category?.length === 1 ? `${CATEGORY_LABELS[params.category[0]]} jobs` : 'Healthcare jobs';
  const location = params.city?.length === 1 ? `in ${params.city[0]}, Ontario` : 'in Ontario';
  const pageSuffix = params.page > 1 ? ` — Page ${params.page}` : '';

  const title = params.q
    ? `“${params.q}” — healthcare job search | ${SITE.name}`
    : `${subject.replace(/^./, (c) => c.toUpperCase())} ${location}${pageSuffix} | ${SITE.name}`;

  const description = params.q
    ? `Search results for “${params.q}” across active healthcare job listings in Ontario, pulled from hospital career systems and refreshed every six hours.`
    : `Browse ${subject.toLowerCase()} ${location}, pulled from hospital career systems and refreshed every six hours.`;

  // A keyword search or a page past the first produces thin, near-duplicate
  // content that shouldn't compete with the canonical facet pages (plain
  // /jobs, /jobs?city=..., /jobs?category=...) for ranking — keep those out
  // of the index while still letting Google follow the links on them.
  const noindex = Boolean(params.q) || params.page > 1;

  return {
    title,
    description,
    alternates: { canonical: buildJobsQuery(params) },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

const RESULT_COLUMNS =
  'slug,title,employer_name,facility_name,city,province,category,employment_type,salary_min,salary_max,salary_period,posted_at';

type Chip = { key: string; label: string; href: string };

function buildChips(params: SearchParams): Chip[] {
  const chips: Chip[] = [];
  if (params.q) {
    chips.push({ key: 'q', label: `“${params.q}”`, href: buildJobsQuery({ ...params, q: undefined }) });
  }
  for (const c of params.category ?? []) {
    chips.push({
      key: `category-${c}`,
      label: CATEGORY_LABELS[c],
      href: buildJobsQuery({ ...params, category: (params.category ?? []).filter((x) => x !== c) }),
    });
  }
  for (const c of params.city ?? []) {
    chips.push({
      key: `city-${c}`,
      label: c,
      href: buildJobsQuery({ ...params, city: (params.city ?? []).filter((x) => x !== c) }),
    });
  }
  for (const t of params.employment_type ?? []) {
    chips.push({
      key: `type-${t}`,
      label: EMPLOYMENT_LABELS[t],
      href: buildJobsQuery({ ...params, employment_type: (params.employment_type ?? []).filter((x) => x !== t) }),
    });
  }
  for (const e of params.employer ?? []) {
    chips.push({
      key: `employer-${e}`,
      label: e,
      href: buildJobsQuery({ ...params, employer: (params.employer ?? []).filter((x) => x !== e) }),
    });
  }
  return chips;
}

export default async function JobsPage(props: PageProps<'/jobs'>) {
  const params = parseSearchParams(await props.searchParams);
  const from = (params.page - 1) * PAGE_SIZE;
  const db = createServerClient();

  // Main results: every active filter applies. Sort column is picked with a
  // ternary rather than reassigning the query across an if/else — chaining
  // .order() unconditionally here (as the pre-existing query on the old `/`
  // page did) keeps the builder's inferred row type stable.
  let resultsQuery = db
    .from('jobs')
    .select(RESULT_COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .order(params.sort === 'salary' ? 'salary_min' : 'posted_at', {
      ascending: false,
      nullsFirst: false,
    })
    .range(from, from + PAGE_SIZE - 1);
  if (params.q) resultsQuery = resultsQuery.textSearch('search_vector', params.q, { type: 'websearch' });
  if (params.city?.length) resultsQuery = resultsQuery.in('city', params.city);
  if (params.category?.length) resultsQuery = resultsQuery.in('category', params.category);
  if (params.employment_type?.length) resultsQuery = resultsQuery.in('employment_type', params.employment_type);
  if (params.employer?.length) resultsQuery = resultsQuery.in('employer_name', params.employer);

  // Facet counts: filtered only by q, so each group's live count can be
  // computed against the *other* groups' current selections (standard
  // faceted-search behaviour) without a round trip per facet value. The
  // active data set is small (order of a few hundred rows), so counting in
  // JS here is cheap next to a network round trip per facet.
  let facetQuery = db.from('jobs').select('category,city,employment_type,employer_name').eq('is_active', true);
  if (params.q) facetQuery = facetQuery.textSearch('search_vector', params.q, { type: 'websearch' });

  // supabase-js resolves { data, error } rather than rejecting on failure.
  // Both calls are checked independently — an unchecked error here would
  // render a false "0 jobs" or false-empty facet lists.
  const [{ data: results, count, error: resultsError }, { data: facetRows, error: facetError }] =
    await Promise.all([resultsQuery, facetQuery]);
  if (resultsError) throw resultsError;
  if (facetError) throw facetError;

  const jobs = (results ?? []) as JobCardData[];
  const rows = (facetRows ?? []) as FacetRow[];

  const matchesCity = (r: FacetRow) => !params.city?.length || params.city.includes(r.city);
  const matchesCategory = (r: FacetRow) => !params.category?.length || params.category.includes(r.category as Category);
  const matchesType = (r: FacetRow) =>
    !params.employment_type?.length || params.employment_type.includes(r.employment_type as EmploymentType);
  const matchesEmployer = (r: FacetRow) => !params.employer?.length || params.employer.includes(r.employer_name);

  const existingCategories = new Set(rows.map((r) => r.category).filter(Boolean));
  const existingTypes = new Set(rows.map((r) => r.employment_type).filter(Boolean));

  const categoryCounts = tally(rows.filter((r) => matchesCity(r) && matchesType(r) && matchesEmployer(r)), 'category');
  const typeCounts = tally(rows.filter((r) => matchesCategory(r) && matchesCity(r) && matchesEmployer(r)), 'employment_type');
  const employerCounts = tally(rows.filter((r) => matchesCategory(r) && matchesCity(r) && matchesType(r)), 'employer_name');

  const disciplineItems: FacetItem[] = CATEGORIES.filter((c) => existingCategories.has(c)).map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
    count: categoryCounts[c] ?? 0,
    checked: params.category?.includes(c) ?? false,
  }));
  const typeItems: FacetItem[] = EMPLOYMENT_TYPES.filter((t) => existingTypes.has(t)).map((t) => ({
    value: t,
    label: EMPLOYMENT_LABELS[t],
    count: typeCounts[t] ?? 0,
    checked: params.employment_type?.includes(t) ?? false,
  }));
  const employerItems: FacetItem[] = [...new Set(rows.map((r) => r.employer_name))].sort().map((e) => ({
    value: e,
    label: e,
    count: employerCounts[e] ?? 0,
    checked: params.employer?.includes(e) ?? false,
  }));

  const cities = [...new Set(rows.map((r) => r.city))].sort();

  const chips = buildChips(params);
  const total = count ?? 0;
  const citySummary = params.city?.length === 1 ? params.city[0] : 'Ontario';
  const resultsHeading =
    params.category?.length === 1 ? `${CATEGORY_LABELS[params.category[0]]} jobs` : 'Healthcare jobs';

  return (
    <>
      <div className="border-b border-[var(--color-rule)] bg-[var(--color-surface)]">
        <SearchForm params={params} cities={cities} />
      </div>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-7 pb-[72px] pt-6`}>
        {/* From md up this is its own scroll region, independent of the results
            column. Sticky alone was not enough: with enough facets the panel
            grows taller than the viewport, and a sticky element cannot be
            scrolled past, so "Apply filters" at its bottom became unreachable.
            Capping the height to the viewport (less the 4rem sticky offset plus
            a gap) and giving it overflow-y makes the overflow reachable.
            overscroll-contain stops a flick at either end of the list from
            chaining into the page behind it — that chaining is what makes two
            adjacent scrollers feel like one. The px-1/-mx-1 pair reserves room
            for the 3px :focus-visible outline (globals.css) so it is not
            clipped by the new scroll container, without moving the panel.

            Known and accepted: the 100vh cap assumes the panel is pinned at
            top-16, which is only true once the page has scrolled. At scrollY 0
            the panel still sits at its natural offset (~156px on a 900px
            viewport) so its last ~90px fall below the fold until the page
            moves at all. Correcting that needs the scroll position, i.e. JS;
            not worth a client component for one scroll position, since any
            scroll at all — including the one that reaches for these filters —
            resolves it. */}
        <aside className="w-full flex-1 basis-[232px] md:sticky md:top-16 md:max-h-[calc(100vh_-_5rem)] md:max-w-[320px] md:overflow-y-auto md:overscroll-contain md:-mx-1 md:px-1">
          <form method="get" action="/jobs" className={`${CARD} px-[18px] pb-3.5 pt-1.5`}>
            <HiddenFilterFields q={params.q} sort={params.sort} city={params.city} />

            {/* Open by default and collapsible only below md. CSS cannot force a
                <details> open on wide screens, so the summary is hidden there
                instead and the panel simply stays open. A JS toggle would break
                the no-script guarantee. */}
            <details open className="[&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 md:hidden">
                <span className="text-[17px] font-semibold tracking-[-0.015em]">Filters</span>
                <span className={PILL_OUTLINE}>Show or hide</span>
              </summary>

              <div className="hidden items-center justify-between gap-3 py-3.5 md:flex">
                <span className="text-[17px] font-semibold tracking-[-0.015em]">Filters</span>
                <Link href="/jobs" className="text-[15px]">Clear all</Link>
              </div>

              <FacetGroup label="Discipline" name="category" items={disciplineItems} />
              <FacetGroup label="Employment type" name="employment_type" items={typeItems} />
              <FacetGroup label="Employer" name="employer" items={employerItems} />

              <button type="submit" className={`${PILL_PRIMARY} mt-3.5 w-full`}>Apply filters</button>
              <Link href="/jobs" className="mt-3 block text-center text-[15px] md:hidden">Clear all</Link>
            </details>
          </form>
        </aside>

        <main className="min-w-0 flex-[4_1_420px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h1 className={`m-0 ${H2} leading-[1.1]`}>{resultsHeading}</h1>
            <span className="text-[15px] tabular-nums text-[var(--color-slate)]">
              {total} {total === 1 ? 'job' : 'jobs'} · {citySummary}
            </span>
          </div>

          {chips.length > 0 && (
            <ul className="flex list-none flex-wrap gap-2 p-0 pt-3.5">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link href={chip.href} className={CHIP}>
                    <span>{chip.label}</span>
                    <span aria-hidden="true" className="text-[15px] leading-none text-[var(--color-slate)]">×</span>
                    <span className="sr-only">Remove filter</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {jobs.length === 0 ? (
            <div className={`${CARD} mt-4 px-7 py-12 text-center`}>
              <h2 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">
                Nothing open for that right now
              </h2>
              <p className="mx-auto mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
                Try a broader keyword, or widen the city filter to all of Ontario. New postings land
                every six hours.
              </p>
              <Link href="/jobs" className={`${PILL_PRIMARY} mt-4.5`}>Show all Ontario jobs</Link>
            </div>
          ) : (
            <>
              <ul className={`${LIST} reveal-group mt-4`}>
                {jobs.map((job) => <JobCard key={job.slug} job={job} />)}
              </ul>
              <Pagination page={params.page} total={total} pageSize={PAGE_SIZE} query={params} />
            </>
          )}
        </main>
      </div>
    </>
  );
}
