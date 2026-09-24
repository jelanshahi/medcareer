import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { provinceCodeFromName } from '@/lib/provinces';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import type { Connector } from './types';

/**
 * TalentPoolBuilder, which is NetHire's ATS, used by six Ontario hospitals on
 * `{tenant}.talentpoolbuilder.com`.
 *
 * The board is an AngularJS page that lists nothing in its HTML; the jobs come from
 * `POST /jbApi/v1/jobs/list`, which the page calls as **multipart form data**, not JSON — its
 * `httpService.makeCall` builds a `FormData` and sets `Content-Type: undefined`. A JSON body is
 * accepted and answered with `{"result":true,"jobs":[]}`, a success with nothing in it, so this
 * is the kind of mistake that looks like "the employer has no jobs" rather than like an error.
 *
 * The three parameters that actually select the jobs (`cp_id`, `brands`, `type`) are set in a
 * multi-line `ng-init` on the jobs widget, and are per tenant. Without `brands` the same empty
 * success comes back.
 *
 * Neither the tenants nor `ats.nethire.com` serve a robots.txt (both answer with HTML), and
 * `nethire.com` itself is `Allow: /`. No terms of use are published to visitors; the terms in
 * the page bundle are TPB's contract with the hospitals about paying to syndicate postings to
 * job boards. Repeat requests to a listing and a detail page were served normally.
 */
export type TalentPoolBuilderEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: {
    key: string;
    host: string;
    /** `jCtrl.cpId` from the board's ng-init. */
    cpId: string;
    /** `jCtrl.brands` — one id, or several comma-separated. Omitting it returns nothing. */
    brands: string;
    /** `jCtrl.type`, "Public" on every tenant seen. */
    type: string;
  };
};

/**
 * Only the fields this connector reads. The API returns about seventy per job, including the
 * hiring manager and recruiter ids, which are of no use here and are not stored.
 */
const JobSchema = z.object({
  campaign_id: z.number(),
  job_title: z.string().min(1),
  /** "Hiring" or "Hired" — "Hired" means the post is filled. */
  status: z.string(),
  created: z.string().min(1),
  campaign_end: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  brand_name: z.string().nullable().optional(),
  department_name: z.string().nullable().optional(),
  employment_status_name: z.string().nullable().optional(),
  wage_from: z.number().nullable().optional(),
  wage_to: z.number().nullable().optional(),
  wage_type: z.string().nullable().optional(),
});
export type TalentPoolBuilderJob = z.infer<typeof JobSchema>;

const ListSchema = z.object({ result: z.boolean(), jobs: z.array(JobSchema).default([]) });

const DetailSchema = z.object({
  job: JobSchema,
  url: z.url({ protocol: /^https$/ }),
  descriptionHtml: z.string(),
});
export type TalentPoolBuilderDetail = z.infer<typeof DetailSchema>;

/** Runaway guard: the largest tenant seen lists 86 postings. */
const MAX_JOBS = 5000;

function requireHost(url: string, host: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.host !== host) {
    throw new Error(`URL "${url}" is not on registry host "${host}"`);
  }
  return parsed;
}

/**
 * Keeps only the postings actually open. "Hired" is a filled position that the board still
 * returns — listing one would send applicants at a job that no longer exists.
 */
export function parseJobList(payload: unknown, host: string): { stubs: JobStub[]; jobs: Map<string, TalentPoolBuilderJob> } {
  const parsed = ListSchema.parse(payload);
  const stubs: JobStub[] = [];
  const jobs = new Map<string, TalentPoolBuilderJob>();

  for (const job of parsed.jobs) {
    if (job.status !== 'Hiring') continue;
    const created = parseCreated(job.created);
    if (!created) continue;

    const id = String(job.campaign_id);
    jobs.set(id, job);
    stubs.push({
      sourceJobId: id,
      // `/job/{campaign_id}` is the short form of the link the board builds; the long
      // "/Job-Title-Slug/{campaign_id}/" resolves to the same page.
      externalPath: `/job/${id}`,
      title: job.job_title,
      locationsText: [job.city, job.state].filter(Boolean).join(', '),
      postedAt: created,
    });
    if (stubs.length >= MAX_JOBS) break;
  }
  // Touching `host` keeps the signature honest about what the caller must pass, and the URL
  // check happens in normalize where the full URL exists.
  void host;
  return { stubs, jobs };
}

