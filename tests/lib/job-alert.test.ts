import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JobAlertSchema, MAX_EMAIL_LENGTH, JOB_ALERT_INITIAL } from '@/lib/schemas/job-alert';
import { confirmationEmail, digestEmail, unsubscribeUrl } from '@/lib/email/templates';

const parse = (email: string, company = '') => JobAlertSchema.safeParse({ email, company });

describe('JobAlertSchema', () => {
  it('accepts an ordinary address', () => {
    expect(parse('nurse@example.com').success).toBe(true);
  });

  it.each(['', 'not-an-email', 'no@tld', 'two@@at.com', 'spaces in@example.com'])(
    'rejects %j',
    (bad) => {
      expect(parse(bad).success).toBe(false);
    },
  );

  // Matches the CHECK constraint on the column, so the form rejects what the
  // database would reject anyway rather than surfacing a write error.
  it('caps the address at the length the column allows', () => {
    expect(MAX_EMAIL_LENGTH).toBe(254);
    expect(parse(`${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`).success).toBe(false);
  });

  it('rejects anything in the honeypot field', () => {
    expect(parse('nurse@example.com', 'AcmeBot').success).toBe(false);
  });

  it('starts idle, so the form renders no message before a submission', () => {
    expect(JOB_ALERT_INITIAL.status).toBe('idle');
  });
});

describe('alert emails', () => {
  const TOKEN = '11111111-2222-3333-4444-555555555555';

  it('puts the confirmation link in both the HTML and the text part', () => {
    const mail = confirmationEmail(TOKEN);
    expect(mail.html).toContain(`/alerts/confirm?token=${TOKEN}`);
    expect(mail.text).toContain(`/alerts/confirm?token=${TOKEN}`);
  });

  const job = {
    slug: 'rn-icu',
    title: 'RN, ICU',
    employer_name: 'Example Health',
    facility_name: null,
    city: 'Hamilton',
    salary_min: 40,
    salary_max: 55,
    salary_period: 'hour',
  };

  it('always carries an unsubscribe link', () => {
    const mail = digestEmail([job], TOKEN);
    expect(mail.html).toContain(unsubscribeUrl(TOKEN));
    expect(mail.text).toContain(unsubscribeUrl(TOKEN));
  });

  it('counts the jobs in the subject', () => {
    expect(digestEmail([job], TOKEN).subject).toContain('1 new healthcare job');
    expect(digestEmail([job, job], TOKEN).subject).toContain('2 new healthcare jobs');
  });

  // Titles and employer names come from scraped feeds. An unescaped one would
  // put attacker-influenced markup straight into a subscriber's mail client.
  it('escapes job text rather than interpolating it raw', () => {
    const nasty = { ...job, title: '<script>alert(1)</script>', employer_name: 'A & B "Health"' };
    const html = digestEmail([nasty], TOKEN).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });
});

describe('job alert server actions', () => {
  const signup = readFileSync(join('app', 'actions', 'job-alerts.ts'), 'utf8');
  const links = readFileSync(join('app', 'actions', 'alert-links.ts'), 'utf8');

  // A "use server" file may only export async functions. Exporting a plain
  // object from one throws at request time while `next build` and tsc both pass
  // — which is exactly how this shipped broken once.
  it.each([
    ['job-alerts.ts', signup],
    ['alert-links.ts', links],
  ])('%s exports nothing but async functions', (_name, src) => {
    const exports = (src.match(/^export .*/gm) ?? []).filter((l) => !l.startsWith('export type'));
    expect(exports).not.toEqual([]);
    for (const line of exports) expect(line).toMatch(/^export\s+async\s+function/);
  });

  // Handing the token back would let anyone submit a stranger's address, read
  // the token from the reply and confirm the subscription themselves — exactly
  // the consent check double opt-in exists to make.
  it('never returns the confirmation token to the caller', () => {
    const returns = signup.match(/return \{[^}]*\}/g) ?? [];
    expect(returns).not.toEqual([]);
    for (const line of returns) expect(line).not.toContain('token');
  });

  it('answers every signup outcome with the same text', () => {
    // 'send', 'confirmed' and 'throttled' must be indistinguishable from
    // outside, or the form reveals whether an address is already subscribed.
    // Comments stripped: the point is what the user is shown, and the source
    // discusses the 'already subscribed' case at length in prose.
    const code = signup.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect((code.match(/message: CONFIRMATION/g) ?? []).length).toBeGreaterThan(1);
    expect(code).not.toMatch(/already (subscribed|on the list)/i);
  });

  it('goes through the RPCs rather than touching the table', () => {
    // anon has no table-level access to job_alerts at all (migration 0009).
    for (const src of [signup, links]) expect(src).not.toContain(".from('job_alerts')");
    expect(signup).toContain("rpc('request_job_alert'");
    expect(links).toContain('confirm_job_alert');
    expect(links).toContain('unsubscribe_job_alert');
  });
});

describe('job_alerts schema', () => {
  const dir = join('supabase', 'migrations');
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

  it('never grants anon a way to read the subscriber list', () => {
    // The anon key ships to every browser, so a select policy here would
    // publish real email addresses.
    expect(sql).not.toMatch(/on job_alerts\s+for select/);
  });

  it('leaves anon no table-level write either', () => {
    // 0007 opened an insert policy; 0009 drops it once signup moved behind
    // request_job_alert, which constrains what a stranger can create.
    expect(sql).toContain('drop policy "anon creates job alerts" on job_alerts');
  });

  it('keeps one subscription per address, case-insensitively', () => {
    expect(sql).toMatch(/create unique index[\s\S]*lower\(email\)/);
  });

  // A SECURITY DEFINER function with a mutable search_path can be tricked into
  // resolving its tables to attacker-controlled ones.
  it('pins search_path on every SECURITY DEFINER function', () => {
    const definers = sql.match(/create function[\s\S]*?\$\$;/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    for (const fn of definers) {
      if (!fn.includes('security definer')) continue;
      expect(fn).toContain("set search_path = ''");
      expect(fn).toMatch(/public\.job_alerts/);
    }
  });

  it('hands execute on those functions to anon only', () => {
    // Scoped to the alert functions: the ingest functions from 0005/0006 are
    // granted to service_role and are none of this feature's business.
    const grants = (sql.match(/grant execute on function [^;]+;/g) ?? []).filter((g) =>
      g.includes('job_alert'),
    );
    expect(grants.length).toBe(3);
    for (const grant of grants) expect(grant.trim().endsWith('to anon;')).toBe(true);
    // Postgres grants EXECUTE to PUBLIC by default; each must be taken back.
    const revokes = (sql.match(/revoke all on function [^;]+;/g) ?? []).filter((r) =>
      r.includes('job_alert'),
    );
    expect(revokes.length).toBe(3);
  });
});
