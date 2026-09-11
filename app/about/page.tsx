import { createServerClient } from '@/lib/db/server';
import { SITE } from '@/lib/site';

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
    <article className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-balance font-display text-[36px] font-bold uppercase leading-none sm:text-[52px]">
        About {SITE.name}
      </h1>

      <p className="mt-4 text-lg leading-relaxed text-[#22282D]">
        {SITE.name} is a job search site for healthcare work in Ontario. Every listing links
        directly to the employer&rsquo;s own application page. We never take applications ourselves,
        and there is no account or login anywhere in the product.
      </p>

      <h2 className="mt-9 font-display text-[28px] font-bold uppercase tracking-wide">
        How we collect listings
      </h2>
      <p className="mt-2 text-[17px] leading-relaxed text-[#22282D]">
        We read the public job feeds that employers&rsquo; own career sites use. We identify
        ourselves on every request as{' '}
        <code className="border border-[var(--color-rule)] bg-[#F0EFEA] px-1.5 py-px font-mono text-[15px]">
          {SITE.userAgent}
        </code>
        , we send no more than one request per second to any single site, and we respect{' '}
        <code className="border border-[var(--color-rule)] bg-[#F0EFEA] px-1.5 py-px font-mono text-[15px]">
          robots.txt
        </code>
        . We do not log in, submit applications, or attempt to reach anything that requires
        authentication.
      </p>

      <h2 className="mt-9 font-display text-[28px] font-bold uppercase tracking-wide">
        Where the jobs come from
      </h2>
      {employers.length > 0 ? (
        <div className="mt-3 border border-[var(--color-rule)]">
          {employers.map((e) => (
            <div
              key={e.name}
              className="flex justify-between gap-4 border-b border-[var(--color-rule)] bg-white px-4 py-3.5 last:border-b-0"
            >
              <div>
                <div className="font-semibold">{e.name}</div>
                <div className="text-[15px] text-[var(--color-slate)]">{e.cities.join(', ')}</div>
              </div>
              <div className="whitespace-nowrap text-[15px] tabular-nums text-[var(--color-slate)]">
                {e.count} {e.count === 1 ? 'job' : 'jobs'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[17px] text-[var(--color-slate)]">
          No active listings right now — check back after the next refresh.
        </p>
      )}

      <h2 id="employer-removal" className="mt-9 scroll-mt-6 font-display text-[28px] font-bold uppercase tracking-wide">
        Employers: removing your listings
      </h2>
      <p className="mt-2 text-[17px] leading-relaxed text-[#22282D]">
        Email{' '}
        <a className="font-semibold text-[var(--color-signal)]" href={`mailto:${SITE.contactEmail}`}>
          {SITE.contactEmail}
        </a>{' '}
        and we will stop collecting from your site. No justification needed.
      </p>
    </article>
  );
}
