import { describe, it, expect } from 'vitest';
import { normalizeTitle } from '@/lib/normalize/title';

describe('normalizeTitle', () => {
  it('strips requisition noise and expands abbreviations', () => {
    expect(normalizeTitle('RN - Emergency (Req #12345)')).toBe('registered nurse emergency');
  });

  it('keeps parenthesised content, since parentheses also carry seniority', () => {
    expect(normalizeTitle('Registered Nurse - Hemodialysis Unit - CP2 (GEN)'))
      .toBe('registered nurse hemodialysis unit cp2 gen');
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

  it('leaves ambiguous two-letter tokens alone, since PT and OT mean part time and overtime in titles', () => {
    expect(normalizeTitle('RN PT Days')).toBe('registered nurse pt days');
    expect(normalizeTitle('RPN OT Weekends')).toBe('registered practical nurse ot weekends');
  });

  it('preserves seniority, which distinguishes real jobs at different pay grades', () => {
    expect(normalizeTitle('Senior RN - Emergency')).toBe('senior registered nurse emergency');
    expect(normalizeTitle('RN - Emergency (Senior)'))
      .not.toBe(normalizeTitle('RN - Emergency'));
  });
});
