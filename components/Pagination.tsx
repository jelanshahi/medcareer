import Link from 'next/link';
import { buildJobsQuery, type JobsQuery } from '@/lib/jobs/query-string';

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

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 py-[22px]">
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          className="border border-[var(--color-rule)] bg-white px-4 py-2 font-semibold text-[var(--color-ink)] no-underline hover:border-[var(--color-ink)]"
        >
          Previous
        </Link>
      ) : (
        <span className="border border-[var(--color-rule)] px-4 py-2 font-semibold text-[var(--color-meta)]">
          Previous
        </span>
      )}
      <span className="text-[15px] text-[var(--color-slate)]">
        Page {page} of {lastPage}
      </span>
      {page < lastPage ? (
        <Link
          href={href(page + 1)}
          className="border border-[var(--color-rule)] bg-white px-4 py-2 font-semibold text-[var(--color-ink)] no-underline hover:border-[var(--color-ink)]"
        >
          Next
        </Link>
      ) : (
        <span className="border border-[var(--color-rule)] px-4 py-2 font-semibold text-[var(--color-meta)]">
          Next
        </span>
      )}
    </nav>
  );
}
