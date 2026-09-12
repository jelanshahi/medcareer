import Link from 'next/link';
import { PILL_PRIMARY } from '@/lib/ui/styles';

// Same reasoning as app/about/page.tsx: without this, Next's built-in
// /_not-found is statically prerendered, its bootstrap scripts carry no
// per-request nonce, and the nonce-based CSP in proxy.ts blocks them in a
// real browser. This custom not-found.tsx exists specifically so it can be
// forced dynamic.
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <article className="mx-auto max-w-[720px] px-[22px] py-16 text-center">
      <h1 className="m-0 text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.08] tracking-[-0.025em]">
        Page not found
      </h1>
      <p className="mx-auto mt-3 max-w-[34em] text-[17px] text-[var(--color-slate)]">
        We couldn&rsquo;t find that page.
      </p>
      <Link href="/jobs" className={`${PILL_PRIMARY} mt-5`}>Back to job search</Link>
    </article>
  );
}
