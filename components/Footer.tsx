import Link from 'next/link';
import { SITE } from '@/lib/site';
import { CONTAINER } from '@/lib/ui/styles';

// Light footer from the v2 canvas (v1's was dark). All four destinations are
// real: "Saved jobs" reads from the browser's own localStorage — no account
// — and "Employer removal requests" goes to the live section on /about
// rather than the canvas's dead onClick. "Browse by city" was dropped from
// here and from the header nav (docs/superpowers/specs/2026-09-13-saved-jobs-design.md),
// but its pages under /browse are untouched and still reachable directly.
export function Footer() {
  const link =
    'text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:underline';

  return (
    <footer className="mt-auto border-t border-[var(--color-rule)] bg-[var(--color-canvas)]">
      <div className={`${CONTAINER} pb-10 pt-7 text-[13px] text-[var(--color-slate)]`}>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-[26px] gap-y-1">
          <Link href="/jobs" className={link}>Search jobs</Link>
          <Link href="/saved" className={link}>Saved jobs</Link>
          <Link href="/about" className={link}>About</Link>
          <Link href="/about#employer-removal" className={link}>Employer removal requests</Link>
        </nav>
        <p className="mt-4 border-t border-[var(--color-rule)] pt-4">
          Healthcare jobs across Canada. Listings belong to the employers who posted them;{' '}
          {SITE.name} links, it does not republish applications.
        </p>
      </div>
    </footer>
  );
}
