/**
 * Pay summaries for the /salary pages, built only from bands employers themselves
 * published on live postings. Nothing is estimated or imputed: a posting without a band
 * is left out, and every figure says how many postings it rests on.
 *
 * Hourly and annual bands are never mixed. A summary uses whichever period most of its
 * postings publish, and ignores the rest, because converting between them would need an
 * hours-per-year assumption that differs by employer and contract.
 */
export type PayJob = {
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
};

export type PaySummary = {
  period: 'hour' | 'year';
  /** Postings the figures below rest on. */
  count: number;
  /** Median of each band's midpoint. */
  median: number;
  /** 25th and 75th percentile of the band midpoints: the middle half of postings. */
  p25: number;
  p75: number;
  /** Lowest published minimum and highest published maximum. */
  low: number;
  high: number;
};

/** Minimum postings with a band before a pay page is offered to search engines. */
export const PAY_INDEX_THRESHOLD = 5;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function isPlausibleBand(min: number, max: number, period: 'hour' | 'year'): boolean {
  if (!(min > 0) || !(max >= min)) return false;
  // Guards against a feed putting an annual figure in an hourly field, or cents in dollars.
  return period === 'hour' ? max <= 500 && min >= 10 : max <= 1_000_000 && min >= 15_000;
}

export function summarizePay(jobs: PayJob[]): PaySummary | null {
  const banded = jobs.filter(
    (j): j is { salary_min: number; salary_max: number; salary_period: 'hour' | 'year' } =>
      j.salary_min !== null &&
      j.salary_max !== null &&
      (j.salary_period === 'hour' || j.salary_period === 'year') &&
      isPlausibleBand(Number(j.salary_min), Number(j.salary_max), j.salary_period),
  );
  if (banded.length === 0) return null;

  const hourly = banded.filter((j) => j.salary_period === 'hour').length;
  const period: 'hour' | 'year' = hourly >= banded.length - hourly ? 'hour' : 'year';
  const same = banded.filter((j) => j.salary_period === period);

  const mids = same.map((j) => (Number(j.salary_min) + Number(j.salary_max)) / 2).sort((a, b) => a - b);
  return {
    period,
    count: same.length,
    median: quantile(mids, 0.5),
    p25: quantile(mids, 0.25),
    p75: quantile(mids, 0.75),
    low: Math.min(...same.map((j) => Number(j.salary_min))),
    high: Math.max(...same.map((j) => Number(j.salary_max))),
  };
}

export function formatPay(amount: number, period: 'hour' | 'year'): string {
  return period === 'hour'
    ? `$${amount.toFixed(2)}/hr`
    : `$${Math.round(amount).toLocaleString('en-CA')}/yr`;
}
