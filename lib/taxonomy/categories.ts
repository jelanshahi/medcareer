export const CATEGORIES = [
  'nursing',
  'physicians',
  'allied_health',
  'mental_health',
  'support_care',
  'paramedics',
  'diagnostics_lab',
  'pharmacy',
  'admin_clerical',
  'management',
  'research',
  // Non-clinical roles at the same employers. They were already on the board and
  // searchable, but belonged to no discipline, so no filter could reach them: at
  // 22 Sep 2026 they were most of the uncategorised fifth of the site.
  'food_services',
  'environmental_services',
  'facilities_trades',
  'security',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * The URL form of a category. Keys stay snake_case everywhere they are stored (jobs,
 * job_alerts), but URLs use hyphens: search engines read a hyphen as a word break and an
 * underscore as part of the word, so "allied-health" matches "allied health" searches and
 * "allied_health" does not.
 */
export function categorySlug(category: Category): string {
  return category.replace(/_/g, '-');
}

/** Accepts either URL form — the current hyphenated one or the legacy underscore one —
 * and returns the category key, or null for anything that is not a category. */
export function categoryFromSlug(value: string): Category | null {
  const key = value.trim().toLowerCase().replace(/-/g, '_');
  return (CATEGORIES as readonly string[]).includes(key) ? (key as Category) : null;
}

/** User-facing labels. Job seekers do not say "support_care". */
export const CATEGORY_LABELS: Record<Category, string> = {
  nursing: 'Nursing',
  physicians: 'Physicians',
  allied_health: 'Allied health',
  mental_health: 'Mental health',
  support_care: 'Support care (PSW/HCA)',
  paramedics: 'Paramedics and EMS',
  diagnostics_lab: 'Lab and imaging',
  pharmacy: 'Pharmacy',
  admin_clerical: 'Admin and clerical',
  management: 'Management',
  research: 'Research',
  food_services: 'Food services',
  // Hospitals say "environmental services"; the people doing the job and searching
  // for it mostly say housekeeping. Same parenthetical style as "Support care (PSW/HCA)".
  environmental_services: 'Environmental services (housekeeping)',
  facilities_trades: 'Facilities and trades',
  security: 'Security',
};
