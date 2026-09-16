'use server';

import { createServerClient } from '@/lib/db/server';
import { JobAlertSchema, type JobAlertState } from '@/lib/schemas/job-alert';

/** Postgres unique_violation. The address is already subscribed. */
const UNIQUE_VIOLATION = '23505';

/** Deliberately the same text for a new signup and for an address that is
 *  already on the list. This form is public and unauthenticated, so a distinct
 *  "already subscribed" reply would turn it into an oracle for testing whether
 *  a given address is registered. */
const CONFIRMATION = "You're on the list. We'll email you when matching jobs are posted.";

/** Server Actions are reachable by direct POST, not only through this form, so
 *  everything here validates its own input rather than trusting the page.
 *
 *  Writes with the anon key against an insert-only RLS policy (migration 0007):
 *  the public form has to create a row and must be able to do nothing else. The
 *  service-role key is confined to workers/ and cannot be imported here —
 *  tests/db/key-isolation.test.ts enforces that. */
export async function createJobAlert(
  _prev: JobAlertState,
  formData: FormData,
): Promise<JobAlertState> {
  const parsed = JobAlertSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    company: String(formData.get('company') ?? ''),
  });

  if (!parsed.success) {
    // A filled honeypot gets the confirmation rather than the error, so a bot
    // cannot use the response to learn that the field is a trap.
    if (formData.get('company')) return { status: 'success', message: CONFIRMATION };
    return { status: 'error', message: 'Enter a valid email address.' };
  }

  // No .select() chained on purpose: anon has insert but no select on this
  // table, so asking for the row back would fail the whole statement.
  const { error } = await createServerClient()
    .from('job_alerts')
    .insert({ email: parsed.data.email });

  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error('job_alerts insert failed', error.code, error.message);
    return { status: 'error', message: 'Something went wrong. Please try again in a moment.' };
  }

  return { status: 'success', message: CONFIRMATION };
}
