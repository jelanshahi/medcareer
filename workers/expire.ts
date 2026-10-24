import { pathToFileURL } from 'node:url';
import { createAdminClient } from '@/lib/db/admin';
import { log } from '@/workers/logger';

/** Postgres' "canceling statement due to statement timeout". */
const STATEMENT_TIMEOUT = '57014';

/**
 * Seconds to wait before each retry. PostgREST runs every call under the authenticator role's
 * 8s statement_timeout, and expire runs seconds after dedupe has dirtied most of the jobs
 * table. When a checkpoint lands on that write burst the same ~2s query overruns 8s (runs #154
 * and #157 failed that way). The checkpoint passes, so waiting and retrying is enough.
 */
const RETRY_DELAYS_MS = [15_000, 45_000, 90_000];

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

/** Calls `rpc`, retrying only on a statement timeout. Any other error is returned at once. */
export async function callWithTimeoutRetry(
  rpc: () => PromiseLike<RpcResult>,
  ctx: { sourceId: string; runId: string },
  delaysMs: readonly number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<RpcResult> {
  for (let attempt = 0; ; attempt += 1) {
    const result = await rpc();
    if (result.error?.code !== STATEMENT_TIMEOUT || attempt >= delaysMs.length) return result;
    log(ctx, 'warn', 'statement timeout, retrying', { attempt: attempt + 1, delay_ms: delaysMs[attempt] });
    await sleep(delaysMs[attempt]);
  }
}

async function main() {
  const admin = createAdminClient();
  const ctx = { sourceId: 'expire', runId: 'expire' };
  const { data, error } = await callWithTimeoutRetry(() => admin.rpc('expire_stale_jobs'), ctx);
  if (error) throw error;

  const result = (Array.isArray(data) ? data[0] : data) as
    { hard_expired?: number; unseen_expired?: number } | null;
  log(ctx, 'info', 'expiry complete', {
    hard_expired: result?.hard_expired ?? 0,
    unseen_expired: result?.unseen_expired ?? 0,
  });
}

// Same entry-point guard as dedupe.ts, so the test can import callWithTimeoutRetry without
// running main().
const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
