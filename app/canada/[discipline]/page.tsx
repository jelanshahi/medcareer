import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { lowerFirst } from '@/lib/format';
import { loadCatalog, newest, countBy, type CatalogJob } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { provinceName } from '@/lib/provinces';
import { CATEGORIES, CATEGORY_LABELS, categoryFromSlug, categorySlug, type Category } from '@/lib/taxonomy/categories';
import { categoryBlurb } from '@/lib/taxonomy/blurbs';
import { roleBySlug } from '@/lib/taxonomy/roles';
import { roleHeading, type Faq } from '@/lib/taxonomy/role-content';
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

/**
 * A discipline nationwide: the page "nurse jobs in Canada" should land on. It sits above
 * the role pages (RN, LPN/RPN, NP all under nursing) and beside the per-province discipline
 * pages. It replaces /jobs?category=… as the indexed national view, which is a search
 * results page and is now noindexed in favour of this one.
 */
const HEADINGS: Partial<Record<Category, string>> = {
  nursing: 'Nurse jobs',
};

function heading(category: Category): string {
  return `${HEADINGS[category] ?? `${CATEGORY_LABELS[category]} jobs`} in Canada`;
}

async function resolve(disciplineSlug: string) {
  const category = categoryFromSlug(disciplineSlug);
  const all = category ? await loadCatalog() : [];
  return { category, all, jobs: all.filter((j) => j.category === category) };
}

function dataFaqs(title: string, jobs: CatalogJob[]): Faq[] {
  const roles = countBy(jobs, (j) => j.role).slice(0, 4).map(([r, n]) => `${lowerFirst(roleBySlug(r)?.label ?? r)} (${n})`);
  const provinces = countBy(jobs, (j) => j.province).slice(0, 4).map(([p, n]) => `${provinceName(p)} (${n})`);
  const employers = new Set(jobs.map((j) => j.employer_name)).size;
  return [
    {
      question: `How many ${lowerFirst(title)} are open right now?`,
      answer:
        `${jobs.length} open postings from ${employers} ${employers === 1 ? 'employer' : 'employers'} at the last refresh` +
        (roles.length > 1 ? `, including ${roles.join(', ')}.` : '.'),
    },
    ...(provinces.length > 1
      ? [{ question: 'Which provinces have the most openings?', answer: `${provinces.join(', ')}, at the last refresh.` }]
      : []),
  ];
}

export async function generateMetadata(props: PageProps<'/canada/[discipline]'>): Promise<Metadata> {
  const { discipline } = await props.params;
  const { category, jobs } = await resolve(discipline);
  if (!category || jobs.length === 0) return { title: `Not found | ${SITE.name}` };
  const provinces = new Set(jobs.map((j) => j.province)).size;
  return pageMeta({
    title: `${heading(category)} | ${SITE.name}`,
    description:
      `${jobs.length} open ${lowerFirst(CATEGORY_LABELS[category])} jobs across ${provinces} ` +
      `${provinces === 1 ? 'province' : 'provinces'} from hospitals, health authorities and care homes. ` +
      'Refreshed every six hours; apply on each employer’s own site.',
    path: paths.nationalDiscipline(category),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function NationalDisciplinePage(props: PageProps<'/canada/[discipline]'>) {
  const { discipline } = await props.params;
  const { category, all, jobs } = await resolve(discipline);
  if (!category || jobs.length === 0) notFound();
  if (discipline !== categorySlug(category)) permanentRedirect(paths.nationalDiscipline(category));

  const label = CATEGORY_LABELS[category];
  const title = heading(category);
  const listed = newest(jobs, LIST_LIMIT);
  const faqs = dataFaqs(title, jobs);

  const roleLinks: CountLink[] = countBy(jobs, (j) => j.role)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .map(([r, count]) => ({ href: paths.role(r), label: roleHeading(roleBySlug(r)!, 'Canada'), count }));
  const provinceLinks: CountLink[] = countBy(jobs, (j) => j.province)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .map(([p, count]) => ({ href: paths.provinceDiscipline(p, category), label: provinceName(p), count }));
  const otherDisciplines: CountLink[] = CATEGORIES.filter((c) => c !== category)
    .map((c) => ({ href: paths.nationalDiscipline(c), label: CATEGORY_LABELS[c], count: all.filter((j) => j.category === c).length }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <JsonLd
        data={[breadcrumbLd([{ name: 'Home', path: '/' }, { name: title }]), jobListLd(title, listed), faqLd(faqs)]}
      />
      <LandingHero eyebrow={`${SITE.name} · ${label}`} title={title} intro={categoryBlurb(category, null)} />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>
            {jobs.length} open {lowerFirst(label)} {jobs.length === 1 ? 'role' : 'roles'}
          </h2>
          <LandingJobList
            jobs={listed}
            seeAllHref={buildJobsQuery({ category: [category] })}
            seeAllLabel={`Search and filter all ${jobs.length} ${lowerFirst(label)} jobs`}
          />
          <GlancePanel rows={buildGlance(jobs)} />
          <FaqSection title="Common questions" faqs={faqs} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title="By role" items={roleLinks} />
          <LinkCountCard title="By province" items={provinceLinks} />
          <LinkCountCard title="Other disciplines" items={otherDisciplines} />
        </aside>
      </div>
    </>
  );
}
