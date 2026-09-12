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

/** Employer line for a listing: "Employer" or "Employer · Facility".
 *
 * facility_name comes from employer feeds and frequently is not a facility. On
 * live data it holds "Markham, Ontario" on 50 active rows and "Ottawa, ON" on
 * 23 more — the location again — and an empty string on several others.
 * Rendered verbatim that printed the place twice ("CHEO · Ottawa, ON" directly
 * above "Ottawa, ON") or left a separator with nothing after it.
 *
 * So show the facility only when it says something the city line does not.
 * A value whose first comma-separated part IS the city is dropped; a genuinely
 * different place ("Uxbridge, Ontario" on a job whose city is Markham) is kept,
 * because that is real information about where the work is.
 */
export function employerLine(
  employer: string,
  facility: string | null,
  city: string,
): string {
  const trimmed = (facility ?? '').trim();
  if (!trimmed) return employer;
  const head = trimmed.split(',')[0].trim().toLowerCase();
  if (head === city.trim().toLowerCase()) return employer;
  return `${employer} · ${trimmed}`;
}
