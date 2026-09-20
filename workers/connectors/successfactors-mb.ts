import { parse } from 'node-html-parser';
import { z } from 'zod';
import { sanitizeDescription } from '@/lib/normalize/sanitize';
import { shiftTypeFromPattern } from '@/lib/normalize/shift';
import type { EmploymentType, JobStub, NormalizedPosting, ProvinceCode } from '@/lib/types';
import { SITE } from '@/lib/site';
import { createHostLimiter, fetchWithBackoff } from '@/workers/ratelimit';
import { log, type LogContext } from '@/workers/logger';
import { parseListDate, parseMicrodataDate, requireHost } from './successfactors';
import type { Connector } from './types';

/**
 * The shared Manitoba careers site (careers.wrha.mb.ca) — SAP SuccessFactors, like Nova
 * Scotia, but a different posting template, which is why it is a separate connector rather
 * than a flag on that one. Templates are per-customer: Nova Scotia packs every label AND
 * value into one <strong> separated by <br>, while Manitoba gives each field its own <p>.
 *
 * The bigger difference is that this one site carries roughly thirty employers — six
 * regional health authorities, the Winnipeg hospitals, CancerCare Manitoba and a string of
 * personal care homes. Every posting claims `hiringOrganization` "Winnipeg Regional Health
 * Authority" regardless, so the employer is read from the posting's own "Employer:" line,
 * falling back to the employer column of the search results.
 */
export type SuccessFactorsMbEmployer = {
  slug: string;
  name: string;
  province: ProvinceCode;
  defaultCity: string;
  config: { key: string; host: string };
};

const DetailSchema = z.object({
  url: z.url({ protocol: /^https$/ }),
  title: z.string().min(1),
  postedAt: z.iso.datetime(),
  closesAt: z.iso.datetime().optional(),
  locality: z.string(),
  descriptionHtml: z.string().min(1),
  fields: z.record(z.string(), z.string()),
  /** The search row's own columns, for postings that state neither in their text. */
  listEmployer: z.string().default(''),
  listStatus: z.string().default(''),
});
export type SuccessFactorsMbDetail = z.infer<typeof DetailSchema>;

const LIST_PAGE_SIZE = 25;
/** Runaway guard: the whole province is ~35 pages. */
const MAX_PAGES = 200;

/**
 * Labels worth keeping, by their normalised form. Employers on this site write the same
 * field several ways — "Department / Unit" and "Department/Unit", "Anticipated shift" and
 * "Anticipated Shift" — so labels are compared with case, spacing and punctuation removed.
 * Anything not listed here is dropped, which is what keeps a posting's prose headings
 * ("Qualifications:", "Job Summary:") out of the fields.
 */
const FIELD_ALIASES = new Map<string, string>([
  ['employer', 'Employer'],
  ['site', 'Site'],
  ['worklocation', 'Work Location'],
  ['worklocations', 'Work Location'],
  ['city', 'City'],
  ['fte', 'FTE'],
  ['eft', 'FTE'],
  ['hiringstatus', 'Hiring Status'],
  ['reasonforterm', 'Reason for Term'],
  ['anticipatedshift', 'Anticipated Shift'],
  ['shift', 'Anticipated Shift'],
  ['salary', 'Salary'],
  ['salaryrange', 'Salary'],
  ['hourlyrate', 'Salary'],
  ['hourlysalary', 'Salary'],
  ['postingenddate', 'Posting End Date'],
  ['requisitionid', 'Requisition ID'],
  ['competition', 'Requisition ID'],
]);

const normalizeLabel = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Zero-width characters are sprinkled through these postings, around labels especially:
 * `\p{Cf}` is the Unicode "format" category they all belong to (ZWSP, the direction marks,
 * the byte-order mark). Non-breaking spaces need no clause of their own — JavaScript's `\s`
 * already matches them.
 */
const clean = (value: string) => value.replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Text taken from markup, or from an attribute, with entities resolved. Stripping tags with
 * a regex alone leaves "Labour &amp; Delivery" to be shown to job seekers exactly like that.
 */
const text = (html: string) => clean(parse(html).text);

/**
 * Search rows, which carry three things the posting may not: the employing organization,
 * the employment status and the posted date.
 */
