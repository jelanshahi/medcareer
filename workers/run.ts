import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createAdminClient } from '@/lib/db/admin';
import type { Json } from '@/lib/db/database.types';
import { createIcimsConnector, type IcimsEmployer } from '@/workers/connectors/icims';
import { createJibeConnector, type JibeEmployer } from '@/workers/connectors/jibe';
import { createTaleoConnector, type TaleoEmployer } from '@/workers/connectors/taleo';
import type { Connector } from '@/workers/connectors/types';
import { createWorkdayConnector, type WorkdayEmployer } from '@/workers/connectors/workday';
import { fingerprint } from '@/lib/normalize/fingerprint';
import { log, type LogContext } from '@/workers/logger';
import { PROVINCE_CODES, type NormalizedPosting } from '@/lib/types';

/** Matches PostgREST's default max-rows cap on Supabase. */
const SELECT_PAGE_SIZE = 1000;

const contentHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * `employers.ats_config` is an untyped jsonb column (`Json | null` in the generated types).
 * The plan's global constraint is "parse external data with Zod rather than casting", and a
 * registry row is exactly that: data from the database, not something the compiler can vouch
 * for. Validating it here also means one malformed registry row fails closed (skipped, logged)
 * instead of throwing deep inside the connector with a confusing "cannot read property of
 * undefined" — consistent with "one connector failing never aborts the others".
 */
const WorkdayAtsConfigSchema = z.object({
  tenant: z.string().min(1),
  site: z.string().min(1),
  host: z.string().min(1),
  parseDescriptionHeader: z.boolean(),
});

const TaleoAtsConfigSchema = z.object({
  key: z.string().min(1),
  host: z.string().min(1),
});

/** iCIMS and Jibe boards name grouped locations ("Greater Toronto"); the registry maps them. */
const BoardAtsConfigSchema = z.object({
  key: z.string().min(1),
  host: z.string().min(1),
  cityAliases: z.record(z.string(), z.string()).optional(),
});

const EmployerBaseSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  province: z.enum(PROVINCE_CODES),
  default_city: z.string().min(1),
});

const EmployerRowSchema = z.discriminatedUnion('ats_platform', [
  EmployerBaseSchema.extend({ ats_platform: z.literal('workday'), ats_config: WorkdayAtsConfigSchema }),
  EmployerBaseSchema.extend({ ats_platform: z.literal('taleo'), ats_config: TaleoAtsConfigSchema }),
  EmployerBaseSchema.extend({ ats_platform: z.literal('icims'), ats_config: BoardAtsConfigSchema }),
  EmployerBaseSchema.extend({ ats_platform: z.literal('jibe'), ats_config: BoardAtsConfigSchema }),
]);

/** Updates in chunks so a long `in (...)` list stays well under URL length limits. */
const TOUCH_CHUNK_SIZE = 200;

/**
 * A posting we have never stored is only ingested if it was posted within this window.
 * Employers keep evergreen roles ("casual pool") open for months, and storing every one of
 * them fills the database with rows the site hides anyway — jobs are deleted at 60 days
 * (supabase/migrations/0011_purge_by_age.sql).
 *
 * A posting we ALREADY hold is never dropped for being old: it stays, and keeps being
 * marked as seen, until the 60-day purge removes it or the employer takes it down. The two
 * rules together mean a job is stored once, shown for its whole life, then deleted — and a
 * purged job is never re-ingested, because by then it is past this cutoff.
 */
export const MAX_AGE_DAYS = Number(process.env.INGEST_MAX_AGE_DAYS ?? 30);

const DAY_MS = 86_400_000;

export function isTooOld(postedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - postedAt.getTime() > MAX_AGE_DAYS * DAY_MS;
}

/**
 * `raw_postings.normalized` is jsonb (`Json` in the generated types), but `NormalizedPosting`
 * carries `postedAt`/`closesAt` as `Date` — not a `Json` member. Serialize dates to ISO strings
 * before storage; `contentHash` continues to hash the original `NormalizedPosting` object
 * (`JSON.stringify` already turns a `Date` into the same ISO string via `Date#toJSON`), so the
 * hash is unaffected by this conversion.
 */
function toStorableNormalized(normalized: NormalizedPosting): Json {
  return {
    ...normalized,
    postedAt: normalized.postedAt.toISOString(),
    closesAt: normalized.closesAt?.toISOString(),
  };
}

