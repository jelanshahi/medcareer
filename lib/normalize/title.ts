// Clinical role abbreviations. Note: pt, ot, rt are omitted — they are ambiguous
// in job titles (pt = part time, ot = overtime, rt = route/transport) and observed
// Workday postings spell these roles out in full (e.g. "Occupational Therapist - ACTT").
const ALIASES: Record<string, string> = {
  rn: 'registered nurse',
  rpn: 'registered practical nurse',
  lpn: 'licensed practical nurse',
  np: 'nurse practitioner',
  psw: 'personal support worker',
  hca: 'health care aide',
  mlt: 'medical laboratory technologist',
  mrt: 'medical radiation technologist',
  slp: 'speech language pathologist',
};

/**
 * Strips diacritics. Escaped codepoints rather than literal combining marks:
 * invisible characters in source get silently mangled by editors, encodings
 * and diff tooling, and this feeds the deduplication key.
 */
export function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeTitle(raw: string): string {
  const deaccented = deaccent(raw);
  const lowered = deaccented.toLowerCase();
  // Only strip "Req #12345"-style requisition tokens. A `\bjr\d+\b` rule for
  // Workday requisition IDs (e.g. JR106772) used to live here too, but it
  // collided with "Jr2"-style junior grade markers, which are real data, not
  // requisition noise. In the Workday payloads this project ingests,
  // requisition IDs appear in bulletFields and externalPath, not in job
  // titles, so the rule was speculative, and speculative stripping can only
  // cause wrong merges. Re-add it, scoped to a realistic digit length, only
  // if a JR id is ever actually observed inside a title.
  const withoutReq = lowered.replace(/\breq\s*#?\s*\d+/g, ' ');
  const wordsOnly = withoutReq.replace(/[^a-z0-9]+/g, ' ');
  return wordsOnly
    .split(' ')
    .filter(Boolean)
    .map((token) => ALIASES[token] ?? token)
    .join(' ');
}
