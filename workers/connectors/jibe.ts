import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * iCIMS' Jibe job boards — the public front end Fraser Health runs at jobs.fraserhealth.ca.
 * Its JSON API returns whole postings, descriptions included, 100 at a time, so a full crawl
 * is ~22 requests and no posting is ever fetched on its own.
 *
 * Fraser Health's iCIMS site (careers-fraserhealth.icims.com) disallows crawling in its
 * robots.txt; this board allows it and asks for one request every 5 seconds, which is why
 * this connector has its own limiter rather than sharing the default one-per-second.
 */
export type JibeEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    key: string;
    host: string;
    /** Grouped location names the board uses ("Maple Ridge / Pitt Meadows") mapped to one city. */
    cityAliases?: Record<string, string>;
  };
};

const JobDataSchema = z.object({
  slug: z.string().min(1),
  req_id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  city: z.string().default(''),
  state: z.string().default(''),
  location_name: z.string().default(''),
  posted_date: z.string().min(1),
  employment_type: z.string().optional(),
  tags1: z.array(z.string()).default([]),
  salary_min_value: z.number().default(0),
  salary_max_value: z.number().default(0),
});

const ListSchema = z.object({
  totalCount: z.number(),
  jobs: z.array(z.object({ data: JobDataSchema })),
});

export type JibeJob = z.infer<typeof JobDataSchema>;

const PAGE_SIZE = 100;
/** Runaway guard: Fraser Health, the largest board, is ~22 pages. */
const MAX_PAGES = 200;
/** jobs.fraserhealth.ca/robots.txt asks for `crawl-delay: 5`. */
const CRAWL_DELAY_MS = 5000;

/**
 * The board's own salary fields are all zeroes; the rate is stated in the description
 * ("The salary range for this position is CAD $41.42 - $59.52 / hour"). Present on 408 of
 * 414 recent Fraser postings — the rest simply have no rate, and get none.
 */
export function parseSalaryFromDescription(description: string) {
  const m = description.match(
    /salary range for this position is\s*(?:CAD)?\s*\$?([\d,.]+)\s*(?:-|–|to)\s*(?:CAD)?\s*\$?([\d,.]+)\s*\/?\s*(hour|hr|year|annum)/i,
  );
  if (!m) return {};
  const min = Number(m[1].replace(/,/g, ''));
  const max = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || min > max) return {};
  return { salaryMin: min, salaryMax: max, salaryPeriod: /hour|hr/i.test(m[3]) ? ('hour' as const) : ('year' as const) };
}

/**
 * `tags1` carries the employer's own wording ("Relief Part Time", "Casual") and is more
 * precise than `employment_type`, which flattens everything but full/part time to
 * OTHER_EMPLOYMENT_TYPE. A relief line covers someone else's absence, which is what this
 * project means by temporary.
 */
export function employmentTypeFromJibe(job: JibeJob): EmploymentType | undefined {
  const tag = (job.tags1[0] ?? '').toLowerCase();
  if (tag.includes('casual')) return 'casual';
  if (tag.startsWith('relief') || tag.startsWith('temp')) return 'temporary';
  if (tag.includes('full time') && tag.includes('part time')) return undefined; // "Full Time / Part Time / Locum / Temp"
  if (tag.includes('full time')) return 'full_time';
  if (tag.includes('part time')) return 'part_time';

  switch (job.employment_type) {
    case 'FULL_TIME': return 'full_time';
    case 'PART_TIME': return 'part_time';
    case 'TEMPORARY': return 'temporary';
    default: return undefined;
  }
}

/** "Maple Ridge / Pitt Meadows" → "Maple Ridge"; an alias wins over the first segment. */
export function resolveCity(raw: string, employer: JibeEmployer): string {
  const value = raw.trim();
  const alias = employer.config.cityAliases?.[value];
  if (alias) return alias;
  const first = value.split('/')[0].trim();
  // A board that has no city for a posting puts the employer's own name there.
  if (!first || first.toLowerCase() === employer.name.toLowerCase()) return employer.defaultCity;
  return first;
}

export function normalizeJibe(raw: unknown, employer: JibeEmployer): NormalizedPosting {
  const job = JobDataSchema.parse(raw);

  const postedAt = new Date(job.posted_date);
  if (Number.isNaN(postedAt.getTime())) {
    throw new Error(`Unparseable posted_date "${job.posted_date}" for ${job.slug}`);
  }

  // The board's own apply_url points at an iCIMS login page — and that iCIMS host disallows
  // crawling — so job seekers are sent to the public posting on the board itself.
  const url = `https://${employer.config.host}/jobs/${encodeURIComponent(job.slug)}`;

  return {
    sourceId: `jibe:${employer.config.key}`,
    sourceJobId: job.req_id || job.slug,
    sourceUrl: url,
    title: job.title,
    employerName: employer.name,
    // `location_name` is a facility on some postings ("Royal Columbian Hospital") and a list of
    // communities on others ("Coquitlam / Port Coquitlam / Port Moody (Tri-Cities) / Anmore").
    // The second kind says nothing the city line does not, so it is dropped.
    facilityName: job.location_name && !job.location_name.includes('/') ? job.location_name : undefined,
    description: sanitizeDescription(job.description),
    city: resolveCity(job.city, employer),
    province: provinceCodeFromName(job.state) ?? employer.province,
    postedAt,
    employmentType: employmentTypeFromJibe(job),
    ...parseSalaryFromDescription(job.description),
    applyUrl: url,
  };
}

const limit = createHostLimiter(CRAWL_DELAY_MS);

export function createJibeConnector(employer: JibeEmployer, ctx: LogContext): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };
  // The list already holds every field, so hydrate() serves from here rather than re-fetching.
  const byId = new Map<string, JibeJob>();

  return {
    id: `jibe:${key}`,
    kind: 'ats',
    // Postings come back whole on every run at no extra request, so keeping them current is free.
    refreshKnown: true,

    async fetchPage(cursor?: string) {
      const page = cursor ? Number(cursor) : 1;
      const url = `https://${host}/api/jobs?page=${page}&limit=${PAGE_SIZE}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`List fetch failed ${res.status} for ${url}`);

      const { totalCount, jobs } = ListSchema.parse(await res.json());
      const items: JobStub[] = jobs.map(({ data }) => {
        const id = data.req_id || data.slug;
        byId.set(id, data);
        const postedAt = new Date(data.posted_date);
        return {
          sourceJobId: id,
          externalPath: `/jobs/${data.slug}`,
          title: data.title,
          locationsText: data.location_name || data.city,
          postedAt: Number.isNaN(postedAt.getTime()) ? undefined : postedAt,
        };
      });

      log(ctx, 'info', 'fetched list page', { page, returned: items.length, total: totalCount });
      const hasMore = items.length === PAGE_SIZE && page < MAX_PAGES;
      return { items, nextCursor: hasMore ? String(page + 1) : undefined };
    },

    async hydrate(stub) {
      const job = byId.get(stub.sourceJobId);
      if (!job) throw new Error(`No list record held for ${stub.sourceJobId}`);
      return job;
    },

    normalize(raw: unknown) {
      return normalizeJibe(raw, employer);
    },
  };
}
