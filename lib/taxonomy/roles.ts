import { normalizeTitle } from '@/lib/normalize/title';
import { classify } from '@/lib/taxonomy/classify';
import type { Category } from '@/lib/taxonomy/categories';

/**
 * Job titles people actually search for ("RN jobs", "PSW jobs Toronto"), one level below
 * the broad disciplines in categories.ts. Each role backs a /roles/[role] landing page, a
 * /roles/[role]/[province] page and a /salary/[role] pay guide.
 *
 * Patterns run against normalizeTitle() output: lower-case, accents stripped, punctuation
 * turned into spaces, and the abbreviations in lib/normalize/title.ts expanded — so "RN"
 * arrives as "registered nurse" and "RPN" as "registered practical nurse". First match wins,
 * so narrower roles sit ahead of the broader ones that would also match them.
 *
 * Like classify.ts, a rule names the job, never the department: "Pharmacy Manager" is not a
 * pharmacist job. Titles naming a manager or director match no role at all.
 */
export type Role = {
  slug: string;
  /** Singular, for "Registered nurse jobs in Ontario". */
  label: string;
  /** What someone types into /jobs to find the same postings. */
  searchQuery: string;
  /** The discipline this role belongs to, for links back to the discipline pages. */
  category: Category;
  pattern?: RegExp;
  /** For roles that are exactly one discipline (physicians), match on classify() instead. */
  byCategory?: boolean;
};

