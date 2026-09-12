import Link from 'next/link';
import { buildJobsQuery, type JobsQuery } from '@/lib/jobs/query-string';
import { PILL_OUTLINE } from '@/lib/ui/styles';

export function Pagination({
  page,
  total,
  pageSize,
  query,
}: {
  page: number;
  total: number;
  pageSize: number;
  query: JobsQuery;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => buildJobsQuery({ ...query, page: p });
  const pill = `${PILL_OUTLINE} min-h-[44px] px-5 text-base`;
  const disabled =
    'inline-flex min-h-[44px] items-center rounded-full border border-[var(--color-rule)] px-5 py-2 text-base text-[var(--color-meta)]';

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-5">
      {page > 1 ? <Link href={href(page - 1)} className={pill}>Previous</Link> : <span className={disabled}>Previous</span>}
      <span className="text-[15px] text-[var(--color-slate)]">Page {page} of {lastPage}</span>
      {page < lastPage ? <Link href={href(page + 1)} className={pill}>Next</Link> : <span className={disabled}>Next</span>}
    </nav>
  );
}