export function parseManitobaSearchPage(html: string, host: string): JobStub[] {
  const cell = (row: string, className: string) =>
    text(row.match(new RegExp(`class="${className}"[^>]*>([\\s\\S]*?)</span>`))?.[1] ?? '');

  const stubs: JobStub[] = [];
  for (const row of html.split(/<tr class="data-row/).slice(1)) {
    const href = row.match(/href="([^"]*\/job\/[^"]*)"/)?.[1]?.replace(/&amp;/g, '&');
    if (!href) continue;
    const url = requireHost(new URL(href, `https://${host}`).href, host);
    const id = url.pathname.match(/\/(\d+)\/?$/)?.[1];
    if (!id) continue;

    // Every cell is written twice, once for phones and once for wider screens. The wide
    // copy carries the bare class name, so matching the quote that closes it keeps the
    // phone copy ("jobFacility visible-phone") from winning.
    const posted = row.match(/>\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s*</)?.[1];
    stubs.push({
      sourceJobId: id,
      externalPath: `${url.pathname}${url.search}`,
      title: text(row.match(/<a[^>]*jobTitle-link[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? ''),
      locationsText: cell(row, 'jobLocation'),
      postedAt: posted ? parseListDate(posted) : undefined,
      listFields: { employer: cell(row, 'jobFacility'), status: cell(row, 'jobShifttype') },
    });
  }
  return stubs;
}

/**
 * Each field is its own paragraph, labelled with a <strong>: `<p><strong>City:</strong>
 * Winnipeg</p>`. The label is read from the markup but the split is done on the paragraph's
 * text, because the colon falls inside the <strong> on some postings and outside it on
 * others.
 */
export function parseDescriptionFields(descriptionHtml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const p of parse(descriptionHtml).querySelectorAll('p')) {
    if (!p.querySelector('strong') && !p.querySelector('b')) continue;
    const whole = clean(p.text);
    const colon = whole.indexOf(':');
    if (colon <= 0) continue;
    const canonical = FIELD_ALIASES.get(normalizeLabel(whole.slice(0, colon)));
    const value = clean(whole.slice(colon + 1));
    // First writing wins: the labelled block sits at the top, and a later paragraph can
    // repeat a label inside the prose.
    if (canonical && value && !fields[canonical]) fields[canonical] = value.slice(0, 300);
  }
  return fields;
}

/**
 * The search results state Permanent, Temporary or Casual for every posting, which is the
 * only place all of them agree; barely a tenth carry a "Hiring Status" line of their own.
 * Full against part time is a separate question, answered by the FTE: a permanent 0.70 FTE
 * post is part time.
 */
export function employmentTypeFromManitoba(
  fields: Record<string, string>,
  listStatus: string,
): EmploymentType | undefined {
  const status = `${listStatus} ${fields['Hiring Status'] ?? ''}`.toLowerCase();
  // Checked before the FTE: a "Temporary" full-time post is a term position, and the end
  // date is what matters to someone deciding whether to apply.
  if (/casual/.test(status)) return 'casual';
  if (/temporary|term\b/.test(status) || fields['Reason for Term']) return 'temporary';

  const fte = Number(fields['FTE']);
  if (Number.isFinite(fte) && fte > 0) return fte >= 1 ? 'full_time' : 'part_time';
  if (/permanent|full.?time/.test(status)) return 'full_time';
  if (/part.?time/.test(status)) return 'part_time';
  return undefined;
}

/**
 * Manitoba quotes a union pay grid rather than a range: "$22.002, $22.645, $23.307,
 * $23.993, $24.697" is one rate per step, so the lowest and highest are the floor and
 * ceiling. Anything that is not purely a list of dollar figures is left alone — "As per MNU
 * Collective Agreement" carries no number at all, and a line like "3 hours per week at
 * $49.2 per week ($16.40/hour)" quotes two different periods and cannot be read safely.
 */
export function parseSalary(fields: Record<string, string>) {
  const value = fields['Salary'];
  if (!value || !/^[\s$0-9.,;–-]+$/.test(value)) return {};

  const amounts = [...value.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (amounts.length === 0) return {};

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  // The grids are hourly rates quoted to three decimals; a salaried posting would be in the
  // tens of thousands.
  return { salaryMin: min, salaryMax: max, salaryPeriod: max < 1000 ? ('hour' as const) : ('year' as const) };
}

export function extractSuccessFactorsMbDetail(html: string, stub?: JobStub): SuccessFactorsMbDetail {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta itemprop="${name}" content="([^"]*)"`))?.[1];

  const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]
    ?? html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const postedAt = parseMicrodataDate(meta('datePosted'));
  const descriptionHtml = parse(html).querySelector('.jobdescription')?.innerHTML;
  if (!canonical || !title || !postedAt || !descriptionHtml) {
    throw new Error('Manitoba posting is missing url, title, posted date or description');
  }

  return DetailSchema.parse({
    url: canonical,
    title: text(title),
    postedAt: postedAt.toISOString(),
    closesAt: parseMicrodataDate(meta('validThrough'))?.toISOString(),
    locality: text(meta('addressLocality') ?? ''),
    descriptionHtml,
    fields: parseDescriptionFields(descriptionHtml),
    listEmployer: stub?.listFields?.employer ?? '',
    listStatus: stub?.listFields?.status ?? '',
  });
}

