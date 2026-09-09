export const CATEGORIES = [
  'nursing',
  'physicians',
  'allied_health',
  'mental_health',
  'support_care',
  'diagnostics_lab',
  'pharmacy',
  'admin_clerical',
  'management',
  'research',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** User-facing labels. Job seekers do not say "support_care". */
export const CATEGORY_LABELS: Record<Category, string> = {
  nursing: 'Nursing',
  physicians: 'Physicians',
  allied_health: 'Allied health',
  mental_health: 'Mental health',
  support_care: 'Support care (PSW/HCA)',
  diagnostics_lab: 'Lab and imaging',
  pharmacy: 'Pharmacy',
  admin_clerical: 'Admin and clerical',
  management: 'Management',
  research: 'Research',
};
