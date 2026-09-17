import type { ShiftType } from '@/lib/types';

/**
 * Employers state shifts as a list of the ones a role covers: "Days", "Days, Weekends",
 * "Days, Evenings, Nights, Weekends, On Call". Weekends and On Call qualify a shift rather
 * than naming one, so they only decide when nothing else does. More than one of
 * days/evenings/nights means the role rotates.
 *
 * Shared by the Taleo and iCIMS connectors, which meet the same convention.
 */
export function shiftTypeFromPattern(pattern: string | undefined): ShiftType | undefined {
  if (!pattern) return undefined;
  const parts = new Set(pattern.toLowerCase().split(/[,;]/).map((p) => p.trim()));
  const has = (word: string) => [...parts].some((p) => p.startsWith(word));

  const core = (['day', 'evening', 'night'] as const).filter((p) => has(p));
  if (core.length > 1) return 'rotating';
  if (core[0] === 'day') return 'day';
  if (core[0] === 'evening') return 'evening';
  if (core[0] === 'night') return 'night';
  if (has('weekend')) return 'weekend';
  return undefined;
}
