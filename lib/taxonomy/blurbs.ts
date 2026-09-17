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
const ONTARIO_BLURBS: Record<Category, string> = {
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
  paramedics:
    'Primary care, advanced care and critical care paramedic and emergency medical responder roles in ground ambulance, air ambulance and community paramedicine. Licensing requirements vary by province.',
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

/** For every other province. Deliberately names no regulator: each province has its own
 * colleges, and a wrong one published under the site owner's name is worse than none. Add a
 * province-specific set, like Ontario's above, once its regulators have been checked. */
const GENERIC_BLURBS: Record<Category, string> = {
  nursing:
    'Registered nurse, licensed or registered practical nurse and nurse practitioner roles. All require registration with the provincial nursing regulator.',
  physicians:
    'Staff physician, hospitalist and specialist appointments. Practice requires registration with the provincial college of physicians and surgeons.',
  allied_health:
    'Occupational therapy, physiotherapy, respiratory therapy, speech-language pathology and related roles. Most are regulated by their own provincial college.',
  mental_health:
    'Social work, psychology and addictions roles across inpatient and community programs, each regulated by its own provincial body.',
  support_care:
    'Health care aide and personal support worker roles in hospitals, long-term care and home care. Certificate and registration requirements vary by province.',
  diagnostics_lab:
    'Medical laboratory technologist, medical radiation technologist and sonographer roles, regulated by provincial colleges.',
  pharmacy:
    'Hospital pharmacist and pharmacy technician roles, both regulated by the provincial college of pharmacy.',
  paramedics: ONTARIO_BLURBS.paramedics,
  admin_clerical: ONTARIO_BLURBS.admin_clerical,
  management: ONTARIO_BLURBS.management,
  research: ONTARIO_BLURBS.research,
};

export function categoryBlurb(category: Category, province: string | null): string {
  return province === 'ON' ? ONTARIO_BLURBS[category] : GENERIC_BLURBS[category];
}
