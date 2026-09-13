import Link from 'next/link';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { LIST_ROW } from '@/lib/ui/styles';
import { SaveButton } from '@/components/SaveButton';

export type JobCardData = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  category: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

function isCategory(value: string | null): value is Category {
  return value !== null && value in CATEGORY_LABELS;
}

function isEmploymentType(value: string | null): value is EmploymentType {
  return value !== null && value in EMPLOYMENT_LABELS;
}

/** One row inside the white result list. The v2 canvas has no closes-badge
 * counterpart here: jobs.closes_at is null on every row, so there is no
 * deadline to show (spec section 8). */
export function JobCard({ job }: { job: JobCardData }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employment = isEmploymentType(job.employment_type) ? EMPLOYMENT_LABELS[job.employment_type] : null;
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;
  const meta = [salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ');

  return (
    <li className={`${LIST_ROW} flex items-start gap-3 px-5 py-[18px] hover:bg-[var(--color-surface-hover)]`}>
      <Link
        href={`/jobs/${job.slug}`}
        className="flex min-w-0 flex-1 flex-wrap items-start gap-3 text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:no-underline"
      >
        <div className="min-w-0 flex-1 basis-[300px]">
          <h2 className="m-0 text-[21px] font-semibold leading-[1.22] tracking-[-0.015em]">{job.title}</h2>
          <p className="mt-1 text-base">
            {employerLine(job.employer_name, job.facility_name, job.city)}
          </p>
          <p className="mt-px text-base text-[var(--color-slate)]">{job.city}, {job.province}</p>
          <p className="mt-2 text-[15px] tabular-nums text-[var(--color-slate)]">{meta}</p>
        </div>
        {categoryLabel && (
          <span className="whitespace-nowrap text-sm text-[var(--color-meta)]">{categoryLabel}</span>
        )}
      </Link>
      <SaveButton slug={job.slug} />
    </li>
  );
}
