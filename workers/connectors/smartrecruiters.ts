import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * SmartRecruiters career sites (careers.smartrecruiters.com/<company>). Unlike most connectors
 * here, SmartRecruiters publishes an official public JSON API for postings
 * (api.smartrecruiters.com/v1/companies/{companyId}/postings), so this connector calls that
 * directly rather than scraping the hosted career page.
 */
export type SmartRecruitersEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    /** SmartRecruiters company identifier, e.g. "UniversityHealthNetwork". */
    key: string;
    /** Always "api.smartrecruiters.com" today; kept explicit rather than hardcoded so the
     *  registry row schema in workers/run.ts validates it like every other platform's host. */
    host: string;
    /** Grouped location names the board uses ("GTA") mapped onto one real city. */
    cityAliases?: Record<string, string>;
  };
};

const LocationSchema = z.object({
  city: z.string().default(''),
  region: z.string().default(''),
});

const ListItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  releasedDate: z.string().min(1),
  location: LocationSchema.default({ city: '', region: '' }),
});

const ListSchema = z.object({
  totalFound: z.number().optional(),
  content: z.array(ListItemSchema).default([]),
});

export function parseSmartRecruitersList(payload: unknown): JobStub[] {
  const parsed = ListSchema.parse(payload);
  return parsed.content.map((item) => {
    const postedAt = new Date(item.releasedDate);
    return {
      sourceJobId: item.id,
      // SmartRecruiters' detail fetch is built from the id alone (see createSmartRecruitersConnector
      // in Task 4), so this is informational only -- the same role externalPath plays for Oracle
      // Cloud postings, which also rebuild their detail URL from sourceJobId rather than this path.
      externalPath: `/postings/${item.id}`,
      title: item.name,
      locationsText: [item.location.city, item.location.region].filter(Boolean).join(', '),
      postedAt: Number.isNaN(postedAt.getTime()) ? undefined : postedAt,
    };
  });
}
