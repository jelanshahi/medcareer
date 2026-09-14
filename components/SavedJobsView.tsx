'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/db/browser';
import { getSavedSlugs, subscribeToSavedJobs } from '@/lib/saved-jobs';
import { JobCard, type JobCardData } from '@/components/JobCard';
import { CARD, LIST, PILL_PRIMARY } from '@/lib/ui/styles';

const COLUMNS =
  'slug,title,employer_name,facility_name,city,province,category,employment_type,salary_min,salary_max,salary_period,posted_at';

type Status = 'loading' | 'empty' | 'ready' | 'error';

/** Client-rendered by design: it needs localStorage, which only exists in
 * the browser. app/saved/page.tsx (the server wrapper) carries the
 * `dynamic = 'force-dynamic'` export this file can't, since a 'use client'
 * page can't also export route-segment config. */
export function SavedJobsView() {
  const [status, setStatus] = useState<Status>('loading');
  const [jobs, setJobs] = useState<JobCardData[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const slugs = getSavedSlugs();
      if (slugs.length === 0) {
        if (!cancelled) {
          setJobs([]);
          setStatus('empty');
        }
        return;
      }

      const db = createBrowserClient();
      const { data, error } = await db
        .from('jobs')
        .select(COLUMNS)
        .in('slug', slugs)
        .eq('is_active', true);
      if (cancelled) return;
      if (error) {
        setStatus('error');
        return;
      }

      const rows = (data ?? []) as JobCardData[];
      setJobs(rows);
      setStatus(rows.length === 0 ? 'empty' : 'ready');
    }

    load();
    const unsubscribe = subscribeToSavedJobs(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (status === 'loading') return null;

  if (status === 'error') {
    return (
      <div className={`${CARD} mt-4 px-7 py-12 text-center`}>
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">
          Couldn&rsquo;t load your saved jobs
        </h2>
        <p className="mx-auto mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
          Something went wrong loading your saved jobs. Try refreshing the page.
        </p>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className={`${CARD} mt-4 px-7 py-12 text-center`}>
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">No saved jobs yet</h2>
        <p className="mx-auto mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
          Tap the bookmark icon on any listing to save it here for later.
        </p>
        <Link href="/jobs" className={`${PILL_PRIMARY} mt-4.5`}>Browse open jobs</Link>
      </div>
    );
  }

  return (
    <ul className={`${LIST} mt-4`}>
      {jobs.map((job) => <JobCard key={job.slug} job={job} />)}
    </ul>
  );
}
