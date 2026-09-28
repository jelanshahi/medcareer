import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { loadCatalog, newest, countBy } from '@/lib/jobs/catalog';
import { buildGlance } from '@/lib/jobs/glance';
import { paths } from '@/lib/jobs/links';
import { LINK_THRESHOLD } from '@/lib/jobs/landing';
import { provinceFromSlug, provinceName } from '@/lib/provinces';
import { CATEGORIES, CATEGORY_LABELS, categoryFromSlug, categorySlug, type Category } from '@/lib/taxonomy/categories';
import { categoryBlurb } from '@/lib/taxonomy/blurbs';
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

async function resolve(provinceSlugParam: string, disciplineSlug: string) {
  const code = provinceFromSlug(provinceSlugParam);
  const category = categoryFromSlug(disciplineSlug);
  const all = code && category ? await loadCatalog() : [];
  const inProvince = all.filter((j) => j.province === code);
  const jobs = inProvince.filter((j) => j.category === category);
  return { code, category, all, inProvince, jobs };
}

export async function generateMetadata(props: PageProps<'/province/[province]/[discipline]'>): Promise<Metadata> {
  const { province, discipline } = await props.params;
  const { code, category, jobs } = await resolve(province, discipline);
  if (!code || !category || jobs.length === 0) return { title: `Not found | ${SITE.name}` };
  const label = CATEGORY_LABELS[category];
  const name = provinceName(code);
  return pageMeta({
    title: `${label} jobs in ${name} | ${SITE.name}`,
    description:
      `${jobs.length} active ${label.toLowerCase()} ${jobs.length === 1 ? 'listing' : 'listings'} in ${name}, ` +
      'pulled from hospital and health authority career sites and refreshed every six hours.',
    path: paths.provinceDiscipline(code, category),
    noindex: jobs.length < INDEX_THRESHOLD,
  });
}

export default async function ProvinceDisciplinePage(props: PageProps<'/province/[province]/[discipline]'>) {
  const { province, discipline } = await props.params;
  const { code, category, all, inProvince, jobs } = await resolve(province, discipline);
  if (!code || !category || jobs.length === 0) notFound();
  if (discipline !== categorySlug(category)) permanentRedirect(paths.provinceDiscipline(code, category));

  const label = CATEGORY_LABELS[category];
  const name = provinceName(code);

  const cityLinks: CountLink[] = countBy(jobs, (j) => j.city)
    .filter(([city, n]) => isIndexableCity(city) && n >= LINK_THRESHOLD)
    .slice(0, 15)
    .map(([city, count]) => ({ href: paths.cityDiscipline(city, category), label: city, count }));
  const roleLinks: CountLink[] = countBy(jobs, (j) => j.role)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .map(([r, count]) => ({ href: paths.roleProvince(r, code), label: roleBySlug(r)?.label ?? r, count }));
  const otherDisciplines: CountLink[] = CATEGORIES.filter((c) => c !== category)
    .map((c) => ({ href: paths.provinceDiscipline(code, c), label: CATEGORY_LABELS[c], count: inProvince.filter((j) => j.category === c).length }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);
  const otherProvinces: CountLink[] = countBy(all.filter((j) => j.category === category && j.province !== code), (j) => j.province)
    .filter(([, n]) => n >= LINK_THRESHOLD)
    .map(([p, count]) => ({ href: paths.provinceDiscipline(p, category as Category), label: `${label} in ${provinceName(p)}`, count }));

  return (
    <>
      <LandingHero eyebrow={`${name} · ${label}`} title={`${label} jobs in ${name}`} intro={categoryBlurb(category, code)} />

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>
            {jobs.length} open {label.toLowerCase()} {jobs.length === 1 ? 'role' : 'roles'} in {name}
          </h2>
          <LandingJobList jobs={newest(jobs, LIST_LIMIT)} />
          <GlancePanel rows={buildGlance(jobs)} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title={`Roles`} items={roleLinks} />
          <LinkCountCard title={`${label} by city`} items={cityLinks} />
          <LinkCountCard title={`Other disciplines in ${name}`} items={otherDisciplines} />
          <LinkCountCard title={`${label} in other provinces`} items={otherProvinces} />
        </aside>
      </div>
    </>
  );
}
