import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { formatPay, summarizePay } from '@/lib/jobs/pay';
import { provinceName } from '@/lib/provinces';
import { roleBySlug } from '@/lib/taxonomy/roles';
import { INDEX_THRESHOLD, pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { LandingJobList } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { GlancePanel } from '@/components/GlancePanel';
import { CONTAINER, H2 } from '@/lib/ui/styles';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

const LIST_LIMIT = 15;

async function resolve(slug: string) {
  const role = roleBySlug(slug);
  const jobs = role ? (await loadCatalog()).filter((j) => j.role === role.slug) : [];
  return { role, jobs };
}

export async function generateMetadata(props: PageProps<'/roles/[role]'>): Promise<Metadata> {
  const { role: slug } = await props.params;
  const { role, jobs } = await resolve(slug);
  if (!role || jobs.length === 0) return { title: `Not found | ${SITE.name}` };
  const provinces = new Set(jobs.map((j) => j.province)).size;
  const pay = summarizePay(jobs);
  return pageMeta({
    title: `${role.label} jobs in Canada | ${SITE.name}`,
    description:
      `${jobs.length} open ${role.label.toLowerCase()} ${jobs.length === 1 ? 'job' : 'jobs'} across ${provinces} ` +
      `${provinces === 1 ? 'province' : 'provinces'}` +
      (pay ? `, typically ${formatPay(pay.median, pay.period)} where pay is posted` : '') +
      '. Apply directly on each employer’s site.',
    path: paths.role(role.slug),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function RolePage(props: PageProps<'/roles/[role]'>) {
  const { role: slug } = await props.params;
  const { role, jobs } = await resolve(slug);
  if (!role || jobs.length === 0) notFound();

  const pay = summarizePay(jobs);
  const provinceLinks: CountLink[] = countBy(jobs, (j) => j.province).map(([p, count]) => ({
    href: count >= LINK_THRESHOLD ? paths.roleProvince(role.slug, p) : buildJobsQuery({ q: role.searchQuery }),
    label: provinceName(p),
    count,
  }));
  const employerLinks: CountLink[] = countBy(jobs, (j) => j.employer_name)
    .slice(0, 10)
    .map(([employer, count]) => ({ href: paths.employer(jobs.find((j) => j.employer_name === employer)!.employerSlug), label: employer, count }));
  const payLinks: CountLink[] = pay
    ? [{ href: paths.salary(role.slug), label: `Median ${formatPay(pay.median, pay.period)}`, count: pay.count }]
    : [];

  return (
    <>
      <LandingHero
        eyebrow={`${SITE.name} · Roles`}
        title={`${role.label} jobs in Canada`}
        intro={
          `${jobs.length} open ${jobs.length === 1 ? 'posting' : 'postings'} from ` +
          `${new Set(jobs.map((j) => j.employer_name)).size} hospitals, health authorities and care homes, refreshed every six hours.`
        }
      />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Newest {role.label.toLowerCase()} openings</h2>
          <LandingJobList
            jobs={newest(jobs, LIST_LIMIT)}
            seeAllHref={buildJobsQuery({ q: role.searchQuery })}
            seeAllLabel={`Search all ${role.label.toLowerCase()} jobs`}
          />
          <GlancePanel rows={buildGlance(jobs).filter((r) => r.label !== 'Hiring here')} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title="By province" items={provinceLinks} />
          <LinkCountCard title={`${role.label} pay (postings with a band)`} items={payLinks} />
          <LinkCountCard title="Employers hiring" items={employerLinks} />
        </aside>
      </div>
    </>
  );
}
