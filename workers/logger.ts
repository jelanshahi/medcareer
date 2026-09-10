export type LogContext = { sourceId: string; runId: string };

export function log(
  ctx: LogContext,
  level: 'info' | 'warn' | 'error',
  message: string,
  extra: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    source_id: ctx.sourceId,
    run_id: ctx.runId,
    ...extra,
  }));
}
