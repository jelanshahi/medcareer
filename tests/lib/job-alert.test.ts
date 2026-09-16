import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JobAlertSchema, MAX_EMAIL_LENGTH, JOB_ALERT_INITIAL } from '@/lib/schemas/job-alert';

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
    const long = `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`;
    expect(parse(long).success).toBe(false);
  });

  it('rejects anything in the honeypot field', () => {
    expect(parse('nurse@example.com', 'AcmeBot').success).toBe(false);
  });

  it('starts idle, so the form renders no message before a submission', () => {
    expect(JOB_ALERT_INITIAL.status).toBe('idle');
  });
});

describe('job alert action module', () => {
  const src = readFileSync(join('app', 'actions', 'job-alerts.ts'), 'utf8');

  // A "use server" file may only export async functions. Exporting a plain
  // object from it throws at request time while `next build` and tsc both pass
  // — which is exactly how this shipped broken the first time.
  it('exports nothing but async functions', () => {
    const exports = (src.match(/^export .*/gm) ?? []).filter((l) => !l.startsWith('export type'));
    expect(exports).not.toEqual([]);
    for (const line of exports) {
      expect(line).toMatch(/^export\s+async\s+function/);
    }
  });

  it('never asks for the inserted row back', () => {
    // anon holds insert but no select on job_alerts, so a chained .select()
    // would fail the whole statement.
    expect(src).toContain(".from('job_alerts')");
    expect(src).not.toMatch(/\.insert\([^)]*\)\s*\.select\(/);
  });

  it('answers a duplicate signup exactly as it answers a new one', () => {
    // Otherwise the public form becomes an oracle for whether an address is
    // already subscribed.
    expect(src).toContain('23505');
    const confirmations = src.match(/CONFIRMATION/g) ?? [];
    expect(confirmations.length).toBeGreaterThan(1);
  });
});

describe('job_alerts migration', () => {
  const sql = readFileSync(join('supabase', 'migrations', '0007_job_alerts.sql'), 'utf8');

  it('enables RLS and grants anon insert only', () => {
    expect(sql).toMatch(/alter table job_alerts\s+enable row level security/);
    expect(sql).toMatch(/for insert\s+to anon/);
    // No select policy: the anon key ships to every browser, so a readable
    // table would publish the subscriber list.
    expect(sql).not.toMatch(/for select\s+to anon/);
  });

  it('keeps one subscription per address, case-insensitively', () => {
    expect(sql).toMatch(/create unique index[\s\S]*lower\(email\)/);
  });
});
