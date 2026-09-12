import Link from 'next/link';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { LIST, LIST_ROW } from '@/lib/ui/styles';

export type LandingJob = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

function isEmploymentType(value: string | null): value is EmploymentType {
  return value !== null && value in EMPLOYMENT_LABELS;
}

/** The capped job list on a landing page. Landing pages deliberately do not
 * paginate — /jobs already owns pagination, filtering and sorting, and
 * duplicating it across three routes would buy nothing. The overflow goes to
 * the equivalent filtered search instead. */
export function LandingJobList({
  jobs,
  city,
  seeAllHref,
  seeAllLabel,
}: {
  jobs: LandingJob[];
  /** The city these listings are scoped to. Not on LandingJob itself — the
   * rows are already filtered to one city — but employerLine needs it to
   * suppress a facility_name that merely repeats the city. */
  city: string;
  seeAllHref: string;
  seeAllLabel: string;
}) {
  return (
    <>
      <ul className={`${LIST} mt-4`}>
        {jobs.map((job) => {
          const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
          const employment = isEmploymentType(job.employment_type)
            ? EMPLOYMENT_LABELS[job.employment_type]
            : null;
          const meta = [salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ');

          return (
            <li key={job.slug} className={LIST_ROW}>
              <Link
                href={`/jobs/${job.slug}`}
                className="block px-5 py-[17px] text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)] hover:no-underline"
              >
                <h3 className="m-0 text-[20px] font-semibold leading-[1.22] tracking-[-0.015em]">
                  {job.title}
                </h3>
                <p className="mt-1 text-base">
                  {employerLine(job.employer_name, job.facility_name, city)}
                </p>
                <p className="mt-1.5 text-[15px] tabular-nums text-[var(--color-slate)]">{meta}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[17px]">
        <Link href={seeAllHref}>{seeAllLabel} ›</Link>
      </p>
    </>
  );
}
