import { pathToFileURL } from 'node:url';
import { createAdminClient } from '@/lib/db/admin';
import { classify } from '@/lib/taxonomy/classify';
import { deaccent } from '@/lib/normalize/title';
import { log } from '@/workers/logger';
import type { NormalizedPosting } from '@/lib/types';

const EXPIRY_DAYS = 60;
const SELECT_PAGE_SIZE = 1000;

/**
 * NormalizedPosting as it round-trips through jsonb: Date fields come back
 * as ISO strings. Typed explicitly because the Global Constraints forbid
 * `any` at module boundaries.
 */
export type StoredPosting = Omit<NormalizedPosting, 'postedAt' | 'closesAt'> & {
  postedAt: string;
  closesAt?: string;
};

export type RawRow = {
  id: string;
  source_id: string;
  fingerprint: string;
  normalized: StoredPosting;
};

export type JobRow = {
  slug: string;
  fingerprint: string;
  title: string;
  employer_id: string | null;
  employer_name: string;
  facility_name: string | null;
  description: string;
  city: string;
  province: string;
  category: string | null;
  employment_type: string | null;
  shift_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  apply_url: string;
  canonical_source: string;
  posted_at: string;
  closes_at: string | null;
  expires_at: string;
  is_active: boolean;
  updated_at: string;
};

/** Lower number wins. Direct ATS beats Job Bank beats Adzuna. */
export function sourcePriority(sourceId: string): number {
  if (sourceId.startsWith('workday:') || sourceId.startsWith('taleo:')) return 0;
  if (sourceId === 'jobbank') return 1;
  return 2;
}

export function pickCanonical(rows: RawRow[]): RawRow {
  return [...rows].sort((a, b) => sourcePriority(a.source_id) - sourcePriority(b.source_id))[0];
}

/**
 * Diacritics are stripped via the shared `deaccent()` (NFD + `/[̀-ͯ]/g`) rather
 * than a hand-rolled combining-mark class — a literal combining-mark class in source is
 * exactly the defect this project hit before (Task 2): the invisible characters get
 * silently mangled by editors, encodings and diff tooling.
 */
function slugify(title: string): string {
  return deaccent(title.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function buildJobRow(row: RawRow, employerId: string | null): JobRow {
  const n = row.normalized;
  const postedAt = new Date(n.postedAt);
  const hardExpiry = new Date(postedAt.getTime() + EXPIRY_DAYS * 86_400_000);
  const closesAt = n.closesAt ? new Date(n.closesAt) : null;
  const expiresAt = closesAt && closesAt < hardExpiry ? closesAt : hardExpiry;

  return {
    slug: `${slugify(n.title)}-${row.fingerprint.slice(0, 8)}`,
    fingerprint: row.fingerprint,
    title: n.title,
    employer_id: employerId,
    employer_name: n.employerName,
    facility_name: n.facilityName ?? null,
    description: n.description,
    city: n.city,
    province: n.province,
    category: classify(n.title),
    employment_type: n.employmentType ?? null,
    shift_type: n.shiftType ?? null,
    salary_min: n.salaryMin ?? null,
    salary_max: n.salaryMax ?? null,
    salary_period: n.salaryPeriod ?? null,
    apply_url: n.applyUrl,
    canonical_source: row.source_id,
    posted_at: postedAt.toISOString(),
    closes_at: closesAt ? closesAt.toISOString() : null,
    expires_at: expiresAt.toISOString(),
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const admin = createAdminClient();
  const ctx = { sourceId: 'matcher', runId: 'dedupe' };

  // PostgREST caps a single response (1000 rows by default on Supabase). At the current
  // 216-row raw_postings table a single unpaged select would happen to return everything,
  // which is exactly why the truncation would ship unnoticed once the table grows past the
  // cap. Page with `.range()` until a short page comes back.
  const raws: RawRow[] = [];
  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const to = from + SELECT_PAGE_SIZE - 1;
    const { data: page, error } = await admin
      .from('raw_postings')
      .select('id,source_id,fingerprint,normalized')
      .range(from, to);
    if (error) throw error;
    raws.push(...((page ?? []) as unknown as RawRow[]));
    if (!page || page.length < SELECT_PAGE_SIZE) break;
  }

  // supabase-js RESOLVES with `{ data, error }` rather than rejecting. Unchecked, a failed
  // select silently yields an empty map and every job gets `employer_id: null`.
  const { data: employers, error: employersError } = await admin
    .from('employers')
    .select('id,slug,name');
  if (employersError) throw employersError;
  const employerIdByName = new Map((employers ?? []).map((e) => [e.name, e.id as string]));

  const groups = new Map<string, RawRow[]>();
  for (const row of raws) {
    const bucket = groups.get(row.fingerprint) ?? [];
    bucket.push(row);
    groups.set(row.fingerprint, bucket);
  }

  let merged = 0;
  for (const [fp, rows] of groups) {
    if (rows.length > 1) {
      merged += 1;
      log(ctx, 'warn', 'fingerprint collision merged', { fingerprint: fp, count: rows.length });
    }
    const canonical = pickCanonical(rows);
    const jobRow = buildJobRow(canonical, employerIdByName.get(canonical.normalized.employerName) ?? null);

    const { data: job, error: upsertError } = await admin
      .from('jobs').upsert(jobRow, { onConflict: 'fingerprint' }).select('id').single();
    if (upsertError) {
      log(ctx, 'error', 'job upsert failed', { fingerprint: fp, error: upsertError.message });
      continue;
    }

    for (const row of rows) {
      // Checked but never abort the loop on failure — same per-group `continue` shape as
      // the jobs upsert above. A missing job_sources link is a lesser failure than losing
      // the rest of the run's jobs.
      const { error: sourceError } = await admin
        .from('job_sources')
        .upsert({ job_id: job.id, raw_posting_id: row.id }, { onConflict: 'job_id,raw_posting_id' });
      if (sourceError) {
        log(ctx, 'error', 'job_sources upsert failed', {
          fingerprint: fp, raw_posting_id: row.id, error: sourceError.message,
        });
      }
    }
  }

  log(ctx, 'info', 'dedupe complete', { groups: groups.size, merged });
}

// The Step 1 unit test imports sourcePriority/pickCanonical/buildJobRow directly from this
// module. Without this guard, that import would also execute `main()` — which throws before
// a DB is configured — as a side effect of merely importing pure functions. Guard on whether
// this module is the process entry point, using `pathToFileURL` (not manual `file://`
// concatenation) so the comparison is correct even though this repo's path contains spaces.
const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
