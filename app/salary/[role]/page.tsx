import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { formatPay, summarizePay, PAY_INDEX_THRESHOLD } from '@/lib/jobs/pay';
import { provinceName } from '@/lib/provinces';
import { roleBySlug } from '@/lib/taxonomy/roles';
import { pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { LandingJobList } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { CARD, CONTAINER, H2, H3 } from '@/lib/ui/styles';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

async function resolve(slug: string) {
  const role = roleBySlug(slug);
  const jobs = role ? (await loadCatalog()).filter((j) => j.role === role.slug) : [];
  return { role, jobs, pay: summarizePay(jobs) };
}

export async function generateMetadata(props: PageProps<'/salary/[role]'>): Promise<Metadata> {
  const { role: slug } = await props.params;
  const { role, pay } = await resolve(slug);
  if (!role || !pay) return { title: `Not found | ${SITE.name}` };
  return pageMeta({
    title: `${role.label} pay in Canada: ${formatPay(pay.median, pay.period)} typical | ${SITE.name}`,
    description:
      `${role.label} pay from ${pay.count} current job postings in Canada: typically ${formatPay(pay.median, pay.period)}, ` +
      `with the middle half between ${formatPay(pay.p25, pay.period)} and ${formatPay(pay.p75, pay.period)}. Broken down by province.`,
    path: paths.salary(role.slug),
    noindex: pay.count < PAY_INDEX_THRESHOLD,
  });
}

export default async function SalaryPage(props: PageProps<'/salary/[role]'>) {
  const { role: slug } = await props.params;
  const { role, jobs, pay } = await resolve(slug);
  if (!role || !pay) notFound();

  const byProvince = countBy(jobs, (j) => j.province)
    .map(([p]) => ({ province: p, pay: summarizePay(jobs.filter((j) => j.province === p)) }))
    .filter((r): r is { province: string; pay: NonNullable<typeof r.pay> } => r.pay !== null && r.pay.period === pay.period)
    .sort((a, b) => b.pay.median - a.pay.median);

  const banded = jobs.filter((j) => j.salary_min !== null && j.salary_max !== null && j.salary_period === pay.period);
  const figures = [
    { label: 'Typical (median midpoint)', value: formatPay(pay.median, pay.period) },
    { label: 'Middle half of postings', value: `${formatPay(pay.p25, pay.period)} – ${formatPay(pay.p75, pay.period)}` },
    { label: 'Lowest posted minimum', value: formatPay(pay.low, pay.period) },
    { label: 'Highest posted maximum', value: formatPay(pay.high, pay.period) },
  ];
  const related: CountLink[] = [
    { href: paths.role(role.slug), label: `${role.label} jobs in Canada`, count: jobs.length },
    ...countBy(jobs, (j) => j.province)
      .filter(([, n]) => n >= LINK_THRESHOLD)
      .map(([p, count]) => ({ href: paths.roleProvince(role.slug, p), label: `${role.label} jobs in ${provinceName(p)}`, count })),
  ];

  return (
    <>
      <LandingHero
        eyebrow={`${SITE.name} · Pay guide`}
        title={`${role.label} pay in Canada`}
        intro={
          `Typically ${formatPay(pay.median, pay.period)}, based on the pay bands published on ${pay.count} current ` +
          `${pay.count === 1 ? 'posting' : 'postings'}. Figures update every six hours as postings open and close.`
        }
      />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <div className={`${CARD} grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-4 p-5`}>
            {figures.map((f) => (
              <div key={f.label}>
                <div className="text-[13px] text-[var(--color-slate)]">{f.label}</div>
                <div className="mt-0.5 text-[22px] font-semibold tabular-nums">{f.value}</div>
              </div>
            ))}
          </div>

          {byProvince.length > 0 && (
            <>
              <h2 className={`mt-10 ${H2}`}>By province</h2>
              <div className={`${CARD} mt-4 overflow-x-auto p-2`}>
                <table className="w-full border-collapse text-left text-[16px] tabular-nums">
                  <thead>
                    <tr className="text-[13px] text-[var(--color-slate)]">
                      <th className="px-3 py-2 font-normal">Province</th>
                      <th className="px-3 py-2 font-normal">Typical</th>
                      <th className="px-3 py-2 font-normal">Range posted</th>
                      <th className="px-3 py-2 font-normal">Postings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProvince.map(({ province, pay: p }) => (
                      <tr key={province} className="border-t border-[var(--color-divider)]">
                        <td className="px-3 py-2.5">
                          {p.count >= LINK_THRESHOLD ? (
                            <Link href={paths.roleProvince(role.slug, province)}>{provinceName(province)}</Link>
                          ) : (
                            provinceName(province)
                          )}
                        </td>
                        <td className="px-3 py-2.5">{formatPay(p.median, p.period)}</td>
                        <td className="px-3 py-2.5">{formatPay(p.low, p.period)} – {formatPay(p.high, p.period)}</td>
                        <td className="px-3 py-2.5">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className={`mt-10 ${H2}`}>Recent postings with pay</h2>
          <LandingJobList jobs={newest(banded, 10)} />

          <div className={`${CARD} mt-8 p-5 text-[15px] leading-[1.55] text-[var(--color-slate)]`}>
            <div className={`${H3} text-[var(--color-ink)]`}>How these figures are made</div>
            <p className="mt-2">
              Each posting&apos;s published band is reduced to its midpoint, and the typical figure is the median of those
              midpoints. Postings without a band are left out, and {pay.period === 'hour' ? 'annual' : 'hourly'} bands are
              not converted or mixed in. Union scales, steps, premiums and overtime are not reflected. Check each posting for
              the employer&apos;s exact terms.
            </p>
          </div>
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title="Open jobs" items={related} />
        </aside>
      </div>
    </>
  );
}
