import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe.runIf(Boolean(url && anon))('row level security', () => {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });

  it.each(['raw_postings', 'ingest_runs', 'employers', 'job_sources'])(
    'returns no rows to anon from %s',
    async (table) => {
      const { data, error } = await client.from(table).select('*').limit(1);
      // An RLS-denied read is a successful, empty response. An error here means the
      // connection or table name is wrong, and the emptiness below would prove nothing.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    },
  );

  it('hides inactive jobs from anon', async () => {
    const { data, error } = await client
      .from('jobs')
      .select('slug,is_active')
      .eq('slug', 'rls-sentinel-inactive-do-not-delete');

    // This row exists in the database with is_active = false. If the policy were
    // dropped or widened, it would appear here and this assertion would fail.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('returns only active rows from jobs', async () => {
    const { data, error } = await client.from('jobs').select('id,is_active').limit(50);
    expect(error).toBeNull();
    for (const row of data ?? []) expect(row.is_active).toBe(true);
  });
});
