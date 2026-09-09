import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { fingerprint } from '@/lib/normalize/fingerprint';

const base = { title: 'RN - Emergency (Req #12345)', employerKey: 'shn', city: 'Toronto', province: 'ON' };

describe('fingerprint', () => {
  it('returns a 64-char hex digest', () => {
    expect(fingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches across differently formatted titles for the same job', () => {
    const other = { ...base, title: 'Registered Nurse, Emergency (Req #99999)' };
    expect(fingerprint(other)).toBe(fingerprint(base));
  });

  it('is insensitive to employer and city casing', () => {
    expect(fingerprint({ ...base, employerKey: 'SHN', city: 'toronto' })).toBe(fingerprint(base));
  });

  it('differs when the city differs', () => {
    expect(fingerprint({ ...base, city: 'Ottawa' })).not.toBe(fingerprint(base));
  });

  it('treats accented and unaccented city spellings as the same city', () => {
    expect(fingerprint({ ...base, city: 'Montréal' }))
      .toBe(fingerprint({ ...base, city: 'Montreal' }));
  });

  it('hashes the documented preimage: normalizedTitle|employerKey|city|province', () => {
    const expected = createHash('sha256')
      .update(['registered nurse emergency', 'shn', 'toronto', 'ON'].join('|'))
      .digest('hex');
    expect(fingerprint(base)).toBe(expected);
  });
});
