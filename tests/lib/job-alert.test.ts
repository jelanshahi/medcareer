import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JobAlertSchema, MAX_EMAIL_LENGTH, MAX_CITY_LENGTH, JOB_ALERT_INITIAL } from '@/lib/schemas/job-alert';
import { confirmationEmail, digestEmail, unsubscribeUrl } from '@/lib/email/templates';
import { describeAlertCriteria } from '@/lib/alerts/describe';
import { CATEGORIES } from '@/lib/taxonomy/categories';

const parse = (input: { email?: string; city?: string; category?: string; company?: string }) =>
  JobAlertSchema.safeParse({ email: 'nurse@example.com', city: '', category: '', company: '', ...input });

describe('JobAlertSchema', () => {
  it('accepts an ordinary address', () => {
    expect(parse({}).success).toBe(true);
  });

  it.each(['', 'not-an-email', 'no@tld', 'two@@at.com', 'spaces in@example.com'])(
    'rejects %j as an email',
    (bad) => {
      expect(parse({ email: bad }).success).toBe(false);
    },
  );

  // Matches the CHECK constraint on the column, so the form rejects what the
  // database would reject anyway rather than surfacing a write error.
  it('caps the address at the length the column allows', () => {
    expect(MAX_EMAIL_LENGTH).toBe(254);
    expect(parse({ email: `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com` }).success).toBe(false);
  });

  it('rejects anything in the honeypot field', () => {
    expect(parse({ company: 'AcmeBot' }).success).toBe(false);
  });

  it('starts idle, so the form renders no message before a submission', () => {
    expect(JOB_ALERT_INITIAL.status).toBe('idle');
  });

  it('accepts every real discipline', () => {
    for (const c of CATEGORIES) expect(parse({ category: c }).success).toBe(true);
  });

  it('rejects a discipline outside the taxonomy', () => {
    // The <select> only ever offers CATEGORIES, so this path is really about
    // the RPC's own open, directly-callable endpoint (advisories 0028/0029) —
    // the app layer should refuse what a hand-crafted request sends just as
    // firmly as the database function itself does (migration 0013).
    expect(parse({ category: 'wizardry' }).success).toBe(false);
  });

  it('treats an empty select as "no preference", not a value', () => {
    const result = parse({ city: '', category: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.city).toBeUndefined();
      expect(result.data.category).toBeUndefined();
    }
  });

  it('caps city length', () => {
    expect(parse({ city: 'a'.repeat(MAX_CITY_LENGTH) }).success).toBe(true);
    expect(parse({ city: 'a'.repeat(MAX_CITY_LENGTH + 1) }).success).toBe(false);
  });
});

describe('describeAlertCriteria', () => {
  it('describes every combination in plain language', () => {
    expect(describeAlertCriteria(null, null)).toBe('All new healthcare jobs');
    expect(describeAlertCriteria('Hamilton', null)).toBe('All roles in Hamilton');
    expect(describeAlertCriteria(null, 'nursing')).toBe('Nursing jobs anywhere');
    expect(describeAlertCriteria('Hamilton', 'nursing')).toBe('Nursing jobs in Hamilton');
  });

  it('falls back gracefully for an unrecognised category rather than throwing', () => {
    // Reachable if a stored row predates a taxonomy change, or the directly
    // callable RPC let something odd through before this description ever
    // sees it — describing it as "no discipline preference" is safer than a
    // crash while building an email.
    expect(describeAlertCriteria(null, 'not-a-real-category')).toBe('All new healthcare jobs');
  });
});

describe('alert emails', () => {
  const TOKEN = '11111111-2222-3333-4444-555555555555';
  const CRITERIA = 'Nursing jobs in Hamilton';

  it('puts the confirmation link in both parts, and states the criteria', () => {
    const mail = confirmationEmail(TOKEN, CRITERIA);
    expect(mail.html).toContain(`/alerts/confirm?token=${TOKEN}`);
    expect(mail.text).toContain(`/alerts/confirm?token=${TOKEN}`);
    expect(mail.html).toContain(CRITERIA);
    expect(mail.text).toContain(CRITERIA);
  });

  // criteria is a plain-language string built by describeAlertCriteria, not
  // scraped job data, but it is still assembled partly from a category label
  // constant and there is no reason to trust any HTML-bearing string blindly.
  it('escapes the criteria string in the confirmation email', () => {
    const html = confirmationEmail(TOKEN, '<b>x</b>').html;
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;');
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
    const mail = digestEmail([job], TOKEN, CRITERIA);
    expect(mail.html).toContain(unsubscribeUrl(TOKEN));
    expect(mail.text).toContain(unsubscribeUrl(TOKEN));
  });

  it('counts the jobs and states the criteria in the subject', () => {
    expect(digestEmail([job], TOKEN, CRITERIA).subject).toContain('1 new job');
    expect(digestEmail([job, job], TOKEN, CRITERIA).subject).toContain('2 new jobs');
    expect(digestEmail([job], TOKEN, CRITERIA).subject).toContain(CRITERIA);
  });

  // Titles and employer names come from scraped feeds. An unescaped one would
  // put attacker-influenced markup straight into a subscriber's mail client.
  it('escapes job text rather than interpolating it raw', () => {
    const nasty = { ...job, title: '<script>alert(1)</script>', employer_name: 'A & B "Health"' };
    const html = digestEmail([nasty], TOKEN, CRITERIA).html;
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

  it('passes the criteria fields through to the RPC', () => {
    expect(signup).toContain('p_city');
    expect(signup).toContain('p_category');
  });
});

describe('job_alerts schema', () => {
  const dir = join('supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  const sql = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

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

  it('hands execute on the alert functions to anon only', () => {
    // Migrations are an append-only log: 0013 drops and replaces the 2-arg
    // request_job_alert from 0009 with a 4-arg version, so 0009's original
    // grant line for request_job_alert(text, uuid) still appears in history
    // even though that exact function no longer exists on the live database.
    // That is one grant for a since-dropped signature plus three for what is
    // live today (confirm_job_alert, unsubscribe_job_alert, the current
    // request_job_alert) — four lines in the text, three functions in reality.
    const grants = (sql.match(/grant execute on function [^;]+;/g) ?? []).filter((g) =>
      g.includes('job_alert'),
    );
    expect(grants.length).toBe(4);
    for (const grant of grants) expect(grant.trim().endsWith('to anon;')).toBe(true);
    // Postgres grants EXECUTE to PUBLIC by default; each must be taken back.
    const revokes = (sql.match(/revoke all on function [^;]+;/g) ?? []).filter((r) =>
      r.includes('job_alert'),
    );
    expect(revokes.length).toBe(4);
  });

  it('drops the old signature before creating the new one, rather than overloading it', () => {
    // Postgres tells functions apart by argument types, so adding parameters
    // without dropping the old signature first would leave both the 2-arg and
    // 4-arg versions callable — and PostgREST would have no reliable way to
    // pick one when the client calls by name.
    const criteriaMigration = readFileSync(join(dir, '0013_job_alert_criteria.sql'), 'utf8');
    expect(criteriaMigration).toContain('drop function public.request_job_alert(text, uuid)');
    expect(criteriaMigration).toMatch(
      /create function public\.request_job_alert\(\s*p_email text,\s*p_token uuid,\s*p_city text default null,\s*p_category text default null\s*\)/,
    );
  });

  it('matches NULL to NULL in the criteria lookup, so an all-roles-all-cities signup does not insert a duplicate every time', () => {
    const criteriaMigration = readFileSync(join(dir, '0013_job_alert_criteria.sql'), 'utf8');
    expect(criteriaMigration).toContain('is not distinct from');
  });
});
