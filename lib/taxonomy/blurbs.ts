import type { Category } from '@/lib/taxonomy/categories';

/** One or two sentences per discipline, shown as the subhead on
 * /browse/[city]/[discipline] landing pages.
 *
 * These are the only hand-written claims on the site, which is why they live
 * in one file: they describe what a discipline covers and which Ontario body
 * regulates it, and nothing else. Deliberately no pay figures, no demand or
 * market commentary, and nothing city-specific — those would be unverifiable
 * across eighteen landing pages, and per-page facts come from live data via
 * lib/jobs/glance.ts instead.
 *
 * Review these before release; they publish under the site owner's name. */
export const CATEGORY_BLURBS: Record<Category, string> = {
  nursing:
    'Registered nurse, registered practical nurse and nurse practitioner roles. All require a certificate of registration with the College of Nurses of Ontario.',
  physicians:
    'Staff physician, hospitalist and specialist appointments. Practice in Ontario requires registration with the College of Physicians and Surgeons of Ontario.',
  allied_health:
    'Occupational therapy, physiotherapy, respiratory therapy, speech-language pathology and related roles. Each is regulated by its own Ontario college.',
  mental_health:
    'Social work, psychology, psychotherapy and addictions roles across inpatient and community programs, regulated by the OCSWSSW, the CPO and the CRPO respectively.',
  support_care:
    'Personal support worker and health care aide roles. PSW is not a regulated profession in Ontario, so employers set their own certificate requirements.',
  diagnostics_lab:
    'Medical laboratory technologist, medical radiation technologist and sonographer roles, regulated by the CMLTO and the CMRITO.',
  pharmacy:
    'Hospital pharmacist and pharmacy technician roles. Both are regulated by the Ontario College of Pharmacists.',
  admin_clerical:
    'Unit clerk, scheduling, registration and administrative support roles. No college registration is required; employers usually ask for medical terminology.',
  management:
    'Program manager, director and clinical leadership roles. Most postings expect a clinical background alongside leadership experience.',
  research:
    'Clinical research coordinator, data and trial support roles, usually attached to a hospital research institute and often on fixed-term contracts.',
};
