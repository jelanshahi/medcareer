const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

// Deliberately NOT a NEXT_PUBLIC_* var: this is a real person's address, and a
// NEXT_PUBLIC_ prefix would inline it into the client bundle for scrapers to harvest.
// Only server components and workers/ need it.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? 'hello@careportal.invalid';

export const SITE = {
  name: 'CarePortal',
  tagline: 'Healthcare jobs across Ontario',
  url: SITE_URL,
  contactUrl: `${SITE_URL}/about`,
  contactEmail: CONTACT_EMAIL,
  // Carries a mailto as well as the URL: until the site is deployed, SITE_URL is
  // localhost, and a contact a site operator cannot reach defeats the whole point
  // of identifying the crawler.
  userAgent: `CarePortalBot/0.1 (+${SITE_URL}/about; mailto:${CONTACT_EMAIL})`,
} as const;
