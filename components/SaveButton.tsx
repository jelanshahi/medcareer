'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { SAVED_JOBS_EVENT, isJobSaved, toggleSavedJob } from '@/lib/saved-jobs';

/** Bookmark toggle. Defaults to "not saved" on first render so server and
 * client markup match — localStorage isn't available during SSR — then
 * corrects itself from the real stored value once mounted. Listens for
 * SAVED_JOBS_EVENT so it stays in sync if the same job is toggled from
 * elsewhere on the page (e.g. from /saved while a search-results card for
 * the same job is also open in another tab). */
export function SaveButton({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(isJobSaved(slug));
    const onChange = () => setSaved(isJobSaved(slug));
    window.addEventListener(SAVED_JOBS_EVENT, onChange);
    return () => window.removeEventListener(SAVED_JOBS_EVENT, onChange);
  }, [slug]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(toggleSavedJob(slug).includes(slug));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved jobs' : 'Save job'}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-slate)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
    >
      {saved ? (
        <svg viewBox="0 0 24 24" fill="var(--color-signal)" className="h-5 w-5" aria-hidden="true">
          <path d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
          />
        </svg>
      )}
    </button>
  );
}
