import Link from 'next/link';
import { formatSalary } from '@/lib/format';

export type PostedTodayJob = {
  slug: string;
  title: string;
  employer_name: string;
  city: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
};

export function PostedTodayRow({ job }: { job: PostedTodayJob }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="block border-b border-[var(--color-hover)] px-[18px] py-3.5 text-[var(--color-ink)] no-underline last:border-b-0 hover:bg-[var(--color-hover-alt)]"
    >
      <div className="font-display text-xl font-semibold leading-tight">{job.title}</div>
      <div className="mt-0.5 text-[15px] text-[var(--color-slate)]">
        {job.employer_name} · {job.city}
      </div>
      {salary && <div className="mt-1 text-sm tabular-nums text-[var(--color-slate)]">{salary}</div>}
    </Link>
  );
}
