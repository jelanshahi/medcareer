import { CATEGORY_LABELS, type Category } from '@/lib/taxonomy/categories';

/** Plain-language description of an alert's criteria, for the confirmation
 *  and digest emails — "Nursing jobs in Hamilton", "All roles in Ottawa",
 *  "Nursing jobs anywhere", "All new healthcare jobs". Shared by both emails
 *  (lib/email/templates.ts) so the two never describe the same subscription
 *  two different ways. */
export function describeAlertCriteria(city: string | null, category: string | null): string {
  const role = category && category in CATEGORY_LABELS ? `${CATEGORY_LABELS[category as Category]} jobs` : null;

  if (role && city) return `${role} in ${city}`;
  if (role) return `${role} anywhere`;
  if (city) return `All roles in ${city}`;
  return 'All new healthcare jobs';
}
