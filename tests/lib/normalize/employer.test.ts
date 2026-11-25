import { describe, it, expect } from 'vitest';
import { cleanEmployerName } from '@/lib/normalize/employer';

describe('cleanEmployerName', () => {
  it('strips template brackets the employer left in the posting', () => {
    expect(cleanEmployerName('[[Golden Links Lodge]]')).toBe('Golden Links Lodge');
  });

  it('counts the facility spelling of Golden Links Lodge as the same employer', () => {
    expect(cleanEmployerName('Golden Links Lodge Personal Care Home')).toBe('Golden Links Lodge');
    expect(cleanEmployerName('[[Golden Links Lodge Personal Care Home]]')).toBe('Golden Links Lodge');
  });

  it('tidies whitespace', () => {
    expect(cleanEmployerName('  Golden   Links Lodge ')).toBe('Golden Links Lodge');
  });

  it('leaves look-alike but different employers apart', () => {
    // Northern Health is British Columbia's authority; Northern Health Region is Manitoba's.
    expect(cleanEmployerName('Northern Health')).toBe('Northern Health');
    expect(cleanEmployerName('Northern Health Region')).toBe('Northern Health Region');
    expect(cleanEmployerName('Park Manor Personal Care Home')).toBe('Park Manor Personal Care Home');
  });

  it('keeps the original when stripping would leave nothing', () => {
    expect(cleanEmployerName('[[]]')).toBe('[[]]');
  });
});
