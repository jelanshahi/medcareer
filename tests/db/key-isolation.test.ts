import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('service role key isolation', () => {
  it('no file under app/, components/, or lib/ (other than the admin client itself) references the admin client or the service role key', () => {
    const adminClientPath = join('lib', 'db', 'admin.ts');
    const offenders = ['app', 'components', 'lib']
      .flatMap(walk)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => f !== adminClientPath)
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return src.includes('db/admin') || src.includes('SUPABASE_SERVICE_ROLE_KEY');
      });
    expect(offenders).toEqual([]);
  });
});
