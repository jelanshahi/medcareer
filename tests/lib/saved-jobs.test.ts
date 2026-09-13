import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedSlugs, isJobSaved, toggleSavedJob } from '@/lib/saved-jobs';

function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSavedSlugs', () => {
  it('returns an empty array when nothing is saved', () => {
    expect(getSavedSlugs()).toEqual([]);
  });

  it('returns an empty array when the stored value is corrupt JSON', () => {
    localStorage.setItem('carepotal:saved-jobs', 'not json');
    expect(getSavedSlugs()).toEqual([]);
  });

  it('returns an empty array when the stored value is not an array', () => {
    localStorage.setItem('carepotal:saved-jobs', JSON.stringify({ not: 'an array' }));
    expect(getSavedSlugs()).toEqual([]);
  });

  it('drops non-string entries from a malformed array', () => {
    localStorage.setItem('carepotal:saved-jobs', JSON.stringify(['nurse-toronto', 42, null]));
    expect(getSavedSlugs()).toEqual(['nurse-toronto']);
  });
});

describe('isJobSaved', () => {
  it('is false for a slug that was never saved', () => {
    expect(isJobSaved('nurse-toronto')).toBe(false);
  });

  it('is true after the slug is saved', () => {
    toggleSavedJob('nurse-toronto');
    expect(isJobSaved('nurse-toronto')).toBe(true);
  });
});

describe('toggleSavedJob', () => {
  it('adds a slug that is not yet saved and returns the new list', () => {
    expect(toggleSavedJob('nurse-toronto')).toEqual(['nurse-toronto']);
  });

  it('removes a slug that is already saved', () => {
    toggleSavedJob('nurse-toronto');
    expect(toggleSavedJob('nurse-toronto')).toEqual([]);
  });

  it('keeps other saved slugs when toggling one off', () => {
    toggleSavedJob('nurse-toronto');
    toggleSavedJob('psw-ottawa');
    expect(toggleSavedJob('nurse-toronto')).toEqual(['psw-ottawa']);
  });

  it('persists across calls via localStorage', () => {
    toggleSavedJob('nurse-toronto');
    expect(getSavedSlugs()).toEqual(['nurse-toronto']);
  });
});
