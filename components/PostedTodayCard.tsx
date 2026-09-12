import Link from 'next/link';
import { formatSalary } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { CARD } from '@/lib/ui/styles';

export type PostedTodayJob = {
  slug: string;
  title: string;
  employer_name: string;
  city: string;
  category: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
};

function isCategory(value: string | null): value is Category {
  return value !== null && value in CATEGORY_LABELS;
}

/** One card in the v2 home page's four-up "Posted today" grid. Salary is
 * pinned to the bottom with margin-top:auto so cards of differing title
 * lengths still align — and is omitted entirely when absent (60 of 153
 * listings carry no band). */
export function PostedTodayCard({ job }: { job: PostedTodayJob }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className={`${CARD} flex flex-col gap-1.5 p-5 text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] hover:no-underline`}
    >
      {categoryLabel && (
        <span className="text-xs font-semibold uppercase tracking-[.02em] text-[var(--color-slate)]">
          {categoryLabel}
        </span>
      )}
      <span className="text-[21px] font-semibold leading-[1.2] tracking-[-0.015em]">{job.title}</span>
      <span className="text-[15px] text-[var(--color-slate)]">{job.employer_name} · {job.city}</span>
      {salary && <span className="mt-auto pt-2 text-[15px] tabular-nums">{salary}</span>}
    </Link>
  );
}
