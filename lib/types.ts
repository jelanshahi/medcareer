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
  /**
   * When the list endpoint reports how old a posting is. Lets the runner skip a posting
   * past the age cutoff without fetching its detail page. Sources whose lists carry no
   * date leave it undefined and are filtered after hydration instead.
   */
  postedAt?: Date;
  /**
   * Values the list page states that the posting itself may not. The shared Manitoba site
   * is the case: the employing organization and the employment status are columns in the
   * search results, and many postings state neither in their own text. `hydrate` folds
   * these into the record it returns, so `normalize` stays pure.
   */
  listFields?: Record<string, string>;
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
