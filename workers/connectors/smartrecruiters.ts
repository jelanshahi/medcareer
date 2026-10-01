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

const JobAdSectionSchema = z.object({
  title: z.string().optional(),
  text: z.string().min(1),
});

const JobAdSchema = z.object({
  sections: z.object({
    companyDescription: JobAdSectionSchema.optional(),
    jobDescription: JobAdSectionSchema.optional(),
    qualifications: JobAdSectionSchema.optional(),
    additionalInformation: JobAdSectionSchema.optional(),
  }).default({}),
});

const DetailSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  releasedDate: z.string().min(1),
  location: LocationSchema.default({ city: '', region: '' }),
  typeOfEmployment: z.object({ label: z.string() }).optional(),
  // Outbound URLs are built from vendor JSON here, never user input (plan Global Constraints).
  // z.url() with a protocol restriction rejects javascript:/data:/http: the same way every
  // other connector's URL field does.
  applyUrl: z.url({ protocol: /^https$/ }),
  jobAd: JobAdSchema.optional(),
});
export type SmartRecruitersDetail = z.infer<typeof DetailSchema>;

/**
 * SmartRecruiters serves postings from api.smartrecruiters.com but apply links live on a
 * DIFFERENT SmartRecruiters-owned domain -- so this is an allow-list of known apply hosts,
 * not an exact match against employer.config.host like every other connector's requireHost.
 */
const ALLOWED_APPLY_HOSTS = ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com'];

function requireAllowedApplyHost(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_APPLY_HOSTS.includes(parsed.host)) {
    throw new Error(`applyUrl "${url}" is not on an allowed SmartRecruiters domain`);
  }
}

export function employmentTypeFromSmartRecruiters(label?: string): EmploymentType | undefined {
  if (!label) return undefined;
  const v = label.toLowerCase();
  if (/casual/.test(v)) return 'casual';
  if (/temporary|temp\b/.test(v)) return 'temporary';
  if (/full.?time/.test(v)) return 'full_time';
  if (/part.?time/.test(v)) return 'part_time';
  if (/contract/.test(v)) return 'contract';
  return undefined;
}

/**
 * companyDescription is included despite being generic marketing boilerplate repeated across
 * every posting -- full fidelity to what a seeker sees on the real posting page, not a trimmed
 * subset (design spec §5, decision #5). Missing sections are skipped, never inferred.
 */
const SECTION_ORDER: Array<[key: keyof NonNullable<SmartRecruitersDetail['jobAd']>['sections'], fallbackHeading: string]> = [
  ['companyDescription', 'About'],
  ['jobDescription', 'Job Description'],
  ['qualifications', 'Qualifications'],
  ['additionalInformation', 'Additional Information'],
];

export function combineJobAdSections(jobAd: SmartRecruitersDetail['jobAd']): string {
  if (!jobAd) return '';
  const parts: string[] = [];
  for (const [key, fallbackHeading] of SECTION_ORDER) {
    const section = jobAd.sections[key];
    if (!section?.text) continue;
    parts.push(`<h3>${section.title || fallbackHeading}</h3>${section.text}`);
  }
  return parts.join('');
}

export function normalizeSmartRecruiters(raw: unknown, employer: SmartRecruitersEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  requireAllowedApplyHost(detail.applyUrl);

  const postedAt = new Date(detail.releasedDate);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable releasedDate "${detail.releasedDate}" for ${detail.id}`);
  }

  const cityKey = detail.location.city;
  const city = employer.config.cityAliases?.[cityKey] ?? (cityKey || employer.defaultCity);
  const province = detail.location.region
    ? provinceCodeFromName(detail.location.region) ?? employer.province
    : employer.province;

  return {
    sourceId: `smartrecruiters:${employer.config.key}`,
    sourceJobId: detail.id,
    sourceUrl: detail.applyUrl,
    title: detail.name,
    employerName: employer.name,
    description: sanitizeDescription(combineJobAdSections(detail.jobAd)),
    city,
    province,
    postedAt,
    employmentType: employmentTypeFromSmartRecruiters(detail.typeOfEmployment?.label),
    applyUrl: detail.applyUrl,
  };
}
