import type { Metadata } from 'next';
import { loadCatalog, countBy } from '@/lib/jobs/catalog';
import { paths } from '@/lib/jobs/links';
import { roleBySlug } from '@/lib/taxonomy/roles';
import { pageMeta } from '@/lib/seo';
import { SITE } from '@/lib/site';
import { LandingHero } from '@/components/LandingHero';
import { TileGrid } from '@/components/TileGrid';

// Nonce-based CSP needs every page rendered per request (see proxy.ts).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMeta({
  title: `Healthcare jobs by role | ${SITE.name}`,
  description:
    'Registered nurse, PSW, pharmacist, physiotherapist, paramedic and other healthcare jobs across Canada, grouped by job title.',
  path: paths.roles(),
});

export default async function RolesIndexPage() {
  const jobs = await loadCatalog();
  const roles = countBy(jobs, (j) => j.role);
  const matched = roles.reduce((n, [, c]) => n + c, 0);

  return (
    <>
      <LandingHero
        eyebrow={SITE.name}
        title="Healthcare jobs by role"
        intro={`${matched} of ${jobs.length} active listings grouped by what the job is, from registered nurse to unit clerk. Every listing links to the employer's own application page.`}
      />
      <TileGrid
        title="Roles"
        last
        tiles={roles.map(([r, count]) => ({ href: paths.role(r), label: roleBySlug(r)?.label ?? r, count }))}
      />
    </>
  );
}
