import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode, ShiftType } from '@/lib/types';

export type WorkdayEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { tenant: string; site: string; host: string; parseDescriptionHeader: boolean };
};

const ListItemSchema = z.object({
  title: z.string(),
  externalPath: z.string().startsWith('/job/'),
  locationsText: z.string().default(''),
  bulletFields: z.array(z.string()).default([]),
});

const ListSchema = z.object({ total: z.number(), jobPostings: z.array(ListItemSchema) });

const DetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string(),
    location: z.string().optional(),
    startDate: z.string(),
    timeType: z.string().optional(),
    jobReqId: z.string(),
    externalUrl: z.string().url(),
  }),
  hiringOrganization: z.object({ name: z.string() }).optional(),
});

export function parseWorkdayList(payload: unknown): { total: number; stubs: JobStub[] } {
  const parsed = ListSchema.parse(payload);
  return {
    total: parsed.total,
    stubs: parsed.jobPostings.map((item) => ({
      sourceJobId: item.bulletFields[0] ?? item.externalPath,
      externalPath: item.externalPath,
      title: item.title,
      locationsText: item.locationsText,
    })),
  };
}

export type HeaderFields = {
  union?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'year';
  shiftType?: ShiftType;
  employmentType?: EmploymentType;
};

/** SHN authoring convention only. Must fail soft — a missing header yields {}. */
export function parseDescriptionHeader(rawDescription: string): HeaderFields {
  const text = rawDescription.replace(/&amp;#xa;|&#xa;/gi, '\n');
  const fields: HeaderFields = {};

  const union = text.match(/^Union:\s*(.+)$/m);
  if (union) fields.union = union[1].trim();

  const salary = text.match(/Minimum\s*-\s*Maximum\s+(Hourly|Annual)\s+(?:Rate|Salary):\s*\$?([\d.,]+)\s*-\s*\$?([\d.,]+)/i);
  if (salary) {
    fields.salaryPeriod = salary[1].toLowerCase() === 'hourly' ? 'hour' : 'year';
    fields.salaryMin = Number(salary[2].replace(/,/g, ''));
    fields.salaryMax = Number(salary[3].replace(/,/g, ''));
  }

  const hours = text.match(/^Hours:\s*(.+)$/m);
  if (hours) {
    const h = hours[1].toLowerCase();
    if (/night/.test(h)) fields.shiftType = 'night';
    else if (/evening/.test(h)) fields.shiftType = 'evening';
    else if (/rotat/.test(h)) fields.shiftType = 'rotating';
    else if (/day/.test(h)) fields.shiftType = 'day';
    else if (/weekend/.test(h)) fields.shiftType = 'weekend';
  }

  const jobType = text.match(/^Job Type:\s*(.+)$/m);
  if (jobType) {
    const t = jobType[1].toLowerCase();
    if (/casual/.test(t)) fields.employmentType = 'casual';
    else if (/temporary/.test(t)) fields.employmentType = 'temporary';
    else if (/full.?time/.test(t)) fields.employmentType = 'full_time';
    else if (/part.?time/.test(t)) fields.employmentType = 'part_time';
  }

  return fields;
}

function employmentTypeFromTimeType(timeType?: string): EmploymentType | undefined {
  if (!timeType) return undefined;
  const t = timeType.toLowerCase();
  if (t.includes('full')) return 'full_time';
  if (t.includes('part')) return 'part_time';
  return undefined;
}

export function normalizeWorkday(detail: unknown, employer: WorkdayEmployer): NormalizedPosting {
  const parsed = DetailSchema.parse(detail);
  const info = parsed.jobPostingInfo;

  const header = employer.config.parseDescriptionHeader
    ? parseDescriptionHeader(info.jobDescription)
    : {};

  const postedAt = new Date(`${info.startDate}T00:00:00Z`);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable startDate "${info.startDate}" for ${info.jobReqId}`);
  }

  return {
    sourceId: `workday:${employer.config.tenant}`,
    sourceJobId: info.jobReqId,
    sourceUrl: info.externalUrl,
    title: info.title,
    employerName: employer.name,
    facilityName: info.location,
    description: sanitizeDescription(info.jobDescription),
    // Workday exposes no city; location is a facility string. City comes from the registry.
    city: employer.defaultCity,
    province: employer.province,
    postedAt,
    employmentType: header.employmentType ?? employmentTypeFromTimeType(info.timeType),
    shiftType: header.shiftType,
    salaryMin: header.salaryMin,
    salaryMax: header.salaryMax,
    salaryPeriod: header.salaryPeriod,
    applyUrl: info.externalUrl,
  };
}
