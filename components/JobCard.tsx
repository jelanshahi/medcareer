import Link from 'next/link';
import { postedAgo, formatSalary } from '@/lib/format';

export type JobCardData = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  casual: 'Casual',
  temporary: 'Temporary',
  contract: 'Contract',
};

export function JobCard({ job }: { job: JobCardData }) {
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employment = job.employment_type ? EMPLOYMENT_LABELS[job.employment_type] : null;

  return (
    <li className="border-b border-[var(--color-rule)]">
      <Link href={`/jobs/${job.slug}`} className="block px-4 py-4 hover:bg-white focus-visible:bg-white">
        <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
        <p className="mt-1 text-[var(--color-slate)]">
          {job.employer_name}
          {job.facility_name ? ` · ${job.facility_name}` : ''}
        </p>
        <p className="text-[var(--color-slate)]">{job.city}, {job.province}</p>
        <p className="mt-2 text-sm tabular-nums text-[var(--color-slate)]">
          {[salary, employment, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
        </p>
      </Link>
    </li>
  );
}
