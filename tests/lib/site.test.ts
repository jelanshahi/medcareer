import { describe, it, expect } from 'vitest';
import { SITE } from '@/lib/site';

describe('site config', () => {
  it('derives the contact URL from the site URL', () => {
    expect(SITE.contactUrl).toBe(`${SITE.url}/about`);
  });

  it('exposes a User-Agent that carries the contact URL', () => {
    expect(SITE.userAgent).toContain(SITE.contactUrl);
    expect(SITE.userAgent).toMatch(/^\S+\/\d/);
  });

  it('carries a reachable mailto contact, since the site URL may be localhost', () => {
    expect(SITE.userAgent).toContain(`mailto:${SITE.contactEmail}`);
    expect(SITE.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
