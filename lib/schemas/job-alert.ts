import { z } from 'zod';

/** RFC 5321's limit on a complete address. The same cap is a CHECK constraint
 *  on the column (supabase/migrations/0007_job_alerts.sql), so anything longer
 *  would be rejected by the database anyway — better to say so in the form. */
export const MAX_EMAIL_LENGTH = 254;

export const JobAlertSchema = z.object({
  email: z.email().max(MAX_EMAIL_LENGTH),
  /** Honeypot. A real person never sees this field, so any value in it means a
   *  bot filled the form in blindly. Empty string is the only valid input. */
  company: z.literal(''),
});

export type JobAlertInput = z.infer<typeof JobAlertSchema>;

/** The reply the signup action hands back to the form.
 *
 *  Lives here rather than beside the action: a "use server" file may only
 *  export async functions, so a plain object exported from it is a runtime
 *  error — one that the build and tsc both accept silently. */
export type JobAlertState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

export const JOB_ALERT_INITIAL: JobAlertState = { status: 'idle' };
