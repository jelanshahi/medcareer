import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/db/server';
import { postedAgo, formatSalary } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Explicit columns rather than '*': '*' would also pull search_vector, a
// large generated tsvector column that is never rendered on this page.
const COLUMNS =
  'slug,title,description,employer_name,facility_name,city,province,employment_type,' +
  'salary_min,salary_max,salary_period,posted_at,expires_at,apply_url';

type JobDetail = {
  slug: string;
  title: string;
  description: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  province: string;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
  expires_at: string;
  apply_url: string;
};

export default async function JobPage(props: PageProps<'/jobs/[slug]'>) {
  const { slug } = await props.params;

  // supabase-js resolves { data, error } rather than rejecting on failure. An
  // unchecked error here is indistinguishable from "no such job" and would
  // send a real database failure to notFound() instead of surfacing it.
  const { data, error } = await createServerClient()
    .from('jobs')
    .select(COLUMNS)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;

  const job = data as JobDetail | null;
  if (!job) notFound();

  const nonce = (await headers()).get('x-nonce');
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);

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
    <article className="px-4 py-6">
      <script
        nonce={nonce ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1 className="text-2xl font-semibold leading-tight">{job.title}</h1>
      <p className="mt-2 text-[var(--color-slate)]">
        {job.employer_name}{job.facility_name ? ` · ${job.facility_name}` : ''}
      </p>
      <p className="text-[var(--color-slate)]">{job.city}, {job.province}</p>
      <p className="mt-2 text-sm tabular-nums text-[var(--color-slate)]">
        {[salary, postedAgo(job.posted_at)].filter(Boolean).join(' · ')}
      </p>

      <a
        href={job.apply_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="mt-6 inline-block rounded bg-[var(--color-signal)] px-5 py-3 font-semibold text-white"
      >
        Apply on {job.employer_name}
      </a>

      {/* Description is sanitized at ingest (Task 3, allow-list p/br/ul/ol/li/strong/em/h3/h4,
          no attributes) — that sanitization is the only reason dangerouslySetInnerHTML is
          acceptable here. */}
      <div
        className="prose mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: job.description }}
      />

      <p className="mt-8 text-sm text-[var(--color-slate)]">
        Listed by {job.employer_name}. Applications are handled on their site.
      </p>
    </article>
  );
}
