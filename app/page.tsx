import { createServerClient } from '@/lib/db/server';
import { parseSearchParams, PAGE_SIZE } from '@/lib/schemas/search-params';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { SearchForm } from '@/components/SearchForm';
import { Pagination } from '@/components/Pagination';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'slug,title,employer_name,facility_name,city,province,employment_type,salary_min,salary_max,salary_period,posted_at';

export default async function SearchPage(props: PageProps<'/'>) {
  const params = parseSearchParams(await props.searchParams);
  const from = (params.page - 1) * PAGE_SIZE;

  let query = createServerClient()
    .from('jobs')
    .select(COLUMNS, { count: 'exact' })
    .eq('is_active', true)
    .order('posted_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (params.q) query = query.textSearch('search_vector', params.q, { type: 'websearch' });
  if (params.city) query = query.ilike('city', params.city);
  if (params.category) query = query.eq('category', params.category);

  // supabase-js resolves { data, error } rather than rejecting on failure.
  // An unchecked error renders a false "0 jobs" empty state indistinguishable
  // from a genuinely empty result, so it must be surfaced rather than dropped.
  const { data, count, error } = await query;
  if (error) throw error;
  const jobs = (data ?? []) as JobCardData[];

  return (
    <>
      <SearchForm params={params} />
      <p className="px-4 pb-2 text-sm text-[var(--color-slate)]">
        {count ?? 0} {count === 1 ? 'job' : 'jobs'} · Ontario
      </p>

      {jobs.length === 0 ? (
        <p className="px-4 py-10">
          No jobs match that search right now. Try a broader keyword, or clear the city filter to
          see everything in Ontario.
        </p>
      ) : (
        <ul className="border-t border-[var(--color-rule)]">
          {jobs.map((job) => <JobCard key={job.slug} job={job} />)}
        </ul>
      )}

      <Pagination
        page={params.page}
        total={count ?? 0}
        pageSize={PAGE_SIZE}
        query={{ q: params.q, city: params.city, category: params.category }}
      />
    </>
  );
}
