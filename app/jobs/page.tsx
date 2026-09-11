import Link from 'next/link';
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

export const dynamic = 'force-dynamic';

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

  // Facet counts: filtered only by q, so each group's live count can be
  // computed against the *other* groups' current selections (standard
  // faceted-search behaviour) without a round trip per facet value. The
  // active data set is small (order of a few hundred rows), so counting in
  // JS here is cheap next to a network round trip per facet.
  let facetQuery = db.from('jobs').select('category,city,employment_type').eq('is_active', true);
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

  const existingCategories = new Set(rows.map((r) => r.category).filter(Boolean));
  const existingCities = new Set(rows.map((r) => r.city));
  const existingTypes = new Set(rows.map((r) => r.employment_type).filter(Boolean));

  const categoryCounts = tally(rows.filter((r) => matchesCity(r) && matchesType(r)), 'category');
  const cityCounts = tally(rows.filter((r) => matchesCategory(r) && matchesType(r)), 'city');
  const typeCounts = tally(rows.filter((r) => matchesCategory(r) && matchesCity(r)), 'employment_type');

  const disciplineItems: FacetItem[] = CATEGORIES.filter((c) => existingCategories.has(c)).map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
    count: categoryCounts[c] ?? 0,
    checked: params.category?.includes(c) ?? false,
  }));
  const cityItems: FacetItem[] = [...existingCities].sort().map((c) => ({
    value: c,
    label: c,
    count: cityCounts[c] ?? 0,
    checked: params.city?.includes(c) ?? false,
  }));
  const typeItems: FacetItem[] = EMPLOYMENT_TYPES.filter((t) => existingTypes.has(t)).map((t) => ({
    value: t,
    label: EMPLOYMENT_LABELS[t],
    count: typeCounts[t] ?? 0,
    checked: params.employment_type?.includes(t) ?? false,
  }));

  const chips = buildChips(params);
  const total = count ?? 0;
  const citySummary = params.city?.length === 1 ? params.city[0] : 'Ontario';
  const resultsHeading =
    params.category?.length === 1 ? `${CATEGORY_LABELS[params.category[0]]} jobs` : 'Healthcare jobs';

  return (
    <>
      <div className="border-b border-[var(--color-rule)] bg-[var(--color-band)]">
        <div className="mx-auto max-w-[1180px]">
          <SearchForm params={params} />
        </div>
      </div>

      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-9 px-4 pb-16 sm:px-6">
        <aside className="w-full flex-1 basis-[246px] pt-6 sm:sticky sm:top-4 sm:max-w-[340px]">
          <form method="get" action="/jobs">
            <HiddenFilterFields q={params.q} sort={params.sort} />
            <div className="flex items-baseline justify-between border-b-2 border-[var(--color-ink)] pb-2.5">
              <span className="font-display text-xl font-bold uppercase tracking-wider">Filters</span>
              <Link href="/jobs" className="text-sm font-semibold text-[var(--color-signal)] underline">
                Clear all
              </Link>
            </div>
            <FacetGroup label="Discipline" name="category" items={disciplineItems} />
            <FacetGroup label="City" name="city" items={cityItems} />
            <FacetGroup label="Employment type" name="employment_type" items={typeItems} />
            <button
              type="submit"
              className="mt-4 w-full border-0 bg-[var(--color-signal)] px-4 py-2.5 font-display text-lg font-bold uppercase tracking-wide text-white hover:bg-[var(--color-signal-hover)]"
            >
              Apply filters
            </button>
          </form>
        </aside>

        <main className="min-w-0 flex-[4_1_440px] pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5 pb-2.5">
            <h1 className="font-display text-[32px] font-bold uppercase leading-none">{resultsHeading}</h1>
            <span className="text-[15px] tabular-nums text-[var(--color-slate)]">
              {total} {total === 1 ? 'job' : 'jobs'} · {citySummary}
            </span>
          </div>

          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pb-3.5">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <Link
                    href={chip.href}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ink)] bg-[var(--color-ink)] py-1 pl-3 pr-2 text-sm text-[var(--color-paper)] no-underline"
                  >
                    <span>{chip.label}</span>
                    <span aria-hidden="true" className="text-base leading-none opacity-75">×</span>
                    <span className="sr-only">Remove filter</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {jobs.length === 0 ? (
            <div className="border-t border-[var(--color-rule)] py-12">
              <h2 className="font-display text-[28px] font-bold uppercase">Nothing open for that right now</h2>
              <p className="mt-2 max-w-[40em] text-lg text-[var(--color-body)]">
                Try a broader keyword, or widen the city filter to all of Ontario. New postings land every six
                hours.
              </p>
              <Link
                href="/jobs"
                className="mt-4 inline-block bg-[var(--color-signal)] px-[22px] py-2.5 font-display text-xl font-bold uppercase tracking-wide text-white no-underline hover:bg-[var(--color-signal-hover)]"
              >
                Show all Ontario jobs
              </Link>
            </div>
          ) : (
            <>
              <ul className="border-t border-[var(--color-rule)] pl-0">{jobs.map((job) => <JobCard key={job.slug} job={job} />)}</ul>
              <Pagination page={params.page} total={total} pageSize={PAGE_SIZE} query={params} />
            </>
          )}
        </main>
      </div>
    </>
  );
}
