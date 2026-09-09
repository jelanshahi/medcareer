import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Service-role client. BYPASSES RLS.
 * Import only from workers/. Never from app/ — enforced by
 * tests/db/key-isolation.test.ts.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
