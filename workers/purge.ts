import { createAdminClient } from '@/lib/db/admin';
import { log } from '@/workers/logger';

/**
 * A job is deleted outright once it is this old, whether or not the employer still lists
 * it. Safe because the crawlers skip anything older than 30 days they have not already
 * stored (workers/run.ts MAX_AGE_DAYS), so a purged job cannot be re-ingested.
 */
const MAX_AGE_DAYS = Number(process.env.PURGE_MAX_AGE_DAYS ?? 60);

/** Days a delisted job's postings must have gone unseen before its rows are removed. */
const RETENTION_DAYS = Number(process.env.PURGE_RETENTION_DAYS ?? 7);

async function main() {
  for (const [name, value] of [['PURGE_MAX_AGE_DAYS', MAX_AGE_DAYS], ['PURGE_RETENTION_DAYS', RETENTION_DAYS]] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer, got "${value}"`);
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('purge_jobs', {
    max_age_days: MAX_AGE_DAYS,
    retention_days: RETENTION_DAYS,
  });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  log({ sourceId: 'purge', runId: 'purge' }, 'info', 'purge complete', {
    max_age_days: MAX_AGE_DAYS,
    retention_days: RETENTION_DAYS,
    jobs_purged: result?.jobs_purged ?? 0,
    raw_postings_purged: result?.raw_postings_purged ?? 0,
  });
}

main().catch((error) => { console.error(error); process.exit(1); });
