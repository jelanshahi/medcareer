import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/lib/normalize/title';

describe('normalizeTitle', () => {
  it('strips requisition noise and expands abbreviations', () => {
    expect(normalizeTitle('RN - Emergency (Req #12345)')).toBe('registered nurse emergency');
  });

  it('strips parenthesised site codes', () => {
    expect(normalizeTitle('Registered Nurse - Hemodialysis Unit - CP2 (GEN)'))
      .toBe('registered nurse hemodialysis unit cp2');
  });

  it('expands support-care abbreviations', () => {
    expect(normalizeTitle('PSW - Nights')).toBe('personal support worker nights');
  });

  it('strips accents', () => {
    expect(normalizeTitle('Registered Nurse — Médecine')).toBe('registered nurse medecine');
  });

  it('collapses whitespace and punctuation', () => {
    expect(normalizeTitle('  Unit   Secretary,,, Clinics  ')).toBe('unit secretary clinics');
  });
});
