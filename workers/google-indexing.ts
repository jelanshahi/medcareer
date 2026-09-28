import { createSign } from 'node:crypto';
import { z } from 'zod';

/**
 * Google Indexing API client, dependency-free.
 *
 * Google accepts this API for pages carrying JobPosting markup — every /jobs/[slug] page
 * does — and recommends it over sitemaps for job URLs: a new posting can be crawled within
 * minutes instead of whenever the sitemap is next read, and a closed one drops out of
 * Google for Jobs sooner. Auth is a service account's own signed JWT exchanged for an
 * access token (RFC 7523), which needs nothing beyond node:crypto.
 */

export const INDEXING_SCOPE = 'https://www.googleapis.com/auth/indexing';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PUBLISH_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

const CredentialsSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().includes('PRIVATE KEY'),
});
export type ServiceAccount = z.infer<typeof CredentialsSchema>;

/** The service account key file, as stored in a secret: raw JSON, or base64 of it (which
 * survives secret stores that mangle newlines). Null when unset; throws when malformed, so
 * a broken secret fails loudly instead of silently notifying nothing. */
export function parseCredentials(raw: string | undefined): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw.trim(), 'base64').toString('utf8');
  return CredentialsSchema.parse(JSON.parse(text));
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** The signed JWT assertion for the token exchange. Pure given `now`. */
export function buildAssertion(creds: ServiceAccount, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: creds.client_email, scope: INDEXING_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${base64url(signer.sign(creds.private_key))}`;
}

export async function getAccessToken(creds: ServiceAccount, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildAssertion(creds),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await res.json().catch(() => null);
  const token = z.object({ access_token: z.string() }).safeParse(body);
  if (!res.ok || !token.success) throw new Error(`Google token exchange failed (${res.status}): ${JSON.stringify(body)}`);
  return token.data.access_token;
}

export type NotificationType = 'URL_UPDATED' | 'URL_DELETED';

export type PublishResult = { ok: true } | { ok: false; status: number; error: string };

export async function publish(
  url: string,
  type: NotificationType,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PublishResult> {
  const res = await fetchImpl(PUBLISH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ url, type }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { ok: true };
  return { ok: false, status: res.status, error: (await res.text().catch(() => '')).slice(0, 300) };
}
