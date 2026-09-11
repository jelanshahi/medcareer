import Link from 'next/link';

// Same reasoning as app/about/page.tsx: without this, Next's built-in
// /_not-found is statically prerendered, its bootstrap scripts carry no
// per-request nonce, and the nonce-based CSP in proxy.ts blocks them in a
// real browser. This custom not-found.tsx exists specifically so it can be
// forced dynamic.
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <article className="mx-auto max-w-[760px] px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold uppercase leading-none tracking-wide">
        Page not found
      </h1>
      <p className="mt-4 text-lg text-[var(--color-body)]">
        We couldn&rsquo;t find that page.{' '}
        <Link href="/jobs" className="font-semibold text-[var(--color-signal)]">
          Back to job search
        </Link>
      </p>
    </article>
  );
}
