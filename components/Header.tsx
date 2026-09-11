import Link from 'next/link';
import { SITE } from '@/lib/site';

// Dark header shared by every route. "Browse by city" and "Get job alerts"
// from the design are omitted deliberately (see task-15-brief.md §1): there
// are no landing pages to link to and no auth/email storage in phase 1.
export function Header() {
  return (
    <header className="bg-[var(--color-ink)] text-[var(--color-paper)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-2 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-2xl font-bold uppercase tracking-wide text-[var(--color-paper)] no-underline hover:text-[var(--color-paper)]"
        >
          <span className="inline-block h-[22px] w-[11px] bg-[var(--color-signal)]" aria-hidden="true" />
          {SITE.name}
        </Link>
        <nav aria-label="Primary" className="ml-auto flex items-center gap-6 text-[15px]">
          <Link href="/jobs" className="font-semibold text-[var(--color-paper)] no-underline hover:text-[var(--color-paper)]">
            Search jobs
          </Link>
          <Link href="/about" className="text-[#C8CDD1] no-underline hover:text-[var(--color-paper)]">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
