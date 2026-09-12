import { formatSalary, postedAgo } from '@/lib/format';
import { EMPLOYMENT_LABELS, EMPLOYMENT_TYPES } from '@/lib/taxonomy/employment';

export type GlanceRow = { label: string; value: string };

export type GlanceJob = {
  employer_name: string;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  posted_at: string;
};

/** Derives the "At a glance" rows for a landing page from its own job set.
 *
 * Every row is omitted rather than placeheld when its datum is missing. The
 * pay row matters most: all 65 Toronto listings publish a band and all 88
 * Markham and Ottawa listings publish none, so two landing cities in three
 * legitimately show no pay information at all.
 *
 * Pay is deliberately phrased as coverage plus outer bounds — "2 of 3
 * listings, from X to Y" — because a min/max across a category is a range of
 * ranges. Rendering it as "this role pays X to Y" would misstate what the
 * employer published. */
export function buildGlance(jobs: GlanceJob[]): GlanceRow[] {
  if (jobs.length === 0) return [];

  const rows: GlanceRow[] = [{ label: 'Active listings', value: String(jobs.length) }];

  const employers = [...new Set(jobs.map((j) => j.employer_name))].sort();
  if (employers.length > 0) rows.push({ label: 'Hiring here', value: employers.join(', ') });

  // Ordered by the taxonomy rather than by appearance, so two pages with the
  // same set of types read identically.
  const types = EMPLOYMENT_TYPES.filter((t) => jobs.some((j) => j.employment_type === t));
  if (types.length > 0) {
    rows.push({ label: 'Employment', value: types.map((t) => EMPLOYMENT_LABELS[t]).join(', ') });
  }

  const paid = jobs.filter(
    (j) => j.salary_min !== null && j.salary_max !== null && j.salary_period !== null,
  );
  if (paid.length > 0) {
    const min = Math.min(...paid.map((j) => j.salary_min as number));
    const max = Math.max(...paid.map((j) => j.salary_max as number));
    const period = paid[0].salary_period;
    const band = formatSalary(min, max, period);
    if (band) {
      const noun = jobs.length === 1 ? 'listing' : 'listings';
      rows.push({
        label: 'Published pay',
        value: `${paid.length} of ${jobs.length} ${noun}, from ${band.replace('–', ' to ')}`,
      });
    }
  }

  const newest = jobs.reduce((a, b) => (Date.parse(a.posted_at) >= Date.parse(b.posted_at) ? a : b));
  rows.push({ label: 'Most recent', value: postedAgo(newest.posted_at) });

  // Ingest cadence is fixed in .github/workflows/ingest.yml (cron '0 */6 * * *')
  // — an operational fact, not user data, so it is safe as a constant.
  rows.push({ label: 'Refreshed', value: 'Every 6 hours' });

  return rows;
}
