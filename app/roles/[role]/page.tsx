import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { lowerFirst } from '@/lib/format';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { formatPay, summarizePay } from '@/lib/jobs/pay';
import { provinceName } from '@/lib/provinces';
import { CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { roleBySlug } from '@/lib/taxonomy/roles';
import { roleAbout, roleAliasTarget, roleFaqs, roleHeading, roleTitle, type Faq } from '@/lib/taxonomy/role-content';
import { INDEX_THRESHOLD, breadcrumbLd, faqLd, jobListLd, pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { LandingJobList } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { GlancePanel } from '@/components/GlancePanel';
import { FaqSection } from '@/components/FaqSection';
import { JsonLd } from '@/components/JsonLd';
import { CONTAINER, H2 } from '@/lib/ui/styles';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

const LIST_LIMIT = 15;

async function resolve(slug: string) {
  const role = roleBySlug(slug);
  const all = role ? await loadCatalog() : [];
  const jobs = role ? all.filter((j) => j.role === role.slug) : [];
  return { role, all, jobs };
}

/** Questions answered from the live postings, so they stay true between refreshes. */
function dataFaqs(heading: string, jobs: Awaited<ReturnType<typeof resolve>>['jobs']): Faq[] {
  const employers = new Set(jobs.map((j) => j.employer_name)).size;
  const top = countBy(jobs, (j) => j.province).slice(0, 3).map(([p, n]) => `${provinceName(p)} (${n})`);
  const pay = summarizePay(jobs);
  return [
    {
      question: `How many ${lowerFirst(heading)} are open right now?`,
      answer:
        `${jobs.length} open ${jobs.length === 1 ? 'posting' : 'postings'} from ${employers} ` +
        `${employers === 1 ? 'employer' : 'employers'} at the last refresh` +
        (top.length > 1 ? `. The most are in ${top.join(', ')}.` : '.'),
    },
    ...(pay
      ? [{
          question: `How much do ${lowerFirst(heading)} pay?`,
          answer:
            `Where employers publish a pay band (${pay.count} of ${jobs.length} postings), the midpoint is typically ` +
            `${formatPay(pay.median, pay.period)}, and the middle half of postings fall between ` +
            `${formatPay(pay.p25, pay.period)} and ${formatPay(pay.p75, pay.period)}. Pay varies by province, ` +
            'experience and collective agreement.',
        }]
      : []),
  ];
}

export async function generateMetadata(props: PageProps<'/roles/[role]'>): Promise<Metadata> {
  const { role: slug } = await props.params;
  const { role, jobs } = await resolve(slug);
  if (!role || jobs.length === 0) return { title: `Not found | ${SITE.name}` };
  const provinces = new Set(jobs.map((j) => j.province)).size;
  const pay = summarizePay(jobs);
  return pageMeta({
    title: `${roleTitle(role, 'Canada')} | ${SITE.name}`,
    description:
      `${jobs.length} open ${lowerFirst(role.label)} ${jobs.length === 1 ? 'job' : 'jobs'} across ${provinces} ` +
      `${provinces === 1 ? 'province' : 'provinces'}` +
      (pay ? `, typically ${formatPay(pay.median, pay.period)} where pay is posted` : '') +
      '. Apply directly on each employer’s site.',
    path: paths.role(role.slug),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function RolePage(props: PageProps<'/roles/[role]'>) {
  const { role: slug } = await props.params;
  const alias = roleAliasTarget(slug);
  if (alias) permanentRedirect(paths.role(alias));
  const { role, all, jobs } = await resolve(slug);
  if (!role || jobs.length === 0) notFound();

  const heading = roleHeading(role, 'Canada');
  const about = roleAbout(role);
  const faqs = [...dataFaqs(heading, jobs), ...roleFaqs(role)];
  const listed = newest(jobs, LIST_LIMIT);
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
  // Sibling roles in the same discipline (RN ↔ LPN/RPN ↔ NP), then the discipline itself.
  const categoryJobs = all.filter((j) => j.category === role.category);
  const relatedLinks: CountLink[] = [
    ...countBy(categoryJobs, (j) => (j.role !== role.slug ? j.role : null))
      .filter(([, n]) => n >= LINK_THRESHOLD)
      .map(([r, count]) => ({ href: paths.role(r), label: roleHeading(roleBySlug(r)!, 'Canada'), count })),
    ...(categoryJobs.length >= LINK_THRESHOLD
      ? [{ href: paths.nationalDiscipline(role.category), label: `All ${lowerFirst(CATEGORY_LABELS[role.category])} jobs`, count: categoryJobs.length }]
      : []),
  ];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Jobs by role', path: paths.roles() }, { name: heading }]),
          jobListLd(heading, listed),
          faqLd(faqs),
        ]}
      />
      <LandingHero
        eyebrow={`${SITE.name} · Roles`}
        title={heading}
        intro={
          `${jobs.length} open ${jobs.length === 1 ? 'posting' : 'postings'} from ` +
          `${new Set(jobs.map((j) => j.employer_name)).size} hospitals, health authorities and care homes, refreshed every six hours.`
        }
      />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          {about && <p className="mb-7 mt-0 text-[17px] leading-[1.6]">{about}</p>}
          <h2 className={`m-0 ${H2}`}>Newest {lowerFirst(role.label)} openings</h2>
          <LandingJobList
            jobs={listed}
            seeAllHref={buildJobsQuery({ q: role.searchQuery })}
            seeAllLabel={`Search all ${lowerFirst(role.label)} jobs`}
          />
          <GlancePanel rows={buildGlance(jobs).filter((r) => r.label !== 'Hiring here')} />
          <FaqSection title="Common questions" faqs={faqs} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title="By province" items={provinceLinks} />
          <LinkCountCard title={`${role.label} pay (postings with a band)`} items={payLinks} />
          <LinkCountCard title="Related roles" items={relatedLinks} />
          <LinkCountCard title="Employers hiring" items={employerLinks} />
        </aside>
      </div>
    </>
  );
}
