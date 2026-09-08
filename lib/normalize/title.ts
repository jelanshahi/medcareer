const ALIASES: Record<string, string> = {
  rn: 'registered nurse',
  rpn: 'registered practical nurse',
  lpn: 'licensed practical nurse',
  np: 'nurse practitioner',
  psw: 'personal support worker',
  hca: 'health care aide',
  ot: 'occupational therapist',
  pt: 'physiotherapist',
  rt: 'respiratory therapist',
  mlt: 'medical laboratory technologist',
  mrt: 'medical radiation technologist',
  slp: 'speech language pathologist',
};

export function normalizeTitle(raw: string): string {
  const withoutBrackets = raw.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const deaccented = withoutBrackets.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lowered = deaccented.toLowerCase();
  const withoutReq = lowered.replace(/\breq\s*#?\s*\d+/g, ' ').replace(/\bjr\d+\b/g, ' ');
  const wordsOnly = withoutReq.replace(/[^a-z0-9]+/g, ' ');
  return wordsOnly
    .split(' ')
    .filter(Boolean)
    .map((token) => ALIASES[token] ?? token)
    .join(' ');
}
