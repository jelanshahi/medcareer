import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Anon client for server components. Reads only what RLS permits. */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
