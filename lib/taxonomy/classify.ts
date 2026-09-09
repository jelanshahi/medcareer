import { normalizeTitle } from '@/lib/normalize/title';
import type { Category } from './categories';

const RULES: ReadonlyArray<{ pattern: RegExp; category: Category }> = [
  { pattern: /\b(registered nurse|practical nurse|nurse practitioner|nursing|nurse)\b/, category: 'nursing' },
  { pattern: /\b(physician|surgeon|anesthesiologist|hospitalist|psychiatrist)\b/, category: 'physicians' },
  { pattern: /\b(mental health|psychiatric|addiction|crisis|social worker)\b/, category: 'mental_health' },
  { pattern: /\b(personal support worker|health care aide|patient attendant|porter|orderly)\b/, category: 'support_care' },
  { pattern: /\b(laboratory|radiation technologist|sonographer|imaging|phlebotomist|diagnostic|cytotechnologist)\b/, category: 'diagnostics_lab' },
  { pattern: /\b(pharmacist|pharmacy)\b/, category: 'pharmacy' },
  { pattern: /\b(occupational therapist|physiotherapist|respiratory therapist|speech language pathologist|dietitian|audiologist|therapist)\b/, category: 'allied_health' },
  { pattern: /\b(research|scientist|postdoctoral|clinical trial)\b/, category: 'research' },
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
