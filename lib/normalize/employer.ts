/**
 * Employer names are typed by hand into some feeds (the shared Manitoba site reads each
 * posting's own "Employer:" line), so one employer can arrive under several spellings. Each
 * distinct value counts as its own employer on the home page and gets its own landing page.
 *
 * Cleaning happens in workers/dedupe.ts, like lib/normalize/city.ts: stored rows are
 * repaired on the next run, raw_postings keeps the original, and fingerprints (built from the
 * registry slug, not this name) are unaffected.
 */

/**
 * Spellings confirmed to be one employer, keyed lower-case. Added by hand after reading the
 * postings: dropping suffixes by rule would merge employers that only look alike.
 */
const EMPLOYER_ALIASES = new Map<string, string>([
  // Same Winnipeg home. Postings with no "Employer:" line fall back to the facility name.
  ['golden links lodge personal care home', 'Golden Links Lodge'],
]);

export function cleanEmployerName(name: string): string {
  // "[[Golden Links Lodge]]" is a template field the employer filled in but left bracketed.
  const tidied = name.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
  if (!tidied) return name;
  return EMPLOYER_ALIASES.get(tidied.toLowerCase()) ?? tidied;
}
