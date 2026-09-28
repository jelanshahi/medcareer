import { describe, it, expect } from 'vitest';
import { formatPay, summarizePay } from '@/lib/jobs/pay';

const hr = (min: number, max: number) => ({ salary_min: min, salary_max: max, salary_period: 'hour' });

describe('summarizePay', () => {
  it('returns null when nothing publishes a band', () => {
    expect(summarizePay([{ salary_min: null, salary_max: null, salary_period: null }])).toBeNull();
  });

  it('summarises band midpoints', () => {
    const s = summarizePay([hr(20, 22), hr(30, 32), hr(40, 42)])!;
    expect(s.period).toBe('hour');
    expect(s.count).toBe(3);
    expect(s.median).toBe(31);
    expect(s.low).toBe(20);
    expect(s.high).toBe(42);
    expect(s.p25).toBe(26);
    expect(s.p75).toBe(36);
  });

  it('never mixes hourly and annual bands', () => {
    const s = summarizePay([hr(30, 32), hr(34, 36), { salary_min: 90000, salary_max: 100000, salary_period: 'year' }])!;
    expect(s.period).toBe('hour');
    expect(s.count).toBe(2);
  });

  it('drops implausible bands', () => {
    const s = summarizePay([hr(30, 32), hr(95000, 99000)])!;
    expect(s.count).toBe(1);
  });
});

describe('formatPay', () => {
  it('formats both periods', () => {
    expect(formatPay(31.5, 'hour')).toBe('$31.50/hr');
    expect(formatPay(95000, 'year')).toBe('$95,000/yr');
  });
});
