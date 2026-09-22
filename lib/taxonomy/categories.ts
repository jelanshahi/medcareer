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
