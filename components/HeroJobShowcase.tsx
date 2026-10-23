'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CARD } from '@/lib/ui/styles';

export type ShowcaseJob = {
  slug: string;
  title: string;
  employer: string;
  city: string;
  category: string | null;
  salary: string | null;
  posted: string;
};

const INTERVAL_MS = 4500;

function Check({ delay }: { delay: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[var(--color-signal)]" fill="none">
      <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="check-draw" style={{ animationDelay: `${delay}s` }} />
    </svg>
  );
}

/** Rotates through real recent postings in one card. Everything shown is true
 * of every listing on the site (linked to the employer's own page, no account),
 * so nothing here is invented. Auto-advance stops on hover/focus and is skipped
 * entirely for prefers-reduced-motion; the dots stay usable either way. */
export function HeroJobShowcase({ jobs }: { jobs: ShowcaseJob[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (paused || reduced || jobs.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % jobs.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, reduced, jobs.length]);

  const job = jobs[index];
  if (!job) return null;

  return (
    <div
      className="mx-auto mt-9 w-full max-w-[420px] text-left md:mx-0 md:mt-8.5 md:max-w-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={`${CARD} border border-[var(--color-divider)] p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]`}>
        {/* key remounts the body so the swap-in and tick animations replay per job */}
        <div key={job.slug} className="card-swap-in" aria-live="off">
          {job.category && (
            <span className="text-xs font-semibold uppercase tracking-[.02em] text-[var(--color-slate)]">{job.category}</span>
          )}
          <Link
            href={`/jobs/${job.slug}`}
            className="mt-1 block text-[21px] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--color-ink)] no-underline hover:text-[var(--color-signal)] hover:no-underline"
          >
            {job.title}
          </Link>
          <div className="mt-1 text-[15px] text-[var(--color-slate)]">{job.employer} · {job.city}</div>
          {job.salary && <div className="mt-1 text-[15px] tabular-nums">{job.salary}</div>}

          <ul className="m-0 mt-4 grid list-none gap-2 border-t border-[var(--color-divider)] p-0 pt-4 text-[14px] text-[var(--color-ink)]">
            {['Links to the employer’s own application page', job.posted, 'No account needed'].map((line, i) => (
              <li key={line} className="flex items-center gap-2">
                <Check delay={0.25 + i * 0.18} />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {jobs.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" role="group" aria-label="Choose a featured job">
          {jobs.map((j, i) => (
            <button
              key={j.slug}
              type="button"
              aria-label={`Show ${j.title}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`h-1.5 cursor-pointer rounded-full border-0 p-0 transition-all duration-300 ${
                i === index ? 'w-5 bg-[var(--color-signal)]' : 'w-1.5 bg-[var(--color-rule)]'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
