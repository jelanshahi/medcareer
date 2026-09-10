import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHostLimiter, fetchWithBackoff, MIN_INTERVAL_MS } from '@/workers/ratelimit';

describe('createHostLimiter', () => {
  it('defaults to at least one second between requests', () => {
    expect(MIN_INTERVAL_MS).toBeGreaterThanOrEqual(1000);
  });

  it('spaces consecutive calls to the same host', async () => {
    const limit = createHostLimiter(60);
    const started: number[] = [];
    const mark = async () => { started.push(Date.now()); };
    await limit('a.test', mark);
    await limit('a.test', mark);
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(55);
  });

  it('does not delay calls to different hosts', async () => {
    const limit = createHostLimiter(200);
    const t0 = Date.now();
    await limit('a.test', async () => {});
    await limit('b.test', async () => {});
    expect(Date.now() - t0).toBeLessThan(150);
  });
});

describe('fetchWithBackoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries on 429 and then succeeds', async () => {
    const responses = [
      new Response('', { status: 429 }),
      new Response('{"ok":true}', { status: 200 }),
    ];
    const stub = vi.fn(async () => responses.shift()!);
    vi.stubGlobal('fetch', stub);

    const res = await fetchWithBackoff('https://a.test/x', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget and throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(fetchWithBackoff('https://a.test/x', {}, { attempts: 2, baseDelayMs: 1 }))
      .rejects.toThrow(/503/);
  });

  it('refuses non-https URLs', async () => {
    await expect(fetchWithBackoff('http://a.test/x', {})).rejects.toThrow(/https/i);
  });
});
