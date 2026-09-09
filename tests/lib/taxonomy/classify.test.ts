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

  it('routes department-qualified management titles to management, not the specialty', () => {
    expect(classify('Manager, Diagnostic Imaging')).toBe('management');
    expect(classify('Laboratory Manager')).toBe('management');
    expect(classify('Manager, Clinical Research')).toBe('management');
  });

  it('routes department-qualified clerical titles to admin, not the specialty', () => {
    expect(classify('Secretary, Pharmacy')).toBe('admin_clerical');
    expect(classify('Unit Clerk, Diagnostic Imaging')).toBe('admin_clerical');
  });

  it('treats a physician assistant as allied health, not a physician', () => {
    expect(classify('Physician Assistant')).toBe('allied_health');
  });

  it('routes social workers by context, not by profession alone', () => {
    expect(classify('Social Worker, Oncology')).toBe('allied_health');
    expect(classify('Social Worker, Acute Mental Health')).toBe('mental_health');
  });

  it('keeps nursing leadership in nursing, where nurses look for it', () => {
    expect(classify('Nurse Manager')).toBe('nursing');
  });
});
