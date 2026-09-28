import Link from 'next/link';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/db/server';
import { postedAgo, formatSalary, employerLine } from '@/lib/format';
import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';
import { EMPLOYMENT_LABELS, type EmploymentType } from '@/lib/taxonomy/employment';
import { SITE } from '@/lib/site';
import { pageMeta } from '@/lib/seo';
import { sourceJobIdFromDedupeKey } from '@/lib/jobs/identifier';
import { paths } from '@/lib/jobs/links';
import { slugifyCity } from '@/lib/jobs/city-slug';
import { provinceName } from '@/lib/provinces';
import { roleOf } from '@/lib/taxonomy/roles';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { SaveButton } from '@/components/SaveButton';
import { CARD, CONTAINER, H3, PILL_PRIMARY } from '@/lib/ui/styles';

export const dynamic = 'force-dynamic';

// Explicit columns rather than '*': '*' would also pull search_vector, a
// large generated tsvector column that is never rendered on this page.
const COLUMNS =
  'slug,title,description,employer_name,facility_name,city,province,category,employment_type,salary_min,salary_max,salary_period,posted_at,expires_at,apply_url,dedupe_key';

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
  dedupe_key: string;
};

type SimilarJob = { slug: string; title: string; employer_name: string; city: string };

const SIMILAR_LIMIT = 3;

/** Google's JobPosting employmentType only accepts its own enum. "casual" and
 * "contract" upper-cased (CASUAL, CONTRACT) are not in it, so they are mapped
 * to the nearest value rather than emitted as invalid markup. */
const SCHEMA_EMPLOYMENT_TYPE: Record<EmploymentType, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  casual: 'PER_DIEM',
  temporary: 'TEMPORARY',
  contract: 'CONTRACTOR',
};

function isCategory(value: string | null): value is Category {
  return value !== null && value in CATEGORY_LABELS;
}

function isEmploymentType(value: string | null): value is EmploymentType {
  return value !== null && value in EMPLOYMENT_LABELS;
}

/** JSON.stringify alone lets a "</script>" inside a job title or description
 * close the tag early; escaping "<" keeps the JSON identical once parsed. */
function jsonLdString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function applyHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function loadJob(slug: string): Promise<JobDetail | null> {
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

  return data as JobDetail | null;
}

export async function generateMetadata(props: PageProps<'/jobs/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const job = await loadJob(slug);
  if (!job) return { title: `Not found | ${SITE.name}` };

  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employmentLabel = isEmploymentType(job.employment_type)
    ? EMPLOYMENT_LABELS[job.employment_type]
    : null;
  const detail = [employmentLabel, salary].filter((v): v is string => v !== null).join(' · ');

  return pageMeta({
    title: `${job.title} — ${job.employer_name}, ${job.city} | ${SITE.name}`,
    description:
      `${job.title} at ${employerLine(job.employer_name, job.facility_name, job.city)} in ` +
      `${job.city}, ${job.province}.${detail ? ` ${detail}.` : ''} ` +
      `Apply on the employer's own careers site.`,
    path: `/jobs/${job.slug}`,
  });
}

export default async function JobPage(props: PageProps<'/jobs/[slug]'>) {
  const { slug } = await props.params;
  const db = createServerClient();

  const job = await loadJob(slug);
  if (!job) notFound();

  // Similar openings, nearest first: same discipline in the same city, then
  // the same province, then anywhere. Matching on discipline alone returned an
  // arbitrary three rows — a Rosetown, SK posting suggested jobs in Fort
  // Saskatchewan, AB. Jobs with no category (Workday doesn't classify all of
  // them) fall back to same city, then same province.
  const similar: SimilarJob[] = [];
  {
    const tiers: Array<{ category?: string; city?: string; province?: string }> = isCategory(job.category)
      ? [
          { category: job.category, city: job.city },
          { category: job.category, province: job.province },
          { category: job.category },
        ]
      : [{ city: job.city }, { province: job.province }];
    const seen = new Set([job.slug]);
    for (const tier of tiers) {
      if (similar.length >= SIMILAR_LIMIT) break;
      let q = db.from('jobs').select('slug,title,employer_name,city').eq('is_active', true).neq('slug', job.slug);
      if (tier.category) q = q.eq('category', tier.category);
      if (tier.city) q = q.eq('city', tier.city);
      if (tier.province) q = q.eq('province', tier.province);
      const { data: similarData, error: similarError } = await q
        .order('posted_at', { ascending: false })
        .limit(SIMILAR_LIMIT + seen.size);
      if (similarError) throw similarError;
      for (const s of (similarData ?? []) as SimilarJob[]) {
        if (similar.length >= SIMILAR_LIMIT) break;
        if (seen.has(s.slug)) continue;
        seen.add(s.slug);
        similar.push(s);
      }
    }
  }

  const nonce = (await headers()).get('x-nonce');
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
  const employmentLabel = isEmploymentType(job.employment_type) ? EMPLOYMENT_LABELS[job.employment_type] : null;
  const categoryLabel = isCategory(job.category) ? CATEGORY_LABELS[job.category] : null;
  const host = applyHost(job.apply_url);
  const identifier = sourceJobIdFromDedupeKey(job.dedupe_key);
  const role = roleOf(job.title);

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
    url: `${SITE.url}/jobs/${job.slug}`,
    // Applications happen on the employer's site, not here — Google asks
    // aggregators to say so rather than leave it unset.
    directApply: false,
    ...(identifier
      ? { identifier: { '@type': 'PropertyValue', name: job.employer_name, value: identifier } }
      : {}),
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
    ...(isEmploymentType(job.employment_type)
      ? { employmentType: SCHEMA_EMPLOYMENT_TYPE[job.employment_type] }
      : {}),
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

  // Mirrors the visible breadcrumb trail above the title.
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'All jobs', item: `${SITE.url}/jobs` },
      ...(categoryLabel
        ? [
            {
              '@type': 'ListItem',
              position: 2,
              name: categoryLabel,
              item: `${SITE.url}${buildJobsQuery({ category: [job.category as Category] })}`,
            },
          ]
        : []),
      { '@type': 'ListItem', position: categoryLabel ? 3 : 2, name: job.title },
    ],
  };

  return (
    <>
      <script
        nonce={nonce ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }}
      />
      <script
        nonce={nonce ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbLd) }}
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

          {/* Links into the landing pages, so every job page passes crawlers (and readers)
              on to the employer, role and province hubs above it. */}
          <div className={`${CARD} p-5`}>
            <div className={H3}>Explore</div>
            <div className="mt-3 flex flex-col gap-2.5 text-base">
              <Link href={paths.employer(slugifyCity(job.employer_name))}>More jobs at {job.employer_name}</Link>
              {role && (
                <Link href={paths.roleProvince(role.slug, job.province)}>
                  {role.label} jobs in {provinceName(job.province)}
                </Link>
              )}
              <Link href={paths.province(job.province)}>Healthcare jobs in {provinceName(job.province)}</Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
