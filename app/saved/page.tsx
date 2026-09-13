import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { SavedJobsView } from '@/components/SavedJobsView';
import { EYEBROW, SECTION } from '@/lib/ui/styles';

// Same nonce-based-CSP reasoning as app/about/page.tsx and app/browse/page.tsx:
// a prerendered route bakes its bootstrap <script> nonce at build time, and
// proxy.ts hands out a fresh nonce per request, so this must stay dynamic.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Saved jobs | ${SITE.name}`,
  description: 'Healthcare jobs you have bookmarked, kept in this browser.',
};

export default function SavedPage() {
  return (
    <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
      <div className={EYEBROW}>{SITE.name}</div>
      <h1 className="mt-1.5 text-balance text-[clamp(30px,4.4vw,44px)] font-semibold leading-[1.08] tracking-[-0.02em]">
        Saved jobs
      </h1>
      <p className="mt-2.5 max-w-[34em] text-[17px] text-[var(--color-slate)]">
        Saved on this device only — there is no account to sign into.
      </p>
      <SavedJobsView />
    </section>
  );
}
