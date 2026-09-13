import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Anon client for client components. Same public key as the server client
 * (lib/db/server.ts) — NEXT_PUBLIC_* env vars are safe to ship to the
 * browser — kept as a separate file because it's called from a different
 * runtime, matching this project's existing admin.ts / server.ts split. */
export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}
