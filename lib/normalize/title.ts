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

export function normalizeTitle(raw: string): string {
  // Escaped codepoints rather than literal combining marks: invisible characters
  // in source get silently mangled by editors, encodings and diff tooling, and
  // this function is the deduplication key for the whole system.
  const deaccented = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lowered = deaccented.toLowerCase();
  const withoutReq = lowered.replace(/\breq\s*#?\s*\d+/g, ' ').replace(/\bjr\d+\b/g, ' ');
  const wordsOnly = withoutReq.replace(/[^a-z0-9]+/g, ' ');
  return wordsOnly
    .split(' ')
    .filter(Boolean)
    .map((token) => ALIASES[token] ?? token)
    .join(' ');
}
