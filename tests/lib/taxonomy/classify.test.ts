import { describe, it, expect } from 'vitest';
import { classify } from '@/lib/taxonomy/classify';

describe('classify', () => {
  it('classifies nursing titles, including abbreviations', () => {
    expect(classify('Registered Nurse - Hemodialysis Unit - CP2 (GEN)')).toBe('nursing');
    expect(classify('RN - Emergency (Req #12345)')).toBe('nursing');
    expect(classify('Registered Practical Nurse - 3MBW CCC (CEN)')).toBe('nursing');
  });

  it('classifies allied health', () => {
    expect(classify('Occupational Therapist - ACTT')).toBe('allied_health');
  });

  it('prefers mental health over allied health for psychiatric roles', () => {
    expect(classify('Social Worker, Acute Mental Health')).toBe('mental_health');
  });

  it('classifies support care', () => {
    expect(classify('PSW - Nights')).toBe('support_care');
  });

  it('classifies admin and clerical', () => {
    expect(classify('Unit Secretary, Diabetes and Pediatric Ambulatory Clinics (CUPE) - Casual'))
      .toBe('admin_clerical');
  });

  it('classifies research', () => {
    expect(classify('Postdoctoral Fellow | Temporary Full Time (1.0 FTE) | CHEO Research Institute'))
      .toBe('research');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(classify('Weekend Switchboard Operator, Information Services')).toBeNull();
  });
});
