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
    // Outbound URLs are built from the employers registry only, never user input, https: only
    // (plan Global Constraints). z.string().url() is scheme-agnostic and would pass
    // javascript:/data:/http: — use z.url() with a protocol restriction instead.
    externalUrl: z.url({ protocol: /^https$/ }),
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

  // Bounded to [^\n<] so the match cannot cross a newline or run into the HTML body when this
  // line is the last (unterminated) line of the header block — see the `Hours:` line below,
  // which butts straight up against `<br />` with no delimiter in the real SHN fixture.
  const union = text.match(/^Union:\s*([^\n<]+)$/m);
  if (union) fields.union = union[1].trim();

  const salary = text.match(/Minimum\s*-\s*Maximum\s+(Hourly|Annual)\s+(?:Rate|Salary):\s*\$?([\d.,]+)\s*-\s*\$?([\d.,]+)/i);
  if (salary) {
    fields.salaryPeriod = salary[1].toLowerCase() === 'hourly' ? 'hour' : 'year';
    fields.salaryMin = Number(salary[2].replace(/,/g, ''));
    fields.salaryMax = Number(salary[3].replace(/,/g, ''));
  }

  const hours = text.match(/^Hours:\s*([^\n<]+)$/m);
  if (hours) {
    const h = hours[1].toLowerCase();
    // \b before "day" so "Saturday"/"Sunday" don't misclassify as a day shift.
    if (/night/.test(h)) fields.shiftType = 'night';
    else if (/evening/.test(h)) fields.shiftType = 'evening';
    else if (/rotat/.test(h)) fields.shiftType = 'rotating';
    else if (/\bday/.test(h)) fields.shiftType = 'day';
    else if (/weekend/.test(h)) fields.shiftType = 'weekend';
  }

  const jobType = text.match(/^Job Type:\s*([^\n<]+)$/m);
  if (jobType) {
    const t = jobType[1].toLowerCase();
    if (/casual/.test(t)) fields.employmentType = 'casual';
    else if (/temporary/.test(t)) fields.employmentType = 'temporary';
    else if (/full.?time/.test(t)) fields.employmentType = 'full_time';
    else if (/part.?time/.test(t)) fields.employmentType = 'part_time';
  }

  return fields;
}

/**
 * Strips the SHN-style plaintext metadata block (`Job Number: ...`, `Union: ...`, etc.) from the
 * front of a raw jobDescription so it doesn't get shown to job seekers as body prose alongside
 * the structured fields `parseDescriptionHeader` already extracted from it. Fail-soft: anything
 * that doesn't look like a header block (CHEO, Oak Valley — no header at all) passes through
 * byte-identical.
 */
export function stripDescriptionHeader(rawDescription: string): string {
  const normalized = rawDescription.replace(/&amp;#xa;|&#xa;/gi, '\n');
  const looksLikeHeader = /^[A-Z][A-Za-z /-]{0,40}:\s/.test(normalized);
  if (!looksLikeHeader) return rawDescription;

  // Search the original raw string, not `normalized` — the entity substitution changes the
  // string length, and the entities themselves never contain "<", so the index of the first "<"
  // is identical between the two; using `rawDescription` avoids an offset mismatch.
  const cutIndex = rawDescription.indexOf('<');
  if (cutIndex === -1) return rawDescription;
  return rawDescription.slice(cutIndex);
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
    description: sanitizeDescription(
      employer.config.parseDescriptionHeader
        ? stripDescriptionHeader(info.jobDescription)
        : info.jobDescription,
    ),
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
