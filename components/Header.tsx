'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import { Logo } from '@/components/Logo';
import { SITE } from '@/lib/site';
import { CONTAINER, PILL_PRIMARY } from '@/lib/ui/styles';

// Sticky translucent bar from the v2 canvas. The nav's "Save jobs" slot
// (spec 2.3) was a stub for a long time — no save feature existed, so it
// pointed at /browse instead. It now points at the real thing; see
// docs/superpowers/specs/2026-09-13-saved-jobs-design.md. /browse itself
// (and its city/discipline sub-pages) is untouched and still reachable
// directly — it's just no longer in primary nav.
//
// Below 640px the four nav slots cannot share a row with the wordmark, and
// letting them wrap cost a third of a phone screen before any content. So the
// bar keeps one 52px row at every width and the links move into a drop panel.
const NAV = [
  { href: '/jobs', label: 'Search' },
  { href: '/saved', label: 'Saved jobs' },
  { href: '/about', label: 'About' },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);

  const navLink =
    'py-[11px] text-[var(--color-ink)] opacity-[.88] no-underline hover:opacity-100 hover:no-underline';

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Next's Link only scrolls on a hash change, so re-clicking this while
  // already at "#job-alerts" (or after scrolling away from it) is a no-op —
  // only a fresh page load re-triggers it. Scroll manually whenever the
  // target is already on the page; otherwise fall through to a normal
  // navigation to "/#job-alerts", which scrolls on load like usual.
  const scrollToJobAlerts = (e: MouseEvent<HTMLAnchorElement>) => {
    setOpen(false);
    const target = document.getElementById('job-alerts');
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', '/#job-alerts');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-header-rule)] bg-[var(--color-header-bg)] backdrop-blur-[20px] backdrop-saturate-[180%]">
      {/* Above the click-away overlay, so the toggle stays hittable while open. */}
      <div className={`${CONTAINER} relative z-10 flex min-h-[52px] items-center gap-x-[26px]`}>
        <Link
          href="/"
          className="flex items-center gap-2 py-[11px] text-[19px] font-semibold tracking-[-0.02em] text-[var(--color-ink)] no-underline hover:text-[var(--color-ink)] hover:no-underline"
        >
          <Logo />
          {SITE.name}
        </Link>

        <nav
          aria-label="Primary"
          className="ml-auto hidden items-center gap-x-[26px] text-[13px] tracking-[-0.005em] sm:flex"
        >
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className={navLink}>
              {label}
            </Link>
          ))}
          <Link
            href="/#job-alerts"
            onClick={scrollToJobAlerts}
            className={`${PILL_PRIMARY} min-h-0 px-[18px] py-[9px] text-[13px]`}
          >
            Get job alerts
          </Link>
        </nav>

        {/* -mr-2 pulls the 44px tap target back onto the 22px gutter optically. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 ml-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-0 bg-transparent hover:bg-[var(--color-chip)] sm:hidden"
        >
          <span aria-hidden className="relative block h-[11px] w-[19px]">
            <span
              className={`absolute inset-x-0 top-0 h-[2px] rounded-full bg-[var(--color-ink)] transition-transform duration-200 ${
                open ? 'translate-y-[4.5px] rotate-45' : ''
              }`}
            />
            <span
              className={`absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[var(--color-ink)] transition-transform duration-200 ${
                open ? '-translate-y-[4.5px] -rotate-45' : ''
              }`}
            />
          </span>
        </button>
      </div>

      {open && (
        <>
          {/* Click-away. Absolute rather than fixed on purpose: the header's
              backdrop-filter makes it the containing block for fixed
              descendants, so `fixed inset-0` here would only ever cover the
              52px bar itself. */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-x-0 top-full z-0 h-svh sm:hidden"
          />
          {/* Absolute, not in flow: an in-flow panel would grow the sticky bar
              and shove the page down every time the menu opened. */}
          <nav
            id="mobile-nav"
            aria-label="Primary"
            className="absolute inset-x-0 top-full z-10 origin-top animate-[nav-drop_.16s_ease-out] border-b border-[var(--color-header-rule)] bg-[var(--color-surface-hover)] shadow-[0_10px_24px_rgba(0,0,0,0.08)] sm:hidden"
          >
            <div className={`${CONTAINER} flex flex-col py-2`}>
              {/* Rules go between links only — `last:` can't express that here,
                  since the alerts pill is the flex container's last child. */}
              {NAV.map(({ href, label }, i) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-[48px] items-center text-[17px] text-[var(--color-ink)] no-underline hover:no-underline ${
                    i < NAV.length - 1 ? 'border-b border-[var(--color-divider)]' : ''
                  }`}
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/#job-alerts"
                onClick={scrollToJobAlerts}
                className={`${PILL_PRIMARY} mt-3 mb-2 w-full`}
              >
                Get job alerts
              </Link>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
