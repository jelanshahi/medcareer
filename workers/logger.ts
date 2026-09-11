export type LogContext = { sourceId: string; runId: string };

export function log(
  ctx: LogContext,
  level: 'info' | 'warn' | 'error',
  message: string,
  extra: Record<string, unknown> = {},
): void {
  // `extra` is spread FIRST so a caller-supplied key can never clobber the structured
  // fields below — these lines are the ingestion audit trail and must stay trustworthy.
  console.log(JSON.stringify({
    ...extra,
    ts: new Date().toISOString(),
    level,
    message,
    source_id: ctx.sourceId,
    run_id: ctx.runId,
  }));
}
