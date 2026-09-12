import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient } from '@/lib/db/server';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { CATEGORY_BLURBS } from '@/lib/taxonomy/blurbs';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { resolveCity, slugifyCity, isCategorySlug } from '@/lib/jobs/city-slug';
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

async function resolve(citySlug: string, disciplineSlug: string) {
  const rows = await loadLandingRows();
  const city = resolveCity(citySlug, Object.keys(countsByCity(rows)));
  const category = isCategorySlug(disciplineSlug) ? disciplineSlug : null;
  const count = city && category ? pairCount(rows, city, category) : 0;
  return { rows, city, category, count };
}

export async function generateMetadata(
  props: PageProps<'/browse/[city]/[discipline]'>,
): Promise<Metadata> {
  const { city: citySlug, discipline } = await props.params;
  const { city, category, count } = await resolve(citySlug, discipline);
  if (!city || !category || count === 0) return { title: `Not found | ${SITE.name}` };

  const label = CATEGORY_LABELS[category];
  return {
    title: `${label} jobs in ${city}, Ontario | ${SITE.name}`,
    description: `${count} active ${label.toLowerCase()} ${count === 1 ? 'listing' : 'listings'} in ${city}, pulled from hospital career systems and refreshed every six hours.`,
  };
}

export default async function PairLandingPage(props: PageProps<'/browse/[city]/[discipline]'>) {
  const { city: citySlug, discipline } = await props.params;
  const { rows, city, category, count } = await resolve(citySlug, discipline);

  // Unknown city, unknown discipline, or a valid pair with nothing active —
  // all 404. No empty landing pages.
  if (!city || !category || count === 0) notFound();

  const label = CATEGORY_LABELS[category];

  const db = createServerClient();
  // supabase-js resolves { data, error }; both reads are checked so a database
  // failure never renders as a legitimately empty discipline.
  const { data, error } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('is_active', true)
    .eq('city', city)
    .eq('category', category)
    .order('posted_at', { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  const jobs = (data ?? []) as LandingJob[];

  const { data: glanceData, error: glanceError } = await db
    .from('jobs')
    .select('employer_name,employment_type,salary_min,salary_max,salary_period,posted_at')
    .eq('is_active', true)
    .eq('city', city)
    .eq('category', category);
  if (glanceError) throw glanceError;
  const glance = buildGlance((glanceData ?? []) as GlanceJob[]);

  const otherDisciplines: CountLink[] = CATEGORIES.filter((c) => c !== category)
    .map((c) => ({
      href: `/browse/${slugifyCity(city)}/${c}`,
      label: CATEGORY_LABELS[c],
      count: pairCount(rows, city, c),
    }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  const sameDisciplineElsewhere: CountLink[] = Object.keys(countsByCity(rows))
    .filter((name) => name !== city)
    .map((name) => ({
      href: `/browse/${slugifyCity(name)}/${category}`,
      label: `${label} in ${name}`,
      count: pairCount(rows, name, category),
    }))
    .filter((l) => l.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
          <div className={EYEBROW}>Ontario · {city} · {label}</div>
          <h1 className={`mt-1.5 ${H1}`}>{label} jobs in {city}</h1>
          <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
            {CATEGORY_BLURBS[category]}
          </p>
        </div>
      </section>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <main className="min-w-0 flex-[3_1_400px]">
          <h2 className={`m-0 ${H2}`}>Open {label.toLowerCase()} roles in {city}</h2>
          <LandingJobList
            jobs={jobs}
            seeAllHref={buildJobsQuery({ city: [city], category: [category] })}
            seeAllLabel={`See all ${count} ${count === 1 ? 'job' : 'jobs'}`}
          />
          <GlancePanel rows={glance} />
        </main>

        <aside className="flex min-w-0 flex-1 basis-[250px] flex-col gap-3.5 md:max-w-[330px]">
          <LinkCountCard title={`Other disciplines in ${city}`} items={otherDisciplines} />
          <LinkCountCard title={`${label} in other cities`} items={sameDisciplineElsewhere} />
        </aside>
      </div>
    </>
  );
}
