import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { buildAssertion, parseCredentials, publish, getAccessToken, INDEXING_SCOPE } from '@/workers/google-indexing';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const creds = {
  client_email: 'indexer@medcareer-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};

describe('parseCredentials', () => {
  it('is null when unset', () => {
    expect(parseCredentials(undefined)).toBeNull();
    expect(parseCredentials('  ')).toBeNull();
  });

  it('reads raw JSON and base64 JSON alike', () => {
    const json = JSON.stringify(creds);
    expect(parseCredentials(json)?.client_email).toBe(creds.client_email);
    expect(parseCredentials(Buffer.from(json).toString('base64'))?.client_email).toBe(creds.client_email);
  });

  it('throws on a malformed secret rather than silently doing nothing', () => {
    expect(() => parseCredentials('{"client_email":"x"}')).toThrow();
  });
});

describe('buildAssertion', () => {
  it('produces an RS256 JWT with the indexing scope that verifies against the key', () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const jwt = buildAssertion(creds, now);
    const [header, claims, signature] = jwt.split('.');

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(body).toMatchObject({ iss: creds.client_email, scope: INDEXING_SCOPE, iat: now.getTime() / 1000 });
    expect(body.exp - body.iat).toBe(3600);

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });
});

describe('getAccessToken / publish', () => {
  it('exchanges the assertion and publishes with the bearer token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const token = await getAccessToken(creds, fake);
    expect(token).toBe('tok');
    expect(await publish('https://www.medcareer.ca/jobs/x', 'URL_UPDATED', token, fake)).toEqual({ ok: true });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ url: 'https://www.medcareer.ca/jobs/x', type: 'URL_UPDATED' });
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('reports a quota error instead of throwing', async () => {
    const fake = (async () => new Response('quota', { status: 429 })) as unknown as typeof fetch;
    expect(await publish('https://www.medcareer.ca/jobs/x', 'URL_DELETED', 'tok', fake)).toEqual({ ok: false, status: 429, error: 'quota' });
  });
});
