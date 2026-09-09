import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/db/admin';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.runIf(Boolean(url && anon))('row level security', () => {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });

  // An empty table returns zero rows whether RLS is enforcing or completely
  // disabled, so for a currently-empty table this assertion is necessarily
  // weak on its own. Its real strength comes from the service-role fixture
  // checks below, which prove the table actually holds rows anon can't see,
  // plus real ingested data once the pipeline runs.
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

describe.runIf(Boolean(url && anon && serviceKey))('row level security fixture checks', () => {
  // Constructed lazily inside each test, not at describe-body scope: Vitest still
  // executes a skipped describe's callback body to collect its tests, so eagerly
  // calling createAdminClient() here would throw even when this block is skipped.
  function admin() {
    return createAdminClient();
  }

  // The anon-only assertions above prove nothing about a table that is empty:
  // zero rows come back whether RLS is enforcing or switched off entirely. These
  // checks use the service role, which bypasses RLS, to confirm the table really
  // does hold rows that anon is being denied.
  //
  // raw_postings, ingest_runs and job_sources are deliberately absent from this
  // list because they are empty until the ingestion pipeline runs. Add them here
  // once Task 9 populates them.
  it.each(['employers', 'jobs'] as const)(
    'has rows in %s that the service role can see and anon cannot',
    async (table) => {
      const { count, error } = await admin()
        .from(table)
        .select('*', { count: 'exact', head: true });
      expect(error).toBeNull();
      expect(count ?? 0).toBeGreaterThan(0);
    },
  );

  it('confirms the RLS sentinel row still exists', async () => {
    const { data, error } = await admin()
      .from('jobs')
      .select('slug,is_active')
      .eq('slug', 'rls-sentinel-inactive-do-not-delete');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].is_active).toBe(false);
  });
});