/** "2026-09-21 16:41:44" — a space, not a T, so it is not ISO 8601 and is built by hand. */
export function parseCreated(value: string): Date | undefined {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  // Stamped in the tenant's own timezone (America/Toronto for all six). Read as UTC rather
  // than the runner's local zone, so a run in another region does not shift the date.
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** "Oct 22, 2026". Absent on postings with no closing date. */
export function parseCampaignEnd(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const closes = new Date(`${value} 23:59:59 UTC`);
  return Number.isNaN(closes.getTime()) ? undefined : closes;
}

/**
 * "Full-time", "Part-time", "Casual", "Temporary Part-Time", "Temporary Pro-rated".
 * Ordered: a temporary post is temporary whatever hours follow, as on every other connector.
 */
export function employmentTypeFromStatus(value: string | null | undefined): EmploymentType | undefined {
  const status = (value ?? '').toLowerCase();
  if (!status) return undefined;
  if (/casual/.test(status)) return 'casual';
  if (/temporary|term\b/.test(status)) return 'temporary';
  if (/full.?time/.test(status)) return 'full_time';
  if (/part.?time|pro.?rated/.test(status)) return 'part_time';
  return undefined;
}

export function salaryFrom(job: TalentPoolBuilderJob) {
  const min = job.wage_from ?? undefined;
  const max = job.wage_to ?? undefined;
  if (!min || !max || min > max) return {};
  // The board states the period rather than leaving it to be guessed from magnitude.
  const period = /hour/i.test(job.wage_type ?? '') ? ('hour' as const)
    : /annual|year/i.test(job.wage_type ?? '') ? ('year' as const)
      : undefined;
  return period ? { salaryMin: min, salaryMax: max, salaryPeriod: period } : {};
}

/** The description is server-rendered into `.cp-job-description`, entities and all. */
export function extractDescription(html: string): string {
  const root = parse(html);
  const blocks = root.querySelectorAll('.cp-job-description')
    .map((node) => node.innerHTML.trim())
    .filter((markup) => markup.length > 0);
  if (blocks.length === 0) throw new Error('TalentPoolBuilder job page carries no description');
  return blocks.join('\n');
}

export function normalizeTalentPoolBuilder(raw: unknown, employer: TalentPoolBuilderEmployer): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const { job } = detail;
  requireHost(detail.url, employer.config.host);

  const postedAt = parseCreated(job.created);
  if (!postedAt) throw new Error(`Unreadable created date "${job.created}"`);

  return {
    sourceId: `talentpoolbuilder:${employer.config.key}`,
    sourceJobId: String(job.campaign_id),
    sourceUrl: detail.url,
    title: job.job_title.replace(/\s+/g, ' ').trim(),
    employerName: employer.name,
    // `brand_name` is the site, which is what a multi-site tenant uses it for; the department
    // is a program ("Cancer Clinic"), not a place, so it is not a facility.
    facilityName: job.brand_name?.trim() || undefined,
    description: sanitizeDescription(detail.descriptionHtml),
    city: job.city?.trim() || employer.defaultCity,
    province: provinceCodeFromName(job.state ?? '') ?? employer.province,
    postedAt,
    closesAt: parseCampaignEnd(job.campaign_end),
    employmentType: employmentTypeFromStatus(job.employment_status_name),
    ...salaryFrom(job),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

export function createTalentPoolBuilderConnector(employer: TalentPoolBuilderEmployer, ctx: LogContext): Connector {
  const { key, host, cpId, brands, type } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent, Referer: `https://${host}/` };
  const jobsById = new Map<string, TalentPoolBuilderJob>();

  return {
    id: `talentpoolbuilder:${key}`,
    kind: 'api',
    // The list is one request and carries every field but the description, so a posting is
    // hydrated once and never refetched.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      // The API returns every posting in one response; there is nothing to page.
      if (cursor) return { items: [] };

      // Multipart, because that is what the board sends. A JSON body is answered with an
      // empty success rather than an error.
      const body = new FormData();
      body.set('cp_id', cpId);
      body.set('brands', brands);
      body.set('type', type);
      body.set('remote', '1');
      body.set('language', 'en-ca');
      body.set('timezone', 'America/Toronto');

      const url = `https://${host}/jbApi/v1/jobs/list`;
      const res = await limit(host, () => fetchWithBackoff(url, { method: 'POST', headers, body }));
      if (!res.ok) throw new Error(`Job list fetch failed ${res.status} for ${url}`);

      const { stubs, jobs } = parseJobList(await res.json(), host);
      for (const [id, job] of jobs) jobsById.set(id, job);

      log(ctx, 'info', 'fetched job list', { returned: stubs.length });
      return { items: stubs };
    },

    async hydrate(stub) {
      const job = jobsById.get(stub.sourceJobId);
      if (!job) throw new Error(`No list record held for ${stub.sourceJobId}`);

      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Detail fetch failed ${res.status} for ${stub.sourceJobId}`);

      return DetailSchema.parse({ job, url, descriptionHtml: extractDescription(await res.text()) });
    },

    normalize(raw: unknown) {
      return normalizeTalentPoolBuilder(raw, employer);
    },
  };
}
