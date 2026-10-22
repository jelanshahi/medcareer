import Link from 'next/link';

export type TickerJob = {
  slug: string;
  title: string;
  employer_name: string;
  city: string;
};

/** Endless strip of the most recent real postings. The list is rendered twice
 * so translating the track by -50% loops seamlessly; the second copy is hidden
 * from assistive tech and the tab order. Pauses on hover/focus (globals.css). */
export function RecentTicker({ jobs }: { jobs: TickerJob[] }) {
  if (jobs.length < 4) return null;

  return (
    <div className="ticker overflow-hidden border-y border-[var(--color-divider)] bg-[var(--color-surface)]" aria-label="Recently posted jobs">
      <div className="ticker-track flex w-max">
        {[0, 1].map((copy) => (
          <ul key={copy} className="m-0 flex shrink-0 list-none items-center gap-9 p-0 py-3.5 pr-9" aria-hidden={copy === 1}>
            {jobs.map((job) => (
              <li key={job.slug} className="flex items-center gap-2.5 whitespace-nowrap text-[15px]">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal)]" />
                <Link
                  href={`/jobs/${job.slug}`}
                  tabIndex={copy === 1 ? -1 : undefined}
                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-signal)]"
                >
                  {job.title}
                </Link>
                <span className="text-[var(--color-slate)]">{job.employer_name} · {job.city}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
