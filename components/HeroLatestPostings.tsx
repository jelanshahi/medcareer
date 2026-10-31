import Link from 'next/link';
import { SaveButton } from '@/components/SaveButton';

export type HeroPosting = {
  slug: string;
  title: string;
  employer: string;
  location: string;
  employmentType: string | null;
  salary: string | null;
  category: string | null;
  posted: string;
};

export function PinIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.1-7-11.5a7 7 0 1 1 14 0C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

const CHIP = 'inline-flex items-center gap-1.5 rounded-full bg-[var(--color-paper-chip)] px-2.5 py-1 text-[13px] text-[var(--color-ink)]';

/** The hero's "Latest postings" panel: the three most recent real listings on
 * a forest-green ground. Each card's title link is stretched over the whole
 * card, so the card is one click target while the bookmark stays its own
 * button (a button can't nest inside a link). Nothing here is invented — every
 * chip is omitted when the listing doesn't carry that field. */
export function HeroLatestPostings({ jobs }: { jobs: HeroPosting[] }) {
  if (jobs.length === 0) return null;

  return (
    <div className="rounded-[28px] bg-[var(--color-forest)] p-[clamp(16px,2.2vw,30px)] text-white">
      <div className="flex items-center justify-between px-0.5 pb-4">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em]">Latest postings</h2>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-[15px] text-white no-underline hover:text-white hover:underline"
        >
          View all
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h12m-5-5 5 5-5 5" />
          </svg>
        </Link>
      </div>

      <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-3.5 p-0">
        {jobs.map((job) => (
          <li
            key={job.slug}
            className="relative rounded-[18px] bg-[var(--color-surface)] px-[clamp(16px,1.8vw,22px)] pb-3.5 pt-[clamp(16px,1.8vw,22px)] text-[var(--color-ink)] transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-mint)] text-[24px] font-light leading-none text-[var(--color-pine)]"
              >
                +
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/jobs/${job.slug}`}
                  className="block text-[19px] font-medium leading-[1.25] tracking-[-0.015em] text-[var(--color-ink)] no-underline after:absolute after:inset-0 after:rounded-[18px] after:content-[''] hover:text-[var(--color-pine)] hover:no-underline"
                >
                  {job.title}
                </Link>
                <div className="mt-0.5 truncate text-[15px] text-[var(--color-slate)]">{job.employer}</div>
              </div>
              <div className="relative z-10 -mr-2 -mt-1.5">
                <SaveButton slug={job.slug} />
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-2">
              <span className={CHIP}>
                <PinIcon />
                {job.location}
              </span>
              {job.employmentType && <span className={CHIP}>{job.employmentType}</span>}
              {job.salary && <span className={`${CHIP} tabular-nums`}>{job.salary}</span>}
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[var(--color-divider)] pt-3 text-[13px]">
              <span className="font-medium text-[var(--color-pine)]">{job.category ?? 'Healthcare'}</span>
              <span className="text-[var(--color-slate)]">{job.posted}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
