import Link from 'next/link';
import { postedAgo, formatSalary } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';

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

export function JobCard({ job }: { job: JobCardData }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employment = isEmploymentType(job.employment_type) ? EMPLOYMENT_LABELS[job.employment_type] : null;
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;

  return (
    <li className="border-b border-[var(--color-rule)]">
      <Link
        href={`/jobs/${job.slug}`}
        className="block px-2 py-[17px] text-[var(--color-ink)] no-underline hover:bg-white sm:px-0"
      >
        <div className="flex flex-wrap items-start gap-3.5">
          <div className="min-w-0 flex-1 basis-[320px]">
            <h2 className="font-display text-2xl font-semibold leading-tight">{job.title}</h2>
            <p className="mt-1 text-base text-[var(--color-body)]">
              {job.employer_name}
              {job.facility_name ? ` · ${job.facility_name}` : ''}
            </p>
            <p className="text-base text-[var(--color-slate)]">{job.city}, {job.province}</p>
            <p className="mt-2 text-[15px] tabular-nums text-[var(--color-slate)]">
              {[salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
            </p>
          </div>
          {categoryLabel && (
            <div className="flex flex-col items-end gap-1.5">
              <span className="whitespace-nowrap text-sm text-[var(--color-meta)]">{categoryLabel}</span>
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
