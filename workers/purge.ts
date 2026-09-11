import { createAdminClient } from '@/lib/db/admin';
import { log } from '@/workers/logger';

/**
 * Days a job must have gone unseen before its rows are removed. A job is purged only
 * once the employer has stopped listing it -- see 0006_purge_expired.sql for why
 * purging a still-listed job reclaims nothing.
 */
const RETENTION_DAYS = Number(process.env.PURGE_RETENTION_DAYS ?? 30);

async function main() {
  if (!Number.isInteger(RETENTION_DAYS) || RETENTION_DAYS < 1) {
    throw new Error(`PURGE_RETENTION_DAYS must be a positive integer, got "${process.env.PURGE_RETENTION_DAYS}"`);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('purge_expired_jobs', { retention_days: RETENTION_DAYS });
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  log({ sourceId: 'purge', runId: 'purge' }, 'info', 'purge complete', {
    retention_days: RETENTION_DAYS,
    jobs_purged: result?.jobs_purged ?? 0,
    raw_postings_purged: result?.raw_postings_purged ?? 0,
  });
}

main().catch((error) => { console.error(error); process.exit(1); });
