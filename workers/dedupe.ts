import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/db/admin';
import { classify } from '@/lib/taxonomy/classify';
import { deaccent } from '@/lib/normalize/title';
import { log } from '@/workers/logger';
import type { NormalizedPosting } from '@/lib/types';

const EXPIRY_DAYS = 60;
const SELECT_PAGE_SIZE = 1000;
/**
 * Rows per upsert request. Payload size is not the binding limit — Postgres' statement
 * timeout is. At 500 a chunk of full job descriptions upserted on a unique index started
 * failing with "canceling statement due to statement timeout" once the table passed ~4,000
 * jobs (Manitoba's 853 took it there), silently dropping 500 jobs from a run that otherwise
 * reported success.
 */
const WRITE_CHUNK_SIZE = 200;

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
  dedupe_key: string;
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

/**
 * Lower number wins. A direct ATS feed beats an aggregator: it is the employer's own record
 * and carries the real apply URL.
 *
 * Written as "anything that is not a known aggregator", rather than as a list of ATS
 * platforms to keep up to date. The list version had already fallen behind — it matched
 * `successfactors:` but not `successfactors_mb:`, so all 853 Manitoba postings were scoring
 * *below* Adzuna, and `bchealthjobs:` would have joined them. It cost nothing while no
 * fingerprint spanned two sources (crossSourceMerges has been 0 every run), but the first
 * time one did it would have quietly picked the aggregator as canonical.
 */
const AGGREGATOR_PRIORITY: Record<string, number> = { jobbank: 1, adzuna: 2 };

export function sourcePriority(sourceId: string): number {
  return AGGREGATOR_PRIORITY[sourceId.split(':')[0]] ?? 0;
}

export function pickCanonical(rows: RawRow[]): RawRow {
  return [...rows].sort((a, b) => sourcePriority(a.source_id) - sourcePriority(b.source_id))[0];
}

/**
 * Groups raw postings into the row-sets that back one job each.
 *
 * `fingerprint` alone (title + employer + city + province) is too coarse: two
 * concurrent requisitions for the same role at the same employer legitimately
 * share one fingerprint (e.g. SHN's three concurrent "Primary Care Physician -
 * IPCT CEN" postings, JR106052/JR106062/JR106765). Collapsing those hid real
 * vacancies and dropped apply links. fingerprint's real job is matching the
 * SAME posting across DIFFERENT sources (Workday and Job Bank in Phase 2).
 *
 * So: group by fingerprint, then only treat a fingerprint group as a genuine
 * duplicate -- and merge it into one job -- when it spans more than one
 * distinct `source_id`. A fingerprint group where every row shares one
 * `source_id` is N distinct requisitions, not a duplicate, and is exploded
 * back into N singleton groups (one job each).
 */
export function groupIntoJobs(rows: RawRow[]): RawRow[][] {
  const byFingerprint = new Map<string, RawRow[]>();
  for (const row of rows) {
    const bucket = byFingerprint.get(row.fingerprint) ?? [];
    bucket.push(row);
    byFingerprint.set(row.fingerprint, bucket);
  }

  const jobGroups: RawRow[][] = [];
  for (const bucket of byFingerprint.values()) {
    const distinctSources = new Set(bucket.map((r) => r.source_id));
    if (distinctSources.size > 1) {
      jobGroups.push(bucket);
    } else {
      for (const row of bucket) jobGroups.push([row]);
    }
  }
  return jobGroups;
}