/** "Flexible in Manitoba" is how a province-wide posting states its city. */
const isRealCity = (city: string) => city.length > 0 && !/^(flexible|various|multiple)\b/i.test(city);

export function normalizeSuccessFactorsMb(
  raw: unknown,
  employer: SuccessFactorsMbEmployer,
): NormalizedPosting {
  const detail = DetailSchema.parse(raw);
  const url = requireHost(detail.url, employer.config.host);

  const sourceJobId = url.pathname.match(/\/(\d+)\/?$/)?.[1];
  if (!sourceJobId) throw new Error(`No job id at the end of "${detail.url}"`);

  const city = [detail.fields['City'], detail.locality.trim()].find((c) => c && isRealCity(c));

  return {
    sourceId: `successfactors_mb:${employer.config.key}`,
    sourceJobId,
    sourceUrl: detail.url,
    title: detail.title,
    // Who someone would actually work for. `hiringOrganization` says "Winnipeg Regional
    // Health Authority" on every posting on this site, including Southern Health's.
    employerName: detail.fields['Employer'] || detail.listEmployer || employer.name,
    facilityName: detail.fields['Site'] || detail.fields['Work Location'] || detail.listEmployer || undefined,
    description: sanitizeDescription(detail.descriptionHtml),
    city: city ?? employer.defaultCity,
    // addressRegion is not trustworthy: postings in Beausejour, Manitoba are tagged "NB",
    // which would file them under New Brunswick.
    province: employer.province,
    postedAt: new Date(detail.postedAt),
    closesAt: detail.closesAt ? new Date(detail.closesAt) : undefined,
    employmentType: employmentTypeFromManitoba(detail.fields, detail.listStatus),
    shiftType: shiftTypeFromPattern(detail.fields['Anticipated Shift']),
    ...parseSalary(detail.fields),
    applyUrl: detail.url,
  };
}

const limit = createHostLimiter();

export function createSuccessFactorsMbConnector(
  employer: SuccessFactorsMbEmployer,
  ctx: LogContext,
): Connector {
  const { key, host } = employer.config;
  const headers = { 'User-Agent': SITE.userAgent };

  return {
    id: `successfactors_mb:${key}`,
    kind: 'ats',
    // One page fetch per posting, and these postings do not change once published.
    refreshKnown: false,

    async fetchPage(cursor?: string) {
      const startRow = cursor ? Number(cursor) : 0;
      const url = `https://${host}/search/?startrow=${startRow}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Search fetch failed ${res.status} for ${url}`);

      const items = parseManitobaSearchPage(await res.text(), host);
      log(ctx, 'info', 'fetched search page', { startRow, returned: items.length });

      const morePages = items.length === LIST_PAGE_SIZE && startRow / LIST_PAGE_SIZE < MAX_PAGES;
      return { items, nextCursor: morePages ? String(startRow + LIST_PAGE_SIZE) : undefined };
    },

    async hydrate(stub) {
      const url = `https://${host}${stub.externalPath}`;
      const res = await limit(host, () => fetchWithBackoff(url, { headers }));
      if (!res.ok) throw new Error(`Posting fetch failed ${res.status} for ${stub.sourceJobId}`);
      return extractSuccessFactorsMbDetail(await res.text(), stub);
    },

    normalize(raw: unknown) {
      return normalizeSuccessFactorsMb(raw, employer);
    },
  };
}
