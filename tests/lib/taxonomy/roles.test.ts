import { describe, it, expect } from 'vitest';
import { ROLES, roleBySlug, roleOf } from '@/lib/taxonomy/roles';

const slugOf = (title: string) => roleOf(title)?.slug ?? null;

describe('roleOf', () => {
  it('reads the nursing designations apart', () => {
    expect(slugOf('Nurse A - Registered Nurse - General Duty Nurse')).toBe('registered-nurse');
    expect(slugOf('RN - Emergency')).toBe('registered-nurse');
    expect(slugOf('RPN - Complex Continuing Care')).toBe('practical-nurse');
    expect(slugOf('Licensed Practical Nurse')).toBe('practical-nurse');
    expect(slugOf('Nurse A - Registered Nurse - Registered Psych Nurse')).toBe('registered-psychiatric-nurse');
    expect(slugOf('Nurse Practitioner, Primary Care')).toBe('nurse-practitioner');
  });

  it('groups the provincial names for a PSW', () => {
    expect(slugOf('Continuing Care Assistant')).toBe('personal-support-worker');
    expect(slugOf('Health Care Aide - Permanent Part Time Days')).toBe('personal-support-worker');
    expect(slugOf('PSW - Nights')).toBe('personal-support-worker');
  });

  it('tells pharmacists from technicians', () => {
    expect(slugOf('Pharmacy Technician')).toBe('pharmacy-technician');
    expect(slugOf('Pharm D Degree')).toBe('pharmacist');
    expect(slugOf('Clinical Pharmacist')).toBe('pharmacist');
  });

  it('never files a leadership title under a clinical role', () => {
    expect(slugOf('Nurse Manager, Medicine')).toBeNull();
    expect(slugOf('Director, Pharmacy Services')).toBeNull();
  });

  it('leaves unknown titles alone', () => {
    expect(slugOf('Software Developer')).toBeNull();
  });

  it('keeps an aide out of the dietitian role', () => {
    expect(slugOf('Aide dietetiste')).not.toBe('dietitian');
  });
});

describe('ROLES', () => {
  it('has unique, URL-safe slugs', () => {
    const slugs = ROLES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('round-trips through roleBySlug', () => {
    for (const r of ROLES) expect(roleBySlug(r.slug)).toBe(r);
    expect(roleBySlug('astronaut')).toBeNull();
  });
});
