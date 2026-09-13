const STORAGE_KEY = 'carepotal:saved-jobs';

/** Fired on `window` after every save/unsave, so every mounted SaveButton
 * and the /saved page can react immediately. The native `storage` event
 * only fires in *other* tabs, never the tab that made the change. */
export const SAVED_JOBS_EVENT = 'saved-jobs-changed';

function readSlugs(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeSlugs(slugs: string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    // localStorage unavailable (private browsing, disabled, quota) — saved
    // state just won't persist; nothing to recover from here.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SAVED_JOBS_EVENT));
  }
}

export function getSavedSlugs(): string[] {
  return readSlugs();
}

export function isJobSaved(slug: string): boolean {
  return readSlugs().includes(slug);
}

export function toggleSavedJob(slug: string): string[] {
  const current = readSlugs();
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
  writeSlugs(next);
  return next;
}
