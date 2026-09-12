import { createServerClient } from '@/lib/db/server';
import { SITE } from '@/lib/site';
import { CARD } from '@/lib/ui/styles';

// The canvas's inline <code> treatment: chip-grey, rounded, monospace.
const CODE =
  'rounded-md bg-[var(--color-chip)] px-1.5 py-0.5 font-mono text-[15px]';

// Nonce-based CSP requires dynamic rendering (see proxy.ts): a statically
// prerendered page bakes its inline/bootstrap <script> tags at build time,
// before any per-request nonce exists, so they come back with no nonce
// attribute at all and a browser enforcing this CSP refuses to run them —
// the page never hydrates. Confirmed against a `next build` + `next start`:
// without this export, /about built as a static route (○) and its inline
// scripts carried no nonce.
export const dynamic = 'force-dynamic';

export const metadata = { title: `About ${SITE.name}` };

type Employer = { name: string; count: number; cities: string[] };

export default async function AboutPage() {
  // supabase-js resolves { data, error } rather than rejecting on failure;
  // an unchecked error here would silently render an empty employer table
  // rather than a real failure.
  const { data, error } = await createServerClient()
    .from('jobs')
    .select('employer_name,city')
    .eq('is_active', true);
  if (error) throw error;

  const byEmployer = new Map<string, { count: number; cities: Set<string> }>();
  for (const row of data ?? []) {
    const entry = byEmployer.get(row.employer_name) ?? { count: 0, cities: new Set<string>() };
    entry.count += 1;
    entry.cities.add(row.city);
    byEmployer.set(row.employer_name, entry);
  }
  const employers: Employer[] = [...byEmployer.entries()]
    .map(([name, { count, cities }]) => ({ name, count, cities: [...cities].sort() }))
    .sort((a, b) => b.count - a.count);

  return (
    <article className="mx-auto max-w-[720px] px-[22px] pb-20 pt-[clamp(44px,7vw,72px)]">
      <h1 className="m-0 text-[clamp(34px,5.4vw,52px)] font-semibold leading-[1.06] tracking-[-0.025em]">
        About {SITE.name}
      </h1>

      <p className="mt-4 text-[21px] leading-[1.42] text-[var(--color-slate)]">
        {SITE.name} is a job search site for healthcare work in Ontario. Every listing links
        directly to the employer&rsquo;s own application page. We never take applications ourselves,
        and there is no account or login anywhere in the product.
      </p>

      <h2 className="mt-10 text-[28px] font-semibold tracking-[-0.02em]">How we collect listings</h2>
      <p className="mt-2.5 text-[17px] leading-[1.6]">
        We read the public job feeds that employers&rsquo; own career sites use. We identify
        ourselves on every request as <code className={CODE}>{SITE.userAgent}</code>, we send no more
        than one request per second to any single site, and we respect{' '}
        <code className={CODE}>robots.txt</code>. We do not log in, submit applications, or attempt
        to reach anything that requires authentication.
      </p>

      <h2 className="mt-10 text-[28px] font-semibold tracking-[-0.02em]">Where the jobs come from</h2>
      {employers.length > 0 ? (
        <div className={`${CARD} mt-3.5 overflow-hidden`}>
          {employers.map((e) => (
            <div
              key={e.name}
              className="flex justify-between gap-4 border-t border-[var(--color-divider)] px-5 py-[15px] first:border-t-0"
            >
              <div>
                <div className="text-[17px] font-medium">{e.name}</div>
                <div className="text-[15px] text-[var(--color-slate)]">{e.cities.join(', ')}</div>
              </div>
              <div className="whitespace-nowrap text-[15px] tabular-nums text-[var(--color-meta)]">
                {e.count} {e.count === 1 ? 'job' : 'jobs'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3.5 text-[17px] text-[var(--color-slate)]">
          No active listings right now — check back after the next refresh.
        </p>
      )}

      <h2 id="employer-removal" className="mt-10 scroll-mt-16 text-[28px] font-semibold tracking-[-0.02em]">
        Employers: removing your listings
      </h2>
      <p className="mt-2.5 text-[17px] leading-[1.6]">
        Email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> and we will stop
        collecting from your site. No justification needed.
      </p>
    </article>
  );
}
