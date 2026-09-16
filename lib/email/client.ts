import { Resend } from 'resend';
import { SITE } from '@/lib/site';

/** Envelope sender. A verified Resend domain is required for anything but
 *  onboarding@resend.dev, which only delivers to the account owner — so an
 *  unset ALERTS_FROM_EMAIL is a misconfiguration worth failing loudly on
 *  rather than silently dropping every subscriber's mail. */
export function alertsFrom(): string {
  const from = process.env.ALERTS_FROM_EMAIL;
  if (!from) throw new Error('ALERTS_FROM_EMAIL must be set to send job alerts');
  return from;
}

/** Null when no API key is configured, rather than throwing.
 *
 *  Callers decide what that means: the signup action treats it as "capture the
 *  address, skip the email" so the form keeps working on a deployment without
 *  mail configured, while the digest worker treats it as fatal. Building the
 *  client eagerly at module scope would instead break `next build` on any
 *  environment without the key. */
export function createEmailClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export const alertsReplyTo = (): string => SITE.contactEmail;
