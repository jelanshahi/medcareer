import Link from 'next/link';

// Same reasoning as app/about/page.tsx: without this, Next's built-in
// /_not-found is statically prerendered, its bootstrap scripts carry no
// per-request nonce, and the nonce-based CSP in proxy.ts blocks them in a
// real browser. This custom not-found.tsx exists specifically so it can be
// forced dynamic.
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <article className="px-4 py-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-4">
        We couldn&rsquo;t find that page.{' '}
        <Link href="/" className="text-[var(--color-signal)] underline">
          Back to job search
        </Link>
      </p>
    </article>
  );
}
