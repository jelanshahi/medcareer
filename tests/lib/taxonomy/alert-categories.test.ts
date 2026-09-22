import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/taxonomy/categories';

/**
 * request_job_alert, a Postgres function, keeps its own copy of the category list, and
 * TypeScript cannot see it. It does not reject a category missing from that copy — it
 * quietly downgrades it to "all disciplines". So adding a category in code alone would
 * subscribe anyone who picked it to every discipline, with no error anywhere. That nearly
 * shipped with the four non-clinical categories (22 Sep 2026); this test is what would
 * have caught it.
 *
 * It reads the newest migration that defines the function, since that is the definition
 * the database runs.
 */
const MIGRATIONS = 'supabase/migrations';

function liveAlertCategories(): string[] {
  const defining = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => /function\s+public\.request_job_alert\s*\(/.test(readFileSync(join(MIGRATIONS, f), 'utf8')));
  const newest = defining.at(-1);
  if (!newest) throw new Error('no migration defines request_job_alert');

  const sql = readFileSync(join(MIGRATIONS, newest), 'utf8');
  const list = sql.match(/v_category\s+not\s+in\s*\(([^)]*)\)/)?.[1];
  if (!list) throw new Error(`${newest} has no "v_category not in (...)" list`);
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('request_job_alert category list', () => {
  it('accepts exactly the categories the site offers', () => {
    // Sorted so the failure message lists the missing or extra names side by side.
    expect([...liveAlertCategories()].sort()).toEqual([...CATEGORIES].sort());
  });
});
