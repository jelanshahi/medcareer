import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { provinceName } from '@/lib/provinces';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
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

async function resolve(slug: string) {
  const jobs = (await loadCatalog()).filter((j) => j.employerSlug === slug);
  // Slugs are derived, so two spellings of one employer could share one; the most common
  // spelling names the page.
  const name = countBy(jobs, (j) => j.employer_name)[0]?.[0] ?? null;
  return { name, jobs };
}

export async function generateMetadata(props: PageProps<'/employers/[employer]'>): Promise<Metadata> {
  const { employer } = await props.params;
  const { name, jobs } = await resolve(employer);
  if (!name) return { title: `Not found | ${SITE.name}` };
  const provinces = countBy(jobs, (j) => j.province).map(([p]) => provinceName(p));
  return pageMeta({
    title: `${name} jobs | ${SITE.name}`,
    description:
      `${jobs.length} open ${jobs.length === 1 ? 'position' : 'positions'} at ${name} in ${provinces.slice(0, 2).join(' and ')}. ` +
      'Nursing, allied health, support and other roles, refreshed every six hours.',
    path: paths.employer(employer),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function EmployerPage(props: PageProps<'/employers/[employer]'>) {
  const { employer } = await props.params;
  const { name, jobs } = await resolve(employer);
  if (!name) notFound();

  const cities = countBy(jobs, (j) => j.city).filter(([city]) => isIndexableCity(city));
  const disciplineLinks: CountLink[] = countBy(jobs, (j) => j.category).map(([c, count]) => ({
    href: buildJobsQuery({ employer: [name], category: [c as Category] }),
    label: CATEGORY_LABELS[c as Category] ?? c,
    count,
  }));
  const roleLinks: CountLink[] = countBy(jobs, (j) => j.role)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .slice(0, 10)
    .map(([r, count]) => ({ href: paths.role(r), label: roleBySlug(r)?.label ?? r, count }));
  const cityLinks: CountLink[] = cities
    .slice(0, 15)
    .map(([city, count]) => ({ href: paths.city(city), label: city, count }));

  return (
    <>
      <LandingHero
        eyebrow={`${SITE.name} · Employers`}
        title={`Jobs at ${name}`}
        intro={
          `${jobs.length} open ${jobs.length === 1 ? 'position' : 'positions'} across ${cities.length} ` +
          `${cities.length === 1 ? 'location' : 'locations'}. Applications go to ${name}'s own careers site; ${SITE.name} only lists them.`
        }
      />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Newest openings</h2>
          <LandingJobList
            jobs={newest(jobs, LIST_LIMIT)}
            seeAllHref={buildJobsQuery({ employer: [name] })}
            seeAllLabel={`See all ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} at ${name}`}
          />
          <GlancePanel rows={buildGlance(jobs).filter((r) => r.label !== 'Hiring here')} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title="By discipline" items={disciplineLinks} />
          <LinkCountCard title="Common roles" items={roleLinks} />
          <LinkCountCard title="Locations" items={cityLinks} />
        </aside>
      </div>
    </>
  );
}
