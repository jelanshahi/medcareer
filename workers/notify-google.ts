import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createAdminClient } from '@/lib/db/admin';
import { SITE } from '@/lib/site';
import { log } from '@/workers/logger';
import { getAccessToken, parseCredentials, publish, type NotificationType } from '@/workers/google-indexing';

/**
 * Tells Google about job pages that opened or closed since the last successful run, via the
 * Indexing API (workers/google-indexing.ts). Runs as the last step of the ingest workflow.
 *
 * Off until GOOGLE_INDEXING_CREDENTIALS is set — without it this logs and exits cleanly, so
 * the pipeline is unaffected. Setup is in README.md ("Google Indexing API").
 *
 * Quota: Google's default is 200 publish calls a day and ingest runs four times a day, so
 * each run spends at most INDEXING_MAX_PER_RUN (default 45), new postings first — they
 * matter more than closed ones, which already answer 410 (proxy.ts) and carry a
 * validThrough date. A run that hits Google's 429 stops early rather than burning retries.
 * Anything past the budget is left to the sitemap, which lists every active job anyway.
 *
 * "Since the last run" is read from ingest_runs (source_id 'google-indexing'), so no new
 * table or column is needed.
 */

const SOURCE_ID = 'google-indexing';
const MAX_PER_RUN = Number(process.env.INDEXING_MAX_PER_RUN ?? 45);
/** First run, or no successful run on record: look back this far. */
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export function jobUrl(slug: string): string {
  return `${SITE.url}/jobs/${slug}`;
}

async function main() {
  const ctx = { sourceId: SOURCE_ID, runId: randomUUID() };

  const creds = parseCredentials(process.env.GOOGLE_INDEXING_CREDENTIALS);
  if (!creds) {
    log(ctx, 'info', 'GOOGLE_INDEXING_CREDENTIALS not set; skipping Indexing API notifications');
    return;
  }
  if (!/^https:\/\//.test(SITE.url)) {
    log(ctx, 'warn', 'NEXT_PUBLIC_SITE_URL is not a public https URL; skipping', { site_url: SITE.url });
    return;
  }

  const admin = createAdminClient();

  const { data: last, error: lastError } = await admin
    .from('ingest_runs')
    .select('started_at')
    .eq('source_id', SOURCE_ID)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;
  const since = last?.started_at ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS).toISOString();

  const { error: runError } = await admin.from('ingest_runs').insert({ id: ctx.runId, source_id: SOURCE_ID, status: 'running' });
  if (runError) throw runError;

  let updated = 0;
  let deleted = 0;
  let candidates = 0;
  try {
    const { data: opened, error: openedError } = await admin
      .from('jobs')
      .select('slug')
      .eq('is_active', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_PER_RUN);
    if (openedError) throw openedError;

    const room = Math.max(0, MAX_PER_RUN - (opened?.length ?? 0));
    const { data: closed, error: closedError } = room
      ? await admin
          .from('jobs')
          .select('slug')
          .eq('is_active', false)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(room)
      : { data: [], error: null };
    if (closedError) throw closedError;

    const queue: Array<{ slug: string; type: NotificationType }> = [
      ...(opened ?? []).map((j) => ({ slug: j.slug, type: 'URL_UPDATED' as const })),
      ...(closed ?? []).map((j) => ({ slug: j.slug, type: 'URL_DELETED' as const })),
    ];
    candidates = queue.length;

    if (queue.length > 0) {
      const token = await getAccessToken(creds);
      for (const item of queue) {
        const result = await publish(jobUrl(item.slug), item.type, token);
        if (result.ok) {
          if (item.type === 'URL_UPDATED') updated += 1;
          else deleted += 1;
          continue;
        }
        log(ctx, 'warn', 'publish failed', { slug: item.slug, type: item.type, status: result.status, error: result.error });
        if (result.status === 429 || result.status === 403) break; // quota or permission: later calls fail the same way
      }
    }

    const { error: doneError } = await admin
      .from('ingest_runs')
      .update({ status: 'success', finished_at: new Date().toISOString(), fetched: candidates, inserted: updated, updated: deleted })
      .eq('id', ctx.runId);
    if (doneError) throw doneError;
    log(ctx, 'info', 'indexing notifications sent', { since, candidates, url_updated: updated, url_deleted: deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin
      .from('ingest_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString(), fetched: candidates, inserted: updated, updated: deleted, error: message })
      .eq('id', ctx.runId);
    throw error;
  }
}

// Same entry-point guard as workers/run.ts: importing jobUrl in a test must not run main().
const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
