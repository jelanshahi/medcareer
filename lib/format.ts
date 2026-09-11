export function postedAgo(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

export function formatSalary(
  min: number | null,
  max: number | null,
  period: string | null,
): string | null {
  if (min === null || max === null || period === null) return null;
  const suffix = period === 'hour' ? '/hr' : '/yr';
  const money = (n: number) =>
    period === 'hour'
      ? `$${n.toFixed(2)}`
      : `$${n.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`;
  return `${money(min)}–${money(max)}${suffix}`;
}