async function ingestEmployer(
  admin: ReturnType<typeof createAdminClient>,
  employerSlug: string,
  createConnector: (ctx: LogContext) => Connector,
  sourceId: string,
) {
  const runId = randomUUID();
  const ctx: LogContext = { sourceId, runId };

  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedOld = 0;

  // The whole body — including the initial `ingest_runs` insert — lives inside this try.
  // If the insert itself throws (e.g. a transient network failure), the catch below still runs
  // and this function still returns normally: nothing escapes to abort the employers loop in
  // main(). See task-9-report.md for why the brief's original placement (insert before the
  // try) was a genuine isolation gap.
  try {
    // NOTE ON EVERY SUPABASE CALL BELOW: supabase-js RESOLVES with `{ data, error }` rather
    // than rejecting. An unchecked call makes a failed write indistinguishable from a
    // successful one — the run would report `status: 'success'` having written nothing.
    const { error: runInsertError } = await admin
      .from('ingest_runs')
      .insert({ id: runId, source_id: sourceId, status: 'running' });
    if (runInsertError) throw new Error(`ingest_runs insert failed: ${runInsertError.message}`);

    const connector = createConnector(ctx);

    // PostgREST caps a single response (1000 rows by default on Supabase). Unpaged, every
    // posting past row 1000 for this source would be missing from `known`, so `previous`
    // is undefined and it is counted as newly inserted on EVERY run -- quietly breaking
    // the "a second ingest reports inserted = 0" guarantee. The largest source is at 114
    // rows today, which is exactly why this would ship unnoticed.
    const known = new Map<string, string>();
    for (let from = 0; ; from += SELECT_PAGE_SIZE) {
      const { data: page, error: existingError } = await admin
        .from('raw_postings')
        .select('source_job_id,content_hash')
        .eq('source_id', sourceId)
        .range(from, from + SELECT_PAGE_SIZE - 1);
      // Unchecked, a failed select yields an empty `known` map and every posting is
      // miscounted as newly inserted.
      if (existingError) throw new Error(`raw_postings select failed: ${existingError.message}`);
      for (const r of page ?? []) known.set(r.source_job_id, r.content_hash);
      if (!page || page.length < SELECT_PAGE_SIZE) break;
    }

    const seenKnown: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await connector.fetchPage(cursor);
      cursor = page.nextCursor;

      for (const stub of page.items) {
        fetched += 1;
        const isKnown = known.has(stub.sourceJobId);

        if (!isKnown && stub.postedAt && isTooOld(stub.postedAt)) {
          // The list said how old it is, so this one costs no detail fetch at all.
          skippedOld += 1;
          continue;
        }
        if (!connector.refreshKnown && isKnown) {
          seenKnown.push(stub.sourceJobId);
          unchanged += 1;
          continue;
        }
        try {
          const payload = await connector.hydrate(stub);
          const normalized = connector.normalize(payload);

          // Sources whose list carries no date (Taleo) are filtered here instead. Already-stored
          // postings are kept whatever their age; only new ones are turned away.
          if (!isKnown && isTooOld(normalized.postedAt)) {
            skippedOld += 1;
            continue;
          }

          const hash = contentHash(normalized);
          const previous = known.get(normalized.sourceJobId);

          const { error: upsertError } = await admin.from('raw_postings').upsert(
            {
              source_id: sourceId,
              source_job_id: normalized.sourceJobId,
              source_url: normalized.sourceUrl,
              // `payload` is `unknown` at the Connector boundary by design (normalize() is what
              // validates it). It is the JSON body returned by `hydrate()`'s `response.json()`,
              // and by this point `connector.normalize(payload)` above has already parsed it
              // successfully with Zod, so it is proven to be JSON-shaped data.
              payload: payload as Json,
              normalized: toStorableNormalized(normalized),
              content_hash: hash,
              fingerprint: fingerprint({
                title: normalized.title,
                employerKey: employerSlug,
                city: normalized.city,
                province: normalized.province,
              }),
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'source_id,source_job_id' },
          );
          // Routes to the per-item catch, so the item is logged and skipped. Counting
          // before this check would report writes that never landed.
          if (upsertError) throw new Error(`raw_postings upsert failed: ${upsertError.message}`);

          if (previous === undefined) inserted += 1;
          else if (previous !== hash) updated += 1;
        } catch (error) {
          // One bad item must never abort the run.
          log(ctx, 'warn', 'skipped item', {
            source_job_id: stub.sourceJobId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } while (cursor);

    // Known postings that were skipped above still have to count as seen, or expire_stale_jobs
    // deactivates them after 7 days. Only reached when the whole list was walked: a crawl that
    // threw part-way must not refresh anything it didn't see.
    const seenAt = new Date().toISOString();
    for (let i = 0; i < seenKnown.length; i += TOUCH_CHUNK_SIZE) {
      const { error: touchError } = await admin
        .from('raw_postings')
        .update({ last_seen_at: seenAt })
        .eq('source_id', sourceId)
        .in('source_job_id', seenKnown.slice(i, i + TOUCH_CHUNK_SIZE));
      if (touchError) throw new Error(`raw_postings last_seen_at update failed: ${touchError.message}`);
    }

    const { error: successError } = await admin.from('ingest_runs').update({
      status: 'success', finished_at: new Date().toISOString(), fetched, inserted, updated,
    }).eq('id', runId);
    if (successError) throw new Error(`ingest_runs success update failed: ${successError.message}`);

    log(ctx, 'info', 'run complete', { fetched, inserted, updated, unchanged, skippedOld });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Deliberately NOT throwing on this one: it runs on the failure path, and throwing would
    // discard `message` — the original cause — in favour of the bookkeeping error. Log both.
    const { error: failureError } = await admin.from('ingest_runs').update({
      status: 'failed', finished_at: new Date().toISOString(), fetched, inserted, updated, error: message,
    }).eq('id', runId);
    if (failureError) {
      log(ctx, 'error', 'could not record run failure', { error: failureError.message });
    }
    log(ctx, 'error', 'run failed', { error: message });
  }
}

async function main() {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('employers')
    .select('slug,name,province,default_city,ats_platform,ats_config')
    .eq('is_active', true)
    .in('ats_platform', ['workday', 'taleo', 'icims', 'jibe']);

  if (error) throw error;

  for (const row of rows ?? []) {
    const parsed = EmployerRowSchema.safeParse(row);
    if (!parsed.success) {
      // A malformed registry row must not take down the other employers either.
      console.error(`Skipping employer "${String(row.slug)}": invalid registry row`, z.flattenError(parsed.error));
      continue;
    }

    const base = {
      slug: parsed.data.slug,
      name: parsed.data.name,
      province: parsed.data.province,
      defaultCity: parsed.data.default_city,
    };

    let sourceId: string;
    let createConnector: (ctx: LogContext) => Connector;
    if (parsed.data.ats_platform === 'workday') {
      const employer: WorkdayEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `workday:${employer.config.tenant}`;
      createConnector = (ctx) => createWorkdayConnector(employer, ctx);
    } else if (parsed.data.ats_platform === 'taleo') {
      const employer: TaleoEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `taleo:${employer.config.key}`;
      createConnector = (ctx) => createTaleoConnector(employer, ctx);
    } else if (parsed.data.ats_platform === 'icims') {
      const employer: IcimsEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `icims:${employer.config.key}`;
      createConnector = (ctx) => createIcimsConnector(employer, ctx);
    } else {
      const employer: JibeEmployer = { ...base, config: parsed.data.ats_config };
      sourceId = `jibe:${employer.config.key}`;
      createConnector = (ctx) => createJibeConnector(employer, ctx);
    }

    // Sequential on purpose: one connector failing must not affect the others,
    // and the shared limiter is per-host anyway. The try/catch here is a deliberate backstop —
    // ingestEmployer() is written to swallow its own errors, but a failure this loop can't
    // anticipate (e.g. both the success-path and failure-path `ingest_runs` update throwing in
    // sequence) must still not stop the remaining employers from being ingested.
    try {
      await ingestEmployer(admin, base.slug, createConnector, sourceId);
    } catch (error) {
      console.error(`ingestEmployer crashed for employer "${base.slug}"`, error);
    }
  }
}

// Same guard as workers/dedupe.ts: without it, merely importing MAX_AGE_DAYS/isTooOld from
// this module runs the whole ingest as a side effect — which throws before a database is
// configured. `pathToFileURL` (not manual `file://` concatenation) so the comparison holds
// even though this repo's path contains spaces.
const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
