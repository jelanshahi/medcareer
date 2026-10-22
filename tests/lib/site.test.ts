import { describe, it, expect } from 'vitest';
import { SITE, normalizeSiteUrl } from '@/lib/site';

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

describe('normalizeSiteUrl', () => {
  it('forces https on a public host and drops the trailing slash', () => {
    expect(normalizeSiteUrl('http://medcareer.ca/')).toBe('https://medcareer.ca');
    expect(normalizeSiteUrl(' https://www.medcareer.ca ')).toBe('https://www.medcareer.ca');
  });

  it('leaves local development hosts on http', () => {
    expect(normalizeSiteUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeSiteUrl('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
  });
});
