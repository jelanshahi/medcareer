import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { formatPay, summarizePay } from '@/lib/jobs/pay';
import { provinceFromSlug, provinceName } from '@/lib/provinces';
import { roleBySlug } from '@/lib/taxonomy/roles';
import { INDEX_THRESHOLD, isIndexableCity, pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { LandingJobList } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { GlancePanel } from '@/components/GlancePanel';
import { CONTAINER, H2 } from '@/lib/ui/styles';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

const LIST_LIMIT = 15;

async function resolve(roleSlug: string, provinceSlugParam: string) {
  const role = roleBySlug(roleSlug);
  const code = provinceFromSlug(provinceSlugParam);
  const all = role && code ? (await loadCatalog()).filter((j) => j.role === role.slug) : [];
  return { role, code, all, jobs: all.filter((j) => j.province === code) };
}

export async function generateMetadata(props: PageProps<'/roles/[role]/[province]'>): Promise<Metadata> {
  const { role: roleSlug, province } = await props.params;
  const { role, code, jobs } = await resolve(roleSlug, province);
  if (!role || !code || jobs.length === 0) return { title: `Not found | ${SITE.name}` };
  const name = provinceName(code);
  const pay = summarizePay(jobs);
  return pageMeta({
    title: `${role.label} jobs in ${name} | ${SITE.name}`,
    description:
      `${jobs.length} open ${role.label.toLowerCase()} ${jobs.length === 1 ? 'job' : 'jobs'} in ${name}` +
      (pay ? `, with posted pay typically around ${formatPay(pay.median, pay.period)}` : '') +
      '. Refreshed every six hours from employer career sites.',
    path: paths.roleProvince(role.slug, code),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function RoleProvincePage(props: PageProps<'/roles/[role]/[province]'>) {
  const { role: roleSlug, province } = await props.params;
  const { role, code, all, jobs } = await resolve(roleSlug, province);
  if (!role || !code || jobs.length === 0) notFound();

  const name = provinceName(code);
  const pay = summarizePay(jobs);

  const cityLinks: CountLink[] = countBy(jobs, (j) => j.city)
    .filter(([city]) => isIndexableCity(city))
    .slice(0, 15)
    .map(([city, count]) => ({ href: buildJobsQuery({ q: role.searchQuery, city: [city] }), label: city, count }));
  const otherProvinces: CountLink[] = countBy(all.filter((j) => j.province !== code), (j) => j.province)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .map(([p, count]) => ({ href: paths.roleProvince(role.slug, p), label: provinceName(p), count }));
  const employerLinks: CountLink[] = countBy(jobs, (j) => j.employer_name)
    .slice(0, 10)
    .map(([employer, count]) => ({ href: paths.employer(jobs.find((j) => j.employer_name === employer)!.employerSlug), label: employer, count }));

  const intro =
    `${jobs.length} open ${role.label.toLowerCase()} ${jobs.length === 1 ? 'posting' : 'postings'} in ${name}` +
    (pay
      ? `. Where employers publish a pay band (${pay.count} of ${jobs.length}), the midpoint is typically ${formatPay(pay.median, pay.period)}.`
      : ', refreshed every six hours.');

  return (
    <>
      <LandingHero eyebrow={`${name} · ${role.label}`} title={`${role.label} jobs in ${name}`} intro={intro} />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Newest {role.label.toLowerCase()} openings in {name}</h2>
          <LandingJobList jobs={newest(jobs, LIST_LIMIT)} />
          <GlancePanel rows={buildGlance(jobs).filter((r) => r.label !== 'Hiring here')} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title="By city" items={cityLinks} />
          <LinkCountCard title="Employers hiring" items={employerLinks} />
          <LinkCountCard title={`${role.label} in other provinces`} items={otherProvinces} />
          <LinkCountCard
            title="More"
            items={[
              { href: paths.role(role.slug), label: `${role.label} jobs across Canada`, count: all.length },
              ...(summarizePay(all) ? [{ href: paths.salary(role.slug), label: `${role.label} pay guide`, count: summarizePay(all)!.count }] : []),
            ]}
          />
        </aside>
      </div>
    </>
  );
}
