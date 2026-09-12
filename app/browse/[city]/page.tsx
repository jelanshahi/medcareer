import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/db/server';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { resolveCity, slugifyCity } from '@/lib/jobs/city-slug';
import { buildGlance, type GlanceJob } from '@/lib/jobs/glance';
import { loadLandingRows, countsByCity, pairCount, LINK_THRESHOLD } from '@/lib/jobs/landing';
import { LandingJobList, type LandingJob } from '@/components/LandingJobList';
import { LinkCountCard, type CountLink } from '@/components/LinkCountCard';
import { GlancePanel } from '@/components/GlancePanel';
import { SITE } from '@/lib/site';
import { CONTAINER, EYEBROW, H1, H2 } from '@/lib/ui/styles';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 10;
const JOB_COLUMNS =
  'slug,title,employer_name,facility_name,employment_type,salary_min,salary_max,salary_period,posted_at';

async function resolve(citySlug: string) {
  const rows = await loadLandingRows();
  const city = resolveCity(citySlug, Object.keys(countsByCity(rows)));
  return { rows, city };
}

export async function generateMetadata(props: PageProps<'/browse/[city]'>): Promise<Metadata> {
  const { city: citySlug } = await props.params;
  const { rows, city } = await resolve(citySlug);
  if (!city) return { title: `Not found | ${SITE.name}` };

  const count = countsByCity(rows)[city] ?? 0;
  return {
    title: `Healthcare jobs in ${city}, Ontario | ${SITE.name}`,
    description: `${count} active healthcare listings in ${city}, pulled from hospital career systems and refreshed every six hours.`,
  };
}

export default async function CityLandingPage(props: PageProps<'/browse/[city]'>) {
  const { city: citySlug } = await props.params;
  const { rows, city } = await resolve(citySlug);

  // An unrecognised city, or one with no active jobs, is a 404 — never an
  // empty landing page.
  if (!city) notFound();
  const total = countsByCity(rows)[city] ?? 0;
  if (total === 0) notFound();

  const db = createServerClient();
  // supabase-js resolves { data, error }; an unchecked error here would render
  // a real database failure as a legitimately empty city.
  const { data, error } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('is_active', true)
    .eq('city', city)
    .order('posted_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  const jobs = (data ?? []) as LandingJob[];

  const { data: glanceData, error: glanceError } = await db
    .from('jobs')
    .select('employer_name,employment_type,salary_min,salary_max,salary_period,posted_at')
    .eq('is_active', true)
    .eq('city', city);
  if (glanceError) throw glanceError;
  const glance = buildGlance((glanceData ?? []) as GlanceJob[]);

  const employers = [...new Set((glanceData ?? []).map((r) => r.employer_name))].sort();

  const disciplineLinks: CountLink[] = CATEGORIES.map((c) => ({
    href: `/browse/${slugifyCity(city)}/${c}`,
    label: CATEGORY_LABELS[c],
    count: pairCount(rows, city, c),
  }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  const otherCityLinks: CountLink[] = Object.entries(countsByCity(rows))
    .filter(([name]) => name !== city)
    .map(([name, count]) => ({ href: `/browse/${slugifyCity(name)}`, label: name, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
          <div className={EYEBROW}>Ontario · {city}</div>
          <h1 className={`mt-1.5 ${H1}`}>Healthcare jobs in {city}</h1>
          <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
            {total} active {total === 1 ? 'listing' : 'listings'} from{' '}
            {employers.length === 1 ? employers[0] : `${employers.length} employers`}, refreshed
            every six hours.
          </p>
        </div>
      </section>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Open roles in {city}</h2>
          <LandingJobList
            jobs={jobs}
            city={city}
            seeAllHref={buildJobsQuery({ city: [city] })}
            seeAllLabel={`See all ${total} ${total === 1 ? 'job' : 'jobs'} in ${city}`}
          />
          <GlancePanel rows={glance} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title={`Disciplines in ${city}`} items={disciplineLinks} />
          <LinkCountCard title="Other cities" items={otherCityLinks} />
        </aside>
      </div>
    </>
  );
}
