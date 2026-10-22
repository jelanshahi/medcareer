import { describe, it, expect } from 'vitest';
import { ROLES, roleBySlug } from '@/lib/taxonomy/roles';
import { FEATURED_ROLES, roleAliasTarget, roleFaqs, roleHeading, roleTitle } from '@/lib/taxonomy/role-content';

describe('role search content', () => {
  it('heads the pages with what people search for', () => {
    expect(roleHeading(roleBySlug('personal-support-worker')!, 'Canada')).toBe('PSW jobs in Canada');
    expect(roleHeading(roleBySlug('registered-nurse')!, 'Ontario')).toBe('Registered nurse (RN) jobs in Ontario');
    expect(roleTitle(roleBySlug('personal-support-worker')!, 'Canada')).toContain('health care aide');
  });

  it('falls back to the label for roles without hand-written content', () => {
    expect(roleHeading(roleBySlug('pharmacist')!, 'Alberta')).toBe('Pharmacist jobs in Alberta');
    expect(roleFaqs(roleBySlug('pharmacist')!).length).toBeGreaterThan(0);
  });

  it('maps common abbreviations to their role page', () => {
    expect(roleAliasTarget('psw')).toBe('personal-support-worker');
    expect(roleAliasTarget('HCA')).toBe('personal-support-worker');
    expect(roleAliasTarget('care-aide')).toBe('personal-support-worker');
    expect(roleAliasTarget('rn')).toBe('registered-nurse');
    expect(roleAliasTarget('lpn')).toBe('practical-nurse');
    expect(roleAliasTarget('rpn')).toBe('practical-nurse');
    expect(roleAliasTarget('registered-nurse')).toBeNull();
  });

  it('never shadows a real role slug with an alias', () => {
    for (const role of ROLES) expect(roleAliasTarget(role.slug)).toBeNull();
  });

  it('only features roles that exist', () => {
    expect(FEATURED_ROLES.every(Boolean)).toBe(true);
  });
});
