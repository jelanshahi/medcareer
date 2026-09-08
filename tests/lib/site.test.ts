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
});
