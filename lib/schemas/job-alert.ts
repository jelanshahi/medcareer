import { z } from 'zod';
import { CATEGORIES } from '@/lib/taxonomy/categories';

/** RFC 5321's limit on a complete address. The same cap is a CHECK constraint
 *  on the column (supabase/migrations/0007_job_alerts.sql), so anything longer
 *  would be rejected by the database anyway — better to say so in the form. */
export const MAX_EMAIL_LENGTH = 254;

/** Matches the column's own cap (migration 0013). A city comes from a <select>
 *  populated with real, already-short city names, so this is a backstop
 *  against a hand-crafted request rather than something a real user can hit. */
export const MAX_CITY_LENGTH = 100;

/** '' means "no preference" — the same value an unselected <select> submits —
 *  and is normalized to undefined so it reaches the database as NULL rather
 *  than an empty string that would only ever match a job with no city at all. */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const JobAlertSchema = z.object({
  email: z.email().max(MAX_EMAIL_LENGTH),
  city: z.preprocess(blankToUndefined, z.string().trim().min(1).max(MAX_CITY_LENGTH).optional()),
  category: z.preprocess(blankToUndefined, z.enum(CATEGORIES).optional()),
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

/** Result of following a confirm or unsubscribe link.
 *  'invalid' covers a malformed token, an unknown one, and a confirm link for
 *  a subscription that has since been cancelled — the page says the same thing
 *  for all three, since telling them apart would leak whether a token is real. */
export type AlertLinkState = 'idle' | 'ok' | 'invalid' | 'failed';
