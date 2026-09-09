import { normalizeTitle } from '@/lib/normalize/title';
import type { Category } from './categories';

// Specialty rules must match a role, never a bare department name — a
// department word (e.g. "laboratory", "pharmacy", "research") would let a
// management or clerical title be claimed by the wrong specialty. Rule order
// stays first-match-wins, specialties ahead of management/admin, so that
// e.g. "Nurse Manager" is still read as nursing.
const RULES: ReadonlyArray<{ pattern: RegExp; category: Category }> = [
  { pattern: /\b(registered nurse|practical nurse|nurse practitioner|nursing|nurse)\b/, category: 'nursing' },
  // A physician assistant is an allied-health role, not a physician. Must
  // precede the physicians rule, which would otherwise claim it.
  { pattern: /\bphysician assistant\b/, category: 'allied_health' },
  { pattern: /\b(physician(?!\s+(assistant|recruitment|liaison|services|relations|advisor))|surgeon|anesthesiologist|hospitalist|psychiatrist)\b/, category: 'physicians' },
  { pattern: /\b(mental health|psychiatric|addiction|crisis intervention|crisis worker|crisis counsellor|crisis counselor)\b/, category: 'mental_health' },
  { pattern: /\b(personal support worker|health care aide|patient attendant|porter|orderly)\b/, category: 'support_care' },
  { pattern: /\b(laboratory technologist|laboratory assistant|radiation technologist|sonographer|ultrasonographer|phlebotomist|cytotechnologist|imaging technologist)\b/, category: 'diagnostics_lab' },
  { pattern: /\b(pharmacist|pharmacy technician|pharmacy assistant)\b/, category: 'pharmacy' },
  { pattern: /\b(occupational therapist|physiotherapist|respiratory therapist|speech language pathologist|dietitian|audiologist|social worker|therapist)\b/, category: 'allied_health' },
  { pattern: /\b(research associate|research assistant|research coordinator|research scientist|clinical scientist|postdoctoral|clinical trial)\b/, category: 'research' },
  { pattern: /\b(manager|director|chief|supervisor|vice president)\b/, category: 'management' },
  { pattern: /\b(clerk|secretary|administrative|receptionist|scheduler|registration|clerical)\b/, category: 'admin_clerical' },
];

/** Returns null when no rule matches. Never guess a category. */
export function classify(title: string): Category | null {
  const normalized = normalizeTitle(title);
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.category;
  }
  return null;
}
