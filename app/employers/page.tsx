import type { Metadata } from 'next';
import { loadCatalog, countBy } from '@/lib/jobs/catalog';
import { paths } from '@/lib/jobs/links';
import { provinceName, PROVINCE_NAMES } from '@/lib/provinces';
import type { ProvinceCode } from '@/lib/types';
import { pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { TileGrid } from '@/components/TileGrid';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: `Healthcare employers hiring in Canada | ${SITE.name}`,
  description:
    'Hospitals, health authorities, long-term care and home care employers with open jobs right now, grouped by province.',
  path: paths.employers(),
});

export default async function EmployersIndexPage() {
  const jobs = await loadCatalog();
  const employers = countBy(jobs, (j) => j.employer_name);

  // Each employer under the province where most of its postings are.
  const byProvince = new Map<string, Array<{ name: string; slug: string; count: number }>>();
  for (const [name, count] of employers) {
    const own = jobs.filter((j) => j.employer_name === name);
    const province = countBy(own, (j) => j.province)[0][0];
    const list = byProvince.get(province) ?? [];
    list.push({ name, slug: own[0].employerSlug, count });
    byProvince.set(province, list);
  }
  const provinces = (Object.keys(PROVINCE_NAMES) as ProvinceCode[]).filter((p) => byProvince.has(p));

  return (
    <>
      <LandingHero
        eyebrow={SITE.name}
        title="Healthcare employers hiring now"
        intro={`${employers.length} employers with ${jobs.length} open positions between them. Each links straight to the employer's own careers site.`}
      />
      {provinces.map((p, i) => (
        <TileGrid
          key={p}
          title={provinceName(p)}
          last={i === provinces.length - 1}
          tiles={(byProvince.get(p) ?? []).map((e) => ({ href: paths.employer(e.slug), label: e.name, count: e.count }))}
        />
      ))}
    </>
  );
}
