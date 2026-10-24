import { describe, it, expect } from 'vitest';
import { callWithTimeoutRetry } from '@/workers/expire';

const ctx = { sourceId: 'expire', runId: 'test' };
const timeout = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
const ok = { data: [{ hard_expired: 1, unseen_expired: 2 }], error: null };
const noSleep = async () => {};

function scripted(results: Array<typeof timeout | typeof ok | { data: null; error: { code: string; message: string } }>) {
  let calls = 0;
  return { rpc: async () => results[Math.min(calls++, results.length - 1)], calls: () => calls };
}

describe('callWithTimeoutRetry', () => {
  it('retries a statement timeout and returns the later success', async () => {
    const s = scripted([timeout, timeout, ok]);
    const result = await callWithTimeoutRetry(s.rpc, ctx, [1, 1, 1], noSleep);
    expect(result).toEqual(ok);
    expect(s.calls()).toBe(3);
  });

  it('gives up after the last delay and returns the timeout', async () => {
    const s = scripted([timeout]);
    const result = await callWithTimeoutRetry(s.rpc, ctx, [1, 1], noSleep);
    expect(result.error?.code).toBe('57014');
    expect(s.calls()).toBe(3);
  });

  it('does not retry other errors', async () => {
    const s = scripted([{ data: null, error: { code: '42501', message: 'permission denied' } }]);
    const result = await callWithTimeoutRetry(s.rpc, ctx, [1, 1], noSleep);
    expect(result.error?.code).toBe('42501');
    expect(s.calls()).toBe(1);
  });
});
