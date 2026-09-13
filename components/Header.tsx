'use client';

import Link from 'next/link';
import type { MouseEvent } from 'react';
import { SITE } from '@/lib/site';
import { CONTAINER, PILL_PRIMARY } from '@/lib/ui/styles';

// Sticky translucent bar from the v2 canvas. One deliberate departure,
// recorded in spec 2.3:
//
//  - The canvas labels its second item "Save jobs", but that item's handler
//    opens a landing page — there is no save feature to build. The slot keeps
//    its position and destination; the label says what it actually does.
export function Header() {
  const navLink =
    'py-[11px] text-[var(--color-ink)] opacity-[.88] no-underline hover:opacity-100 hover:no-underline';

  // Next's Link only scrolls on a hash change, so re-clicking this while
  // already at "#job-alerts" (or after scrolling away from it) is a no-op —
  // only a fresh page load re-triggers it. Scroll manually whenever the
  // target is already on the page; otherwise fall through to a normal
  // navigation to "/#job-alerts", which scrolls on load like usual.
  const scrollToJobAlerts = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById('job-alerts');
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', '/#job-alerts');
  };

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
          <Link
            href="/#job-alerts"
            onClick={scrollToJobAlerts}
            className={`${PILL_PRIMARY} min-h-0 px-[18px] py-[9px] text-[13px]`}
          >
            Get job alerts
          </Link>
        </nav>
      </div>
    </header>
  );
}
