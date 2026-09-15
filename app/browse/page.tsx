import Link from 'next/link';
import type { Metadata } from 'next';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { slugifyCity } from '@/lib/jobs/city-slug';
import {
  loadLandingRows,
  countsByCity,
  countsByCategory,
  pairCount,
  LINK_THRESHOLD,
} from '@/lib/jobs/landing';
import { DisciplineTile } from '@/components/DisciplineTile';
import { SITE } from '@/lib/site';
import { EYEBROW, H2, SECTION, TILE } from '@/lib/ui/styles';

// Nonce-based CSP requires dynamic rendering — a prerendered route bakes its
// bootstrap <script> tags before any per-request nonce exists and the CSP then
// blocks them. Same reasoning as app/about/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Browse healthcare jobs in Ontario | ${SITE.name}`,
  description:
    'Every active healthcare listing on MedCareer, grouped by city and by discipline.',
};

export default async function BrowsePage() {
  const rows = await loadLandingRows();
  const cityCounts = countsByCity(rows);
  const categoryCounts = countsByCategory(rows);

  const cities = Object.keys(cityCounts).sort();
  const disciplines = CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0).sort(
    (a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0),
  );

  // Only pairs above the threshold are linked. Thinner pairs still render if
  // reached directly; they are simply not advertised here.
  const pairs = cities
    .flatMap((city) =>
      disciplines.map((category) => ({ city, category, count: pairCount(rows, city, category) })),
    )
    .filter((p) => p.count >= LINK_THRESHOLD)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <section className="bg-[var(--color-surface)] text-center">
        <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
          <div className={EYEBROW}>{SITE.name}</div>
          <h1 className="mt-1.5 text-balance text-[clamp(34px,5.6vw,56px)] font-semibold leading-[1.06] tracking-[-0.025em]">
            Browse healthcare jobs in Ontario
          </h1>
          <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
            {rows.length} active listings, grouped by city and by discipline.
          </p>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={`m-0 ${H2}`}>By city</h2>
        <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {cities.map((city) => (
            <Link key={city} href={`/browse/${slugifyCity(city)}`} className={TILE}>
              <span className="text-[17px] font-medium tracking-[-0.012em]">{city}</span>
              <span className="text-[15px] tabular-nums text-[var(--color-meta)]">
                {cityCounts[city]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={`m-0 ${H2}`}>By discipline</h2>
        <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
          {disciplines.map((c) => (
            <DisciplineTile
              key={c}
              href={buildJobsQuery({ category: [c] })}
              label={CATEGORY_LABELS[c]}
              count={categoryCounts[c] ?? 0}
            />
          ))}
        </div>
      </section>

      {pairs.length > 0 && (
        <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
          <h2 className={`m-0 ${H2}`}>Popular combinations</h2>
          <div className="reveal-group mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
            {pairs.map((p) => (
              <Link
                key={`${p.city}-${p.category}`}
                href={`/browse/${slugifyCity(p.city)}/${p.category}`}
                className={TILE}
              >
                <span className="text-[17px] font-medium tracking-[-0.012em]">
                  {CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS]} in {p.city}
                </span>
                <span className="text-[15px] tabular-nums text-[var(--color-meta)]">{p.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
