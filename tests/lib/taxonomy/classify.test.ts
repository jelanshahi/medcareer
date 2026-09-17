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

  it('classifies paramedic and EMS roles, including supervisors', () => {
    expect(classify('Primary Care Paramedic')).toBe('paramedics');
    expect(classify('Advanced Care Paramedic - Metro')).toBe('paramedics');
    expect(classify('Emergency Med Responder')).toBe('paramedics');
    expect(classify('Paramedic Supervisor')).toBe('paramedics');
  });

  it('classifies Alberta Health Services title variants', () => {
    expect(classify('Speech Pathologist II')).toBe('allied_health');
    expect(classify('Therapy Assistant')).toBe('allied_health');
    expect(classify('Cardiovascular Perfusionist I')).toBe('allied_health');
    expect(classify('Psychologist II')).toBe('mental_health');
    expect(classify('Nuclear Medicine Technologist I')).toBe('diagnostics_lab');
    expect(classify('Combined Laboratory / X-Ray Technologist I')).toBe('diagnostics_lab');
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

  it('routes department- and institution-qualified titles away from specialties', () => {
    expect(classify('Medical Laboratory Manager')).toBe('management');
    expect(classify('Administrative Assistant, CHEO Research Institute')).toBe('admin_clerical');
    expect(classify('Manager, Emergency Preparedness and Crisis Response')).toBe('management');
  });

  it('treats "physician" used as a modifier as not a physician role', () => {
    expect(classify('Physician Recruitment Coordinator')).not.toBe('physicians');
    expect(classify('Physician Liaison')).not.toBe('physicians');
    expect(classify('Staff Physician, Emergency')).toBe('physicians');
  });

  it('returns null rather than guessing for roles outside the taxonomy', () => {
    expect(classify('Data Scientist, Health Informatics')).toBeNull();
  });
});
