import { SITE } from '@/lib/site';
import { employerLine, formatSalary } from '@/lib/format';

export type DigestJob = {
  slug: string;
  title: string;
  employer_name: string;
  facility_name: string | null;
  city: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
};

/** Every value below reaches the HTML from scraped employer feeds, so all of it
 *  is escaped. An unescaped job title containing a stray `<` is enough to break
 *  the layout, and these strings are not ours to trust. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const confirmUrl = (token: string) => `${SITE.url}/alerts/confirm?token=${token}`;
export const unsubscribeUrl = (token: string) => `${SITE.url}/alerts/unsubscribe?token=${token}`;

/** Inline styles and table-free simple blocks on purpose: Gmail strips <style>
 *  blocks and Outlook ignores most modern CSS, so anything structural has to
 *  survive being flattened. */
const SHELL = (body: string, footer: string) => `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px">
<div style="font-size:19px;font-weight:600;letter-spacing:-0.02em;margin-bottom:24px">${SITE.name}</div>
${body}
</div>
<div style="max-width:560px;margin:16px auto 0;font-size:13px;line-height:1.5;color:#6e6e73;text-align:center">${footer}</div>
</body></html>`;

const BUTTON = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#0F5C4A;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:17px;font-weight:600">${label}</a>`;

export function confirmationEmail(token: string) {
  const url = confirmUrl(token);
  return {
    subject: `Confirm your ${SITE.name} job alert`,
    html: SHELL(
      `<p style="font-size:17px;line-height:1.5;margin:0 0 20px">Confirm this address and we'll email you when new healthcare jobs are posted in Ontario.</p>
       <p style="margin:0 0 24px">${BUTTON(url, 'Confirm my alert')}</p>
       <p style="font-size:13px;line-height:1.5;color:#6e6e73;margin:0">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all">${url}</span></p>`,
      `You received this because someone entered this address at ${SITE.url}.<br>No alerts are sent until it is confirmed — ignore this email and nothing further happens.`,
    ),
    text: [
      `Confirm this address and we'll email you when new healthcare jobs are posted in Ontario.`,
      ``,
      url,
      ``,
      `You received this because someone entered this address at ${SITE.url}.`,
      `No alerts are sent until it is confirmed — ignore this email and nothing further happens.`,
    ].join('\n'),
  };
}

export function digestEmail(jobs: DigestJob[], token: string) {
  const unsubscribe = unsubscribeUrl(token);
  const count = jobs.length;
  const heading = count === 1 ? '1 new healthcare job' : `${count} new healthcare jobs`;

  const rows = jobs
    .map((job) => {
      const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
      const meta = [employerLine(job.employer_name, job.facility_name, job.city), job.city, salary]
        .filter(Boolean)
        .join(' · ');
      return `<div style="padding:16px 0;border-top:1px solid #ececf0">
        <a href="${SITE.url}/jobs/${esc(job.slug)}" style="font-size:17px;font-weight:600;color:#1d1d1f;text-decoration:none">${esc(job.title)}</a>
        <div style="font-size:15px;color:#6e6e73;margin-top:4px">${esc(meta)}</div>
      </div>`;
    })
    .join('');

  return {
    subject: `${heading} in Ontario`,
    html: SHELL(
      `<p style="font-size:17px;line-height:1.5;margin:0 0 4px">${heading} since your last alert.</p>
       ${rows}
       <p style="margin:24px 0 0">${BUTTON(`${SITE.url}/jobs`, 'See all open jobs')}</p>`,
      `You're getting this because you created a job alert at ${SITE.url}.<br><a href="${unsubscribe}" style="color:#6e6e73">Unsubscribe</a>`,
    ),
    text: [
      `${heading} since your last alert.`,
      ``,
      ...jobs.map((job) => {
        const salary = formatSalary(job.salary_min, job.salary_max, job.salary_period);
        const meta = [employerLine(job.employer_name, job.facility_name, job.city), job.city, salary]
          .filter(Boolean)
          .join(' · ');
        return `${job.title}\n${meta}\n${SITE.url}/jobs/${job.slug}\n`;
      }),
      `Unsubscribe: ${unsubscribe}`,
    ].join('\n'),
  };
}
