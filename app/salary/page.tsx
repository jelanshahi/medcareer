import Link from 'next/link';
import type { Metadata } from 'next';
import { loadCatalog } from '@/lib/jobs/catalog';
import { paths } from '@/lib/jobs/links';
import { formatPay, summarizePay, PAY_INDEX_THRESHOLD } from '@/lib/jobs/pay';
import { ROLES } from '@/lib/taxonomy/roles';
import { pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { H2, LIST, LIST_ROW, SECTION } from '@/lib/ui/styles';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: `Healthcare pay in Canada by role | ${SITE.name}`,
  description:
    'What Canadian hospitals and health authorities are posting for nurses, PSWs, pharmacists, therapists and more — from the pay bands on live job postings.',
  path: paths.salaries(),
});

export default async function SalaryIndexPage() {
  const jobs = await loadCatalog();
  const rows = ROLES.map((role) => ({ role, pay: summarizePay(jobs.filter((j) => j.role === role.slug)) }))
    .filter((r): r is { role: (typeof ROLES)[number]; pay: NonNullable<typeof r.pay> } => r.pay !== null && r.pay.count >= PAY_INDEX_THRESHOLD)
    .sort((a, b) => b.pay.count - a.pay.count);

  return (
    <>
      <LandingHero
        eyebrow={SITE.name}
        title="Healthcare pay by role"
        intro="Built only from the pay bands employers publish on their current postings — no surveys, no estimates. Each figure is the typical midpoint of those bands."
      />
      <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
        <h2 className={`m-0 ${H2}`}>Roles</h2>
        <ul className={`${LIST} mt-4`}>
          {rows.map(({ role, pay }) => (
            <li key={role.slug} className={LIST_ROW}>
              <Link
                href={paths.salary(role.slug)}
                className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4 text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:no-underline"
              >
                <span className="text-[18px] font-medium">{role.label}</span>
                <span className="text-[16px] tabular-nums text-[var(--color-slate)]">
                  {formatPay(pay.median, pay.period)} · {pay.count} postings
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