/**
 * Diacritics are stripped via the shared `deaccent()` (NFD + /[\u0300-\u036f]/g) rather
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

export function buildJobRow(row: RawRow, employerId: string | null, dedupeKey: string): JobRow {
  const n = row.normalized;
  const postedAt = new Date(n.postedAt);
  const hardExpiry = new Date(postedAt.getTime() + EXPIRY_DAYS * 86_400_000);
  const closesAt = n.closesAt ? new Date(n.closesAt) : null;
  const expiresAt = closesAt && closesAt < hardExpiry ? closesAt : hardExpiry;
  // Slug suffix is derived from dedupe_key (not fingerprint) so that N distinct
  // requisitions sharing one fingerprint get N distinct slugs instead of colliding
  // on jobs.slug's unique constraint.
  const slugSuffix = createHash('sha256').update(dedupeKey).digest('hex').slice(0, 8);

  return {
    slug: `${slugify(n.title)}-${slugSuffix}`,
    fingerprint: row.fingerprint,
    dedupe_key: dedupeKey,
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

  const jobGroups = groupIntoJobs(raws);

  // Built up here, written in chunks below. Row by row this was two round trips per job;
  // at ~3,500 active jobs that is 7,000 requests, and the run started to crowd the
  // six-hourly schedule.
  const jobRows: JobRow[] = [];
  const sourceIdsByDedupeKey = new Map<string, string[]>();

  let crossSourceMerges = 0;
  for (const rows of jobGroups) {
    const canonical = pickCanonical(rows);
    const fp = canonical.fingerprint;

    if (rows.length > 1) {
      // A genuine cross-source match (same fingerprint, more than one source_id) --
      // this is the intended, expected outcome of the matcher, not a defect, so it
      // is logged at `info`.
      crossSourceMerges += 1;
      log(ctx, 'info', 'cross-source duplicate merged', { fingerprint: fp, count: rows.length });
    }

    // `normalized` is jsonb, so the compiler's `sourceJobId: string` is a belief about
    // stored data, not a guarantee. Without this guard a row missing it yields the key
    // "<fp>:undefined", and a second such row would upsert straight over the first --
    // silent data loss. Skip instead; every current row has one (verified: 0 of 216).
    const sourceJobId = canonical.normalized.sourceJobId;
    if (!sourceJobId) {
      log(ctx, 'error', 'skipped group: canonical row has no sourceJobId', {
        fingerprint: fp, raw_posting_id: canonical.id,
      });
      continue;
    }

    const dedupeKey = `${fp}:${sourceJobId}`;
    const jobRow = buildJobRow(
      canonical,
      employerIdByName.get(canonical.normalized.employerName) ?? null,
      dedupeKey,
    );

    jobRows.push(jobRow);
    sourceIdsByDedupeKey.set(dedupeKey, rows.map((row) => row.id));
  }

  // Chunked rather than one statement: a single upsert of every job would be a multi-megabyte
  // request (descriptions included) and one failure would lose the whole run's writes.
  let jobsWritten = 0;
  let linksWritten = 0;
  for (let i = 0; i < jobRows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = jobRows.slice(i, i + WRITE_CHUNK_SIZE);
    const { data: written, error: upsertError } = await admin
      .from('jobs')
      .upsert(chunk, { onConflict: 'dedupe_key' })
      .select('id,dedupe_key');
    if (upsertError) {
      // Logged and skipped, like the per-row version before it: one bad chunk must not cost
      // the rest of the run. The affected jobs keep whatever row they already had.
      log(ctx, 'error', 'job upsert chunk failed', {
        first_dedupe_key: chunk[0]?.dedupe_key, size: chunk.length, error: upsertError.message,
      });
      continue;
    }
    jobsWritten += written?.length ?? 0;

    const links = (written ?? []).flatMap((job) =>
      (sourceIdsByDedupeKey.get(job.dedupe_key) ?? []).map((rawPostingId) => ({
        job_id: job.id as string,
        raw_posting_id: rawPostingId,
      })),
    );
    for (let j = 0; j < links.length; j += WRITE_CHUNK_SIZE) {
      const { error: sourceError } = await admin
        .from('job_sources')
        .upsert(links.slice(j, j + WRITE_CHUNK_SIZE), { onConflict: 'job_id,raw_posting_id' });
      if (sourceError) {
        // A missing job_sources link is a lesser failure than losing the rest of the run —
        // but it does matter: expire_stale_jobs reads these links to tell a live job from a
        // delisted one, so it is logged at error level.
        log(ctx, 'error', 'job_sources upsert chunk failed', { size: links.length, error: sourceError.message });
      } else {
        linksWritten += links.slice(j, j + WRITE_CHUNK_SIZE).length;
      }
    }
  }

  log(ctx, 'info', 'dedupe complete', {
    jobs: jobGroups.length, crossSourceMerges, jobsWritten, linksWritten,
  });
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