export const ROLES: readonly Role[] = [
  { slug: 'nurse-practitioner', label: 'Nurse practitioner', searchQuery: 'nurse practitioner', category: 'nursing',
    pattern: /\b(nurse practitioner|infirmiere praticienne|infirmier praticien)\b/ },
  { slug: 'registered-psychiatric-nurse', label: 'Registered psychiatric nurse', searchQuery: 'psychiatric nurse', category: 'nursing',
    pattern: /\b(registered psychiatric nurse|registered psych nurse|psychiatric nurse)\b/ },
  { slug: 'practical-nurse', label: 'Practical nurse (LPN / RPN)', searchQuery: 'practical nurse', category: 'nursing',
    pattern: /\b(practical nurse|infirmiere auxiliaire|infirmier auxiliaire)\b/ },
  { slug: 'registered-nurse', label: 'Registered nurse', searchQuery: 'registered nurse', category: 'nursing',
    pattern: /\b(registered nurse|nurse [ab]|general duty nurse|staff nurse|clinical nurse|nurse clinician|nurse educator|infirmiere clinicienne|infirmier clinicien|infirmiere|infirmier)\b/ },
  { slug: 'personal-support-worker', label: 'Personal support worker (PSW / HCA)', searchQuery: 'personal support worker', category: 'support_care',
    pattern: /\b(personal support worker|health care aide|care aide|continuing care assistant|resident assistant|resident attendant|home support worker|home care attendant|community care assistant|prepose aux beneficiaires|preposee aux beneficiaires|auxiliaire aux services de sante)\b/ },
  { slug: 'pharmacy-technician', label: 'Pharmacy technician', searchQuery: 'pharmacy technician', category: 'pharmacy',
    pattern: /\b(pharmacy technician|technicien en pharmacie|technicienne en pharmacie)\b/ },
  { slug: 'pharmacist', label: 'Pharmacist', searchQuery: 'pharmacist', category: 'pharmacy',
    pattern: /\b(pharmacist|pharm d|pharmd|pharmacien|pharmacienne)\b/ },
  { slug: 'physiotherapist', label: 'Physiotherapist', searchQuery: 'physiotherapist', category: 'allied_health',
    pattern: /\b(physiotherapist|physical therapist|physiotherapeute)\b/ },
  { slug: 'occupational-therapist', label: 'Occupational therapist', searchQuery: 'occupational therapist', category: 'allied_health',
    pattern: /\b(occupational therapist|ergotherapeute)\b/ },
  { slug: 'respiratory-therapist', label: 'Respiratory therapist', searchQuery: 'respiratory therapist', category: 'allied_health',
    pattern: /\b(respiratory therapist|inhalotherapeute)\b/ },
  { slug: 'speech-language-pathologist', label: 'Speech-language pathologist', searchQuery: 'speech language pathologist', category: 'allied_health',
    pattern: /\b(speech language pathologist|speech pathologist|orthophoniste)\b/ },
  { slug: 'therapy-assistant', label: 'Rehabilitation / therapy assistant', searchQuery: 'rehabilitation assistant', category: 'allied_health',
    pattern: /\b(rehabilitation assistant|therapy assistant|physiotherapy assistant|occupational therapy assistant)\b/ },
  { slug: 'dietitian', label: 'Dietitian', searchQuery: 'dietitian', category: 'allied_health',
    pattern: /\b(dietitian|(?<!aide )dietetiste|(?<!aide )nutritionniste)\b/ },
  { slug: 'social-worker', label: 'Social worker', searchQuery: 'social worker', category: 'allied_health',
    pattern: /\b(social worker|travailleur social|travailleuse sociale)\b/ },
  { slug: 'psychologist', label: 'Psychologist', searchQuery: 'psychologist', category: 'mental_health',
    pattern: /\b(psychologists?|psychologue)\b/ },
  { slug: 'medical-laboratory-technologist', label: 'Medical laboratory technologist', searchQuery: 'laboratory technologist', category: 'diagnostics_lab',
    pattern: /\b(medical laboratory technologist|laboratory technologist|combined laboratory|technologiste medical|technologiste medicale)\b/ },
  { slug: 'laboratory-assistant', label: 'Laboratory assistant', searchQuery: 'laboratory assistant', category: 'diagnostics_lab',
    pattern: /\b(laboratory assistant|lab assistant|laboratory technician|lab technician|phlebotomist)\b/ },
  { slug: 'sonographer', label: 'Sonographer', searchQuery: 'sonographer', category: 'diagnostics_lab',
    pattern: /\b(sonographer|ultrasonographer|ultrasound technologist|echocardiographer)\b/ },
  { slug: 'medical-radiation-technologist', label: 'Medical radiation technologist', searchQuery: 'radiation technologist', category: 'diagnostics_lab',
    pattern: /\b(medical radiation technologist|radiation technologist|radiological technologist|radiology technologist|x ray technologist|mri technologist|ct technologist|nuclear medicine technologist|technologue en radiologie|technologue en imagerie)\b/ },
  { slug: 'paramedic', label: 'Paramedic', searchQuery: 'paramedic', category: 'paramedics',
    pattern: /\b(paramedics?|emergency medical responder|emergency medical technician)\b/ },
  { slug: 'physician', label: 'Physician', searchQuery: 'physician', category: 'physicians', byCategory: true },
  { slug: 'unit-clerk', label: 'Unit clerk', searchQuery: 'unit clerk', category: 'admin_clerical',
    pattern: /\b(unit clerk|ward clerk|unit secretary|health unit coordinator)\b/ },
  { slug: 'medical-office-assistant', label: 'Medical office assistant', searchQuery: 'medical office assistant', category: 'admin_clerical',
    pattern: /\b(medical office assistant|medical secretary|medical receptionist|secretaire medicale)\b/ },
  { slug: 'cook', label: 'Cook', searchQuery: 'cook', category: 'food_services',
    pattern: /\b(cook|cooks|cuisinier|cuisiniere)\b/ },
  { slug: 'dietary-aide', label: 'Dietary aide', searchQuery: 'dietary aide', category: 'food_services',
    pattern: /\b(dietary aide|diet aide|dietary worker|food service worker|food services worker|aide alimentaire)\b/ },
  { slug: 'housekeeping-aide', label: 'Housekeeping aide', searchQuery: 'housekeeping', category: 'environmental_services',
    pattern: /\b(housekeeping aide|housekeeper|housekeeping attendant|environmental services aide|environmental services worker|environmental attendant|environmental aide|cleaner|custodian)\b/ },
];

const LEADERSHIP = /\b(manager|director|chief|vice president|gestionnaire|directeur|directrice)\b/;

const BY_SLUG = new Map(ROLES.map((r) => [r.slug, r]));

export function roleBySlug(slug: string): Role | null {
  return BY_SLUG.get(slug) ?? null;
}

/** The role a job title belongs to, or null. Pure; the same title always gets the same role. */
export function roleOf(title: string): Role | null {
  const normalized = normalizeTitle(title);
  if (LEADERSHIP.test(normalized)) return null;
  for (const role of ROLES) {
    if (role.byCategory) {
      if (classify(title) === role.category) return role;
    } else if (role.pattern?.test(normalized)) {
      return role;
    }
  }
  return null;
}
