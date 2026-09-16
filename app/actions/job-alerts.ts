'use server';

import { randomUUID } from 'node:crypto';
import { createServerClient } from '@/lib/db/server';
import { alertsFrom, alertsReplyTo, createEmailClient } from '@/lib/email/client';
import { confirmationEmail } from '@/lib/email/templates';
import { JobAlertSchema, type JobAlertState } from '@/lib/schemas/job-alert';

/** Deliberately the same text for a new signup, an address that is already
 *  confirmed, and one that asked again a minute ago. This form is public and
 *  unauthenticated, so any difference between those replies would turn it into
 *  an oracle for testing whether an address is registered. */
const CONFIRMATION = 'Check your email — open the link we just sent to finish setting up your alert.';

/** Server Actions are reachable by direct POST, not only through this form, so
 *  everything here validates its own input rather than trusting the page.
 *
 *  Nothing here reads job_alerts, and it could not: anon has no table-level
 *  access at all (migration 0009). Signup runs through request_job_alert, which
 *  decides whether an email is warranted and answers with a status only. The
 *  token is generated here and travels one way — into the database and into the
 *  email — because a token handed back to the browser would let anyone confirm
 *  a subscription for an address that is not theirs.
 *
 *  The service-role key stays out of app/ entirely; key-isolation enforces it. */
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

  const token = randomUUID();
  const { data: outcome, error } = await createServerClient().rpc('request_job_alert', {
    p_email: parsed.data.email,
    p_token: token,
  });

  if (error) {
    console.error('request_job_alert failed', error.code, error.message);
    return { status: 'error', message: 'Something went wrong. Please try again in a moment.' };
  }

  // 'confirmed' (already subscribed) and 'throttled' (asked again within the
  // window) both mean: the row is in the state the person wants, send nothing.
  if (outcome !== 'send') return { status: 'success', message: CONFIRMATION };

  const resend = createEmailClient();
  if (!resend) {
    // No mail configured on this deployment. The signup is stored and will be
    // confirmable once a key exists, so this is worth a loud log and not a
    // failed submission.
    console.warn('RESEND_API_KEY unset — job alert stored without a confirmation email');
    return { status: 'success', message: CONFIRMATION };
  }

  const mail = confirmationEmail(token);
  const { error: sendError } = await resend.emails.send({
    from: alertsFrom(),
    replyTo: alertsReplyTo(),
    to: parsed.data.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (sendError) {
    // The row exists but its confirmation never arrived. Say so rather than
    // claiming success: the throttle lets them retry in ten minutes, and that
    // retry re-issues the token and sends again.
    console.error('confirmation email failed', sendError.name, sendError.message);
    return {
      status: 'error',
      message: "We couldn't send the confirmation email. Please try again in a few minutes.",
    };
  }

  return { status: 'success', message: CONFIRMATION };
}
