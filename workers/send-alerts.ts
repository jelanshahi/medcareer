import { createAdminClient } from '@/lib/db/admin';
import { selectAll } from '@/lib/db/select-all';
import { alertsFrom, alertsReplyTo, createEmailClient } from '@/lib/email/client';
import { digestEmail, unsubscribeUrl, type DigestJob } from '@/lib/email/templates';
import { log } from '@/workers/logger';

const CTX = { sourceId: 'alerts', runId: 'alerts' };

/** Resend accepts at most 100 messages per batch call. */
const BATCH_SIZE = 100;

const JOB_COLUMNS =
  'slug,title,employer_name,facility_name,city,category,salary_min,salary_max,salary_period,posted_at';

type Alert = {
  id: string;
  email: string;
  city: string | null;
  category: string | null;
  unsubscribe_token: string;
  confirmed_at: string | null;
  last_sent_at: string | null;
};

type Job = DigestJob & { category: string | null; posted_at: string };

/** Digest of jobs posted since each subscriber's last send.
 *
 *  Runs with the service-role key, which is why it lives under workers/ — anon
 *  has no access to job_alerts at all, by design (migration 0009). */
async function main() {
  const resend = createEmailClient();
  if (!resend) throw new Error('RESEND_API_KEY must be set to send job alerts');
  const from = alertsFrom();
  const replyTo = alertsReplyTo();

  const admin = createAdminClient();

  // Only confirmed subscriptions. An unconfirmed row is an address somebody
  // typed in, not one that agreed to be mailed.
  const { data: alertRows, error: alertError } = await admin
    .from('job_alerts')
    .select('id,email,city,category,unsubscribe_token,confirmed_at,last_sent_at')
    .eq('is_active', true)
    .not('confirmed_at', 'is', null);
  if (alertError) throw alertError;

  const alerts = (alertRows ?? []) as Alert[];
  if (alerts.length === 0) {
    log(CTX, 'info', 'no confirmed alerts', { sent: 0 });
    return;
  }

  // The cutoff for a subscriber who has never been sent to is their confirmation
  // time, not the beginning of the archive — a first digest must not arrive
  // holding every job ever posted.
  const cutoffFor = (alert: Alert) => alert.last_sent_at ?? alert.confirmed_at ?? new Date(0).toISOString();
  const earliest = alerts.map(cutoffFor).sort()[0];

  // One read covering the widest window any subscriber needs, then matched per
  // subscriber in memory — far cheaper than a round trip each. Paged: unpaged,
  // a window holding more than 1000 jobs would silently drop the oldest, and the
  // watermark would then move past them so they were never sent.
  const jobs = await selectAll<Job>((from, to) =>
    admin
      .from('jobs')
      .select(JOB_COLUMNS)
      .eq('is_active', true)
      .gt('posted_at', earliest)
      .order('posted_at', { ascending: false })
      .order('id')
      .range(from, to),
  );
  const sentAt = new Date().toISOString();

  const matches = (alert: Alert, job: Job) =>
    job.posted_at > cutoffFor(alert) &&
    (alert.city === null || alert.city === job.city) &&
    (alert.category === null || alert.category === job.category);

  const pending = alerts
    .map((alert) => ({ alert, jobs: jobs.filter((job) => matches(alert, job)) }))
    .filter((entry) => entry.jobs.length > 0);

  if (pending.length === 0) {
    log(CTX, 'info', 'nothing new to send', { alerts: alerts.length, jobs: jobs.length, sent: 0 });
    return;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const slice = pending.slice(i, i + BATCH_SIZE);
    const payload = slice.map(({ alert, jobs: theirs }) => {
      const mail = digestEmail(theirs, alert.unsubscribe_token);
      return {
        from,
        replyTo,
        to: alert.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        // RFC 8058: lets a mail client offer its own one-click unsubscribe.
        // Without these, "this is spam" is the only button a reader has, and
        // complaints are what cost a sending domain its reputation.
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl(alert.unsubscribe_token)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };
    });

    const { error } = await resend.batch.send(payload);

    if (error) {
      // Leave last_sent_at alone for this slice: the watermark must only move
      // for mail that actually went out, or a failed batch silently swallows
      // every job it would have announced.
      failed += slice.length;
      log(CTX, 'error', 'batch send failed', { size: slice.length, reason: error.message });
      continue;
    }

    const { error: markError } = await admin
      .from('job_alerts')
      .update({ last_sent_at: sentAt })
      .in('id', slice.map(({ alert }) => alert.id));
    if (markError) throw markError;

    sent += slice.length;
  }

  log(CTX, failed > 0 ? 'warn' : 'info', 'alert digest complete', {
    alerts: alerts.length,
    sent,
    failed,
  });

  // A partial failure must not read as a green run in CI.
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exit(1); });
