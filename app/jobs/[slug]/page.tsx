import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/db/server';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { SITE } from '@/lib/site';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { SaveButton } from '@/components/SaveButton';
import { CARD, CONTAINER, H3, PILL_PRIMARY } from '@/lib/ui/styles';

export const dynamic = 'force-dynamic';

// Explicit columns rather than '*': '*' would also pull search_vector, a
// large generated tsvector column that is never rendered on this page.
const COLUMNS =
  'slug,title,description,employer_name,facility_name,city,province,category,employment_type,salary_min,salary_max,salary_period,posted_at,expires_at,apply_url';

type JobDetail = {
  slug: string;
  title: string;
  description: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  category: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
  expires_at: string;
  apply_url: string;
};

type SimilarJob = { slug: string; title: string; employer_name: string; city: string };

function isCategory(value: string | null): value is Category {
  return value !== null && value in CATEGORY_LABELS;
}

function isEmploymentType(value: string | null): value is EmploymentType {
  return value !== null && value in EMPLOYMENT_LABELS;
}

function applyHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default async function JobPage(props: PageProps<'/jobs/[slug]'>) {
  const { slug } = await props.params;
  const db = createServerClient();

  // supabase-js resolves { data, error } rather than rejecting on failure. An
  // unchecked error here is indistinguishable from "no such job" and would
  // send a real database failure to notFound() instead of surfacing it.
  const { data, error } = await db
    .from('jobs')
    .select(COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;

  const job = data as JobDetail | null;
  if (!job) notFound();

  // Similar openings: same discipline first (what the design intends); if the
  // job has no category (about a third of listings — Workday doesn't
  // classify all of them), fall back to same city rather than showing
  // nothing.
  let similar: SimilarJob[] = [];
  {
    const similarColumns = 'slug,title,employer_name,city';
    let similarQuery = db.from('jobs').select(similarColumns).eq('is_active', true).neq('slug', job.slug).limit(3);
    similarQuery = isCategory(job.category)
      ? similarQuery.eq('category', job.category)
      : similarQuery.eq('city', job.city);
    const { data: similarData, error: similarError } = await similarQuery;
    if (similarError) throw similarError;
    similar = (similarData ?? []) as SimilarJob[];
  }

  const nonce = (await headers()).get('x-nonce');
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employmentLabel = isEmploymentType(job.employment_type) ? EMPLOYMENT_LABELS[job.employment_type] : null;
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;
  const host = applyHost(job.apply_url);

  const facts = [
    salary ? { label: 'Pay band', value: salary } : null,
    employmentLabel ? { label: 'Employment', value: employmentLabel } : null,
    { label: 'Location', value: `${job.city}, ${job.province}` },
    { label: 'Posted', value: postedAgo(job.posted_at).replace('Posted ', '') },
  ].filter((f): f is { label: string; value: string } => f !== null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.posted_at,
    validThrough: job.expires_at,
    hiringOrganization: { '@type': 'Organization', name: job.employer_name },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city,
        addressRegion: job.province,
        addressCountry: 'CA',
      },
    },
    ...(job.employment_type ? { employmentType: job.employment_type.toUpperCase() } : {}),
    ...(job.salary_min && job.salary_max
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'CAD',
            value: {
              '@type': 'QuantitativeValue',
              minValue: job.salary_min,
              maxValue: job.salary_max,
              unitText: job.salary_period === 'hour' ? 'HOUR' : 'YEAR',
            },
          },
        }
      : {}),
  };

  return (
    <>
      <script
        nonce={nonce ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="border-b border-[var(--color-rule)] bg-[var(--color-surface)]">
        <div className={`${CONTAINER} flex flex-wrap items-center py-[11px] text-sm text-[var(--color-slate)]`}>
          <Link href="/jobs">All jobs</Link>
          {categoryLabel && (
            <>
              <span className="px-[7px]">›</span>
              <Link href={buildJobsQuery({ category: [job.category as Category] })}>{categoryLabel}</Link>
            </>
          )}
          <span className="px-[7px]">›</span>
          <span className="text-[var(--color-ink)]">{job.title}</span>
        </div>
      </div>

      <div className={`${CONTAINER} flex flex-wrap items-start gap-8 pb-20 pt-8`}>
        <article className="min-w-0 flex-[3_1_400px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="m-0 text-balance text-[clamp(30px,4.6vw,46px)] font-semibold leading-[1.08] tracking-[-0.025em]">
              {job.title}
            </h1>
            <SaveButton slug={job.slug} />
          </div>
          <p className="mt-3 text-[19px]">
            {employerLine(job.employer_name, job.facility_name, job.city)}
          </p>
          <p className="mt-0.5 text-[19px] text-[var(--color-slate)]">{job.city}, {job.province}</p>

          <div className={`${CARD} mt-6 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] px-5 py-2`}>
            {facts.map((f) => (
              <div key={f.label} className="py-3.5 pr-4">
                <div className="text-[13px] text-[var(--color-slate)]">{f.label}</div>
                <div className="mt-0.5 text-[17px] font-medium tabular-nums">{f.value}</div>
              </div>
            ))}
          </div>

          {/* Sanitized at ingest (allow-list p/br/ul/ol/li/strong/em/h3/h4, no
              attributes) — that sanitization is the only reason
              dangerouslySetInnerHTML is acceptable here. The store holds one
              blob, not the canvas's separate intro/duties/quals fields, so it
              renders as one block rather than fabricated section splits. */}
          <div
            className="mt-7 text-[17px] leading-[1.6] [&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:text-2xl [&_h3]:font-semibold [&_h3]:tracking-[-0.02em] [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-xl [&_h4]:font-semibold [&_li]:mb-[7px] [&_ol]:pl-[22px] [&_p]:mb-4 [&_ul]:pl-[22px]"
            dangerouslySetInnerHTML={{ __html: job.description }}
          />

          <p className="mt-7 border-t border-[var(--color-rule)] pt-4 text-[15px] text-[var(--color-slate)]">
            Listed by {job.employer_name}. Applications are handled on their site — {SITE.name} never
            takes applications itself.
          </p>
        </article>

        <aside className="flex min-w-0 flex-1 basis-[270px] flex-col gap-3.5 md:sticky md:top-16 md:max-w-[340px]">
          <div className={`${CARD} p-5`}>
            {salary && (
              <div className="text-[clamp(24px,3.4vw,30px)] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums [overflow-wrap:anywhere]">
                {salary}
              </div>
            )}
            <div className={`text-[15px] text-[var(--color-slate)] ${salary ? 'mt-1' : ''}`}>
              {[employmentLabel, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
            </div>
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`${PILL_PRIMARY} mt-4 w-full [overflow-wrap:anywhere]`}
            >
              Apply on {job.employer_name}
            </a>
            {host && (
              <div className="mt-2.5 text-center text-[13px] text-[var(--color-meta)] [overflow-wrap:anywhere]">
                Opens {host} in a new tab
              </div>
            )}
          </div>

          {similar.length > 0 && (
            <div className={`${CARD} p-5`}>
              <div className={H3}>Similar openings</div>
              <div className="mt-3 flex flex-col gap-3.5">
                {similar.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/jobs/${s.slug}`}
                    className="block text-[var(--color-ink)] no-underline hover:text-[var(--color-link)] hover:no-underline"
                  >
                    <div className="text-base font-medium leading-[1.25]">{s.title}</div>
                    <div className="text-sm text-[var(--color-slate)]">{s.employer_name} · {s.city}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
