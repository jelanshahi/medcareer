import type { Category } from '@/lib/taxonomy/categories';
import type { EmploymentType } from '@/lib/taxonomy/employment';
import type { Sort } from '@/lib/schemas/search-params';

export type JobsQuery = {
  q?: string;
  city?: string[];
  category?: Category[];
  employment_type?: EmploymentType[];
  employer?: string[];
  sort?: Sort;
  page?: number;
};

/** Builds a /jobs URL from a filter state. Shared by pagination links, active
 * filter chips, discipline tiles and popular-search links so every link on
 * the site produces the exact query string parseSearchParams expects back. */
export function buildJobsQuery(params: JobsQuery): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  for (const c of params.city ?? []) sp.append('city', c);
  for (const c of params.category ?? []) sp.append('category', c);
  for (const t of params.employment_type ?? []) sp.append('employment_type', t);
  for (const e of params.employer ?? []) sp.append('employer', e);
  if (params.sort && params.sort !== 'newest') sp.set('sort', params.sort);
  if (params.page && params.page > 1) sp.set('page', String(params.page));
  const qs = sp.toString();
  return qs ? `/jobs?${qs}` : '/jobs';
}
