import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/db/server';
import { postedAgo, formatSalary } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';

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

      <div className="border-b border-[var(--color-rule)] bg-[var(--color-band)]">
        <div className="mx-auto max-w-[1180px] px-4 py-3 text-[15px] text-[var(--color-slate)] sm:px-6">
          <Link href="/jobs" className="font-semibold text-[var(--color-signal)]">All jobs</Link>
          {categoryLabel && (
            <>
              <span className="px-2">/</span>
              <Link href={`/jobs?category=${job.category}`} className="font-semibold text-[var(--color-signal)]">
                {categoryLabel}
              </Link>
            </>
          )}
          <span className="px-2">/</span>
          <span className="text-[var(--color-ink)]">{job.title}</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-10 px-4 py-9 sm:px-6 sm:py-12">
        <article className="min-w-0 flex-[3_1_420px]">
          <h1 className="text-balance font-display text-[32px] font-bold uppercase leading-[1.03] sm:text-[42px] lg:text-[48px]">
            {job.title}
          </h1>
          <p className="mt-3 text-lg text-[var(--color-body)]">
            {job.employer_name}
            {job.facility_name ? ` · ${job.facility_name}` : ''}
          </p>
          <p className="mt-0.5 text-lg text-[var(--color-slate)]">{job.city}, {job.province}</p>

          <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] border-y border-[var(--color-rule)]">
            {facts.map((f) => (
              <div key={f.label} className="py-3.5 pr-4">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-slate)]">{f.label}</div>
                <div className="mt-0.5 text-[17px] font-semibold tabular-nums">{f.value}</div>
              </div>
            ))}
          </div>

          {/* Description is sanitized at ingest (allow-list p/br/ul/ol/li/strong/em/h3/h4,
              no attributes) — that sanitization is the only reason dangerouslySetInnerHTML
              is acceptable here. The store holds one blob (jobs.description), not the
              design's separate intro/duties/quals fields, so it renders as a single block
              rather than fabricated section splits. */}
          <div
            className="prose mt-7 max-w-none text-[17px] leading-relaxed text-[#22282D] [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:uppercase [&_h4]:mt-5 [&_h4]:font-display [&_h4]:text-xl [&_h4]:font-bold [&_h4]:uppercase [&_li]:mb-1.5 [&_ul]:pl-6 [&_ol]:pl-6 [&_p]:mb-4"
            dangerouslySetInnerHTML={{ __html: job.description }}
          />

          <p className="mt-8 border-t border-[var(--color-rule)] pt-3.5 text-sm text-[var(--color-slate)]">
            Listed by {job.employer_name}. Applications are handled on their site — {'MedCareer'} never takes
            applications itself.
          </p>
        </article>

        <aside className="flex min-w-0 flex-1 basis-[280px] flex-col gap-4 sm:sticky sm:top-4 sm:max-w-[360px]">
          <div className="border-2 border-[var(--color-ink)] bg-white p-[18px]">
            {salary && (
              <div className="break-words font-display text-[27px] font-bold leading-none tabular-nums sm:text-[34px]">
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
              className="mt-4 block break-words bg-[var(--color-signal)] px-3 py-3.5 text-center font-display text-xl font-bold uppercase tracking-wide text-white no-underline hover:bg-[var(--color-signal-hover)]"
            >
              Apply on {job.employer_name}
            </a>
            {host && (
              <div className="mt-2 break-words text-center text-sm text-[var(--color-slate)]">
                Opens {host} in a new tab
              </div>
            )}
          </div>

          {similar.length > 0 && (
            <div className="border border-[var(--color-rule)] bg-white p-4">
              <div className="font-display text-lg font-bold uppercase tracking-wider">Similar openings</div>
              <div className="mt-2.5 flex flex-col gap-3">
                {similar.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/jobs/${s.slug}`}
                    className="block text-[var(--color-ink)] no-underline hover:text-[var(--color-signal)]"
                  >
                    <div className="text-[16px] font-semibold leading-snug">{s.title}</div>
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
