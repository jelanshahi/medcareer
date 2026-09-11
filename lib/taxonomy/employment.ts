export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'casual',
  'temporary',
  'contract',
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** User-facing labels. Job seekers do not say "full_time". */
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  casual: 'Casual',
  temporary: 'Temporary',
  contract: 'Contract',
};
