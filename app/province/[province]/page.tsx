import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { provinceFromSlug, provinceName } from '@/lib/provinces';
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
  const code = provinceFromSlug(slug);
  const jobs = code ? (await loadCatalog()).filter((j) => j.province === code) : [];
  return { code, jobs };
}

export async function generateMetadata(props: PageProps<'/province/[province]'>): Promise<Metadata> {
  const { province } = await props.params;
  const { code, jobs } = await resolve(province);
  if (!code || jobs.length === 0) return { title: `Not found | ${SITE.name}` };
  const name = provinceName(code);
  const employers = new Set(jobs.map((j) => j.employer_name)).size;
  return pageMeta({
    title: `Healthcare jobs in ${name} | ${SITE.name}`,
    description:
      `${jobs.length} active healthcare ${jobs.length === 1 ? 'job' : 'jobs'} in ${name} from ${employers} ` +
      `${employers === 1 ? 'employer' : 'employers'}: nursing, PSW, allied health and more, refreshed every six hours.`,
    path: paths.province(code),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function ProvincePage(props: PageProps<'/province/[province]'>) {
  const { province } = await props.params;
  const { code, jobs } = await resolve(province);
  if (!code || jobs.length === 0) notFound();

  const name = provinceName(code);
  const employers = countBy(jobs, (j) => j.employer_name);
  const cities = countBy(jobs, (j) => j.city).filter(([city]) => isIndexableCity(city));

  const disciplineLinks: CountLink[] = countBy(jobs, (j) => j.category)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .map(([c, count]) => ({ href: paths.provinceDiscipline(code, c as Category), label: CATEGORY_LABELS[c as Category] ?? c, count }));
  const roleLinks: CountLink[] = countBy(jobs, (j) => j.role)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .slice(0, 12)
    .map(([r, count]) => ({ href: paths.roleProvince(r, code), label: roleBySlug(r)?.label ?? r, count }));
  const cityLinks: CountLink[] = cities
    .slice(0, 15)
    .map(([city, count]) => ({ href: paths.city(city), label: city, count }));
  const employerLinks: CountLink[] = employers
    .slice(0, 12)
    .map(([employer, count]) => ({ href: paths.employer(jobs.find((j) => j.employer_name === employer)!.employerSlug), label: employer, count }));

  return (
    <>
      <LandingHero
        eyebrow={`${SITE.name} · ${name}`}
        title={`Healthcare jobs in ${name}`}
        intro={
          `${jobs.length} active ${jobs.length === 1 ? 'listing' : 'listings'} from ${employers.length} ` +
          `${employers.length === 1 ? 'employer' : 'employers'} in ${cities.length} ` +
          `${cities.length === 1 ? 'community' : 'communities'}, pulled from hospital and health authority career sites and refreshed every six hours.`
        }
      />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Newest openings in {name}</h2>
          <LandingJobList jobs={newest(jobs, LIST_LIMIT)} />
          <GlancePanel rows={buildGlance(jobs).filter((r) => r.label !== 'Hiring here')} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title={`Disciplines in ${name}`} items={disciplineLinks} />
          <LinkCountCard title={`Top roles in ${name}`} items={roleLinks} />
          <LinkCountCard title="Cities" items={cityLinks} />
          <LinkCountCard title="Employers hiring" items={employerLinks} />
        </aside>
      </div>
    </>
  );
}
