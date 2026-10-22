/** Every canonical, sitemap <loc>, Open Graph URL and JSON-LD url is built from this, so it
 * must be the exact origin the site answers on. Production once carried
 * "http://medcareer.ca", which 308s to https and then to www: every canonical pointed at a
 * redirect. Anything but a local host is forced to https here and any trailing slash is
 * dropped; the host itself (www or not) still has to be right in the env var. */
export function normalizeSiteUrl(raw: string): string {
  const url = new URL(raw.trim());
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost');
  if (!local) url.protocol = 'https:';
  return url.origin;
}

const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');

// Deliberately NOT a NEXT_PUBLIC_* var: this is a real person's address, and a
// NEXT_PUBLIC_ prefix would inline it into the client bundle for scrapers to harvest.
// Only server components and workers/ need it.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? 'hello@medcareer.invalid';

export const SITE = {
  name: 'MedCareer',
  tagline: 'Healthcare jobs across Canada',
  url: SITE_URL,
  contactUrl: `${SITE_URL}/about`,
  contactEmail: CONTACT_EMAIL,
  // Carries a mailto as well as the URL: until the site is deployed, SITE_URL is
  // localhost, and a contact a site operator cannot reach defeats the whole point
  // of identifying the crawler.
  userAgent: `MedCareerBot/0.1 (+${SITE_URL}/about; mailto:${CONTACT_EMAIL})`,
} as const;
