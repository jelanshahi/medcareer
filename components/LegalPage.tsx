import type { ReactNode } from 'react';
import { SITE } from '@/lib/site';

export const LEGAL_UPDATED = 'September 29, 2026';

/** Shared shell for the privacy, cookie and terms pages: same 720px measure
 * and heading scale as /about. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-[720px] px-[22px] pb-20 pt-[clamp(44px,7vw,72px)]">
      <h1 className="m-0 text-[clamp(34px,5.4vw,52px)] font-semibold leading-[1.06] tracking-[-0.025em]">
        {title}
      </h1>
      <p className="mt-3 text-[15px] text-[var(--color-meta)]">Last updated {LEGAL_UPDATED}</p>
      <p className="mt-4 text-[19px] leading-[1.45] text-[var(--color-slate)]">{intro}</p>
      {children}
      <p className="mt-10 text-[15px] text-[var(--color-slate)]">
        Questions about this page: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mt-10 text-[24px] font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[17px] leading-[1.6] [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}
