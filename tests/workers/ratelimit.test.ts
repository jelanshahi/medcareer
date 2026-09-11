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

  // The interval alone serializes SHORT tasks, so the sibling tests above pass even with
  // the promise chain deleted. This one uses a task LONGER than the interval, where only
  // the chain can prevent overlap: without it the order is one:start two:start one:end.
  it('serializes concurrent calls to the same host', async () => {
    const limit = createHostLimiter(1);
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      events.push(`${name}:end`);
    };
    await Promise.all([limit('a.test', task('one')), limit('a.test', task('two'))]);
    expect(events).toEqual(['one:start', 'one:end', 'two:start', 'two:end']);
  });

  it('surfaces a rejection and keeps serializing the host afterwards', async () => {
    const limit = createHostLimiter(1);
    await expect(limit('a.test', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(limit('a.test', async () => 'ok')).resolves.toBe('ok');
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
    const stub = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', stub);
    await expect(fetchWithBackoff('https://a.test/x', {}, { attempts: 2, baseDelayMs: 1 }))
      .rejects.toThrow(/503/);
    // Pin the budget this test is named for: /503/ alone passes on a wrong retry count.
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('refuses non-https URLs', async () => {
    await expect(fetchWithBackoff('http://a.test/x', {})).rejects.toThrow(/https/i);
  });

  // A DNS failure, connection reset or socket timeout REJECTS rather than returning a
  // status. Those are exactly what backoff exists for, but they used to propagate on the
  // first attempt and abort the whole employer's run.
  it('retries a thrown fetch rejection and then succeeds', async () => {
    let calls = 0;
    const stub = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed: ENOTFOUND');
      return new Response('{"ok":true}', { status: 200 });
    });
    vi.stubGlobal('fetch', stub);

    const res = await fetchWithBackoff('https://a.test/x', {}, { baseDelayMs: 1 });
    expect(res.status).toBe(200);
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('gives up after the budget when every attempt throws, naming the cause', async () => {
    const stub = vi.fn(async () => { throw new TypeError('fetch failed: ECONNRESET'); });
    vi.stubGlobal('fetch', stub);

    await expect(fetchWithBackoff('https://a.test/x', {}, { attempts: 3, baseDelayMs: 1 }))
      .rejects.toThrow(/ECONNRESET/);
    expect(stub).toHaveBeenCalledTimes(3);
  });
});
