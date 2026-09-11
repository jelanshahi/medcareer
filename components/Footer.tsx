import Link from 'next/link';
import { SITE } from '@/lib/site';

// Dark footer shared by every route. "Browse by city" is omitted (no landing
// pages in scope — see task-15-brief.md §1). "Employer removal requests"
// links to the real section on /about rather than the design's dead onClick.
export function Footer() {
  return (
    <footer className="mt-auto bg-[var(--color-ink)] text-[var(--color-footer-text)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 px-4 py-8 text-[15px] sm:px-6">
        <div className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-[var(--color-paper)]">
          <span className="inline-block h-[18px] w-[9px] bg-[var(--color-signal)]" aria-hidden="true" />
          {SITE.name}
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <Link href="/jobs" className="text-[var(--color-footer-text)] no-underline hover:text-[var(--color-paper)]">
            Search jobs
          </Link>
          <Link href="/about" className="text-[var(--color-footer-text)] no-underline hover:text-[var(--color-paper)]">
            About
          </Link>
          <Link
            href="/about#employer-removal"
            className="text-[var(--color-footer-text)] no-underline hover:text-[var(--color-paper)]"
          >
            Employer removal requests
          </Link>
        </nav>
        <p className="w-full border-t border-[var(--color-footer-rule)] pt-4 text-sm">
          Healthcare jobs across Ontario. Listings belong to the employers who posted them;{' '}
          {SITE.name} links, it does not republish applications.
        </p>
      </div>
    </footer>
  );
}
