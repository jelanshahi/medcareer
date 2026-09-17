import { describe, it, expect } from 'vitest';
import { selectAll, SELECT_PAGE_SIZE } from '@/lib/db/select-all';

const table = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('selectAll', () => {
  it('reads past the page cap until a short page', async () => {
    const rows = table(SELECT_PAGE_SIZE * 2 + 37);
    const calls: Array<[number, number]> = [];
    const result = await selectAll(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(result).toEqual(rows);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('makes one extra call when the total is an exact multiple of the page size', async () => {
    const rows = table(SELECT_PAGE_SIZE);
    let calls = 0;
    const result = await selectAll(async (from, to) => {
      calls += 1;
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(result).toHaveLength(SELECT_PAGE_SIZE);
    expect(calls).toBe(2);
  });

  it('throws the query error instead of returning a partial list', async () => {
    const failure = new Error('boom');
    await expect(
      selectAll(async (from) => (from === 0 ? { data: table(SELECT_PAGE_SIZE), error: null } : { data: null, error: failure })),
    ).rejects.toBe(failure);
  });
});
