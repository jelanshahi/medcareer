export const PROVINCE_CODES = ['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const EMPLOYMENT_TYPES = ['full_time','part_time','casual','temporary','contract'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const SHIFT_TYPES = ['day','evening','night','rotating','weekend'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

/** Thin record from a list endpoint, before hydration. */
export type JobStub = {
  sourceJobId: string;
  externalPath: string;
  title: string;
  locationsText: string;
};

/** The single shape the rest of the system knows about. */
export type NormalizedPosting = {
  sourceId: string;
  sourceJobId: string;
  sourceUrl: string;
  title: string;
  employerName: string;
  facilityName?: string;
  description: string;
  city: string;
  province: ProvinceCode;
  postedAt: Date;
  closesAt?: Date;
  employmentType?: EmploymentType;
  shiftType?: ShiftType;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'year';
  nocCode?: string;
  applyUrl: string;
};
