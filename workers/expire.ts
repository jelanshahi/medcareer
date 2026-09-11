import { createAdminClient } from '@/lib/db/admin';
import { log } from '@/workers/logger';

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('expire_stale_jobs');
  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  log({ sourceId: 'expire', runId: 'expire' }, 'info', 'expiry complete', {
    hard_expired: result?.hard_expired ?? 0,
    unseen_expired: result?.unseen_expired ?? 0,
  });
}

main().catch((error) => { console.error(error); process.exit(1); });
