/**
 * The employer's own id for the posting — the requisition or job number in their ATS.
 * workers/dedupe.ts builds dedupe_key as `${fingerprint}:${sourceJobId}`, and the
 * fingerprint is a sha256 hex digest (no colons), so everything after the first colon is
 * the source job id. Null when the key does not have that shape.
 */
export function sourceJobIdFromDedupeKey(dedupeKey: string): string | null {
  const at = dedupeKey.indexOf(':');
  if (at <= 0) return null;
  const id = dedupeKey.slice(at + 1).trim();
  return id || null;
}
