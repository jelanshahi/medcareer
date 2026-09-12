import Link from 'next/link';
import { SITE } from '@/lib/site';
import { CONTAINER } from '@/lib/ui/styles';

// Sticky translucent bar from the v2 canvas. Two deliberate departures, both
// recorded in spec 2.3:
//
//  - The canvas's fourth nav item is a green "Get job alerts" pill. There is
//    no alerts backend and no decision to store email addresses, so the slot
//    is left EMPTY rather than refilled with a substitute CTA.
//  - The canvas labels its second item "Save jobs", but that item's handler
//    opens a landing page — there is no save feature to build. The slot keeps
//    its position and destination; the label says what it actually does.
export function Header() {
  const navLink =
    'py-[11px] text-[var(--color-ink)] opacity-[.88] no-underline hover:opacity-100 hover:no-underline';

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-header-rule)] bg-[var(--color-header-bg)] backdrop-blur-[20px] backdrop-saturate-[180%]">
      <div className={`${CONTAINER} flex min-h-[48px] flex-wrap items-center gap-x-[26px] gap-y-1.5`}>
        <Link
          href="/"
          className="py-[11px] text-[19px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:no-underline"
        >
          {SITE.name}
        </Link>
        <nav
          aria-label="Primary"
          className="ml-auto flex flex-wrap items-center gap-x-[26px] gap-y-1.5 text-[13px] tracking-[-0.005em]"
        >
          <Link href="/jobs" className={navLink}>Search</Link>
          <Link href="/browse" className={navLink}>Browse by city</Link>
          <Link href="/about" className={navLink}>About</Link>
        </nav>
      </div>
    </header>
  );
}
