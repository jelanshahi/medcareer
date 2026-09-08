const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const SITE = {
  name: 'CarePortal',
  tagline: 'Healthcare jobs across Ontario',
  url: SITE_URL,
  contactUrl: `${SITE_URL}/about`,
  contactEmail: 'hello@careportal.invalid',
  userAgent: `CarePortalBot/0.1 (+${SITE_URL}/about)`,
} as const;
