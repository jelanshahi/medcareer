import { normalizeTitle } from '@/lib/normalize/title';
import type { Category } from './categories';

// Specialty rules must match a role, never a bare department name — a
// department word (e.g. "laboratory", "pharmacy", "research") would let a
// management or clerical title be claimed by the wrong specialty. Rule order
// stays first-match-wins, specialties ahead of management/admin, so that
// e.g. "Nurse Manager" is still read as nursing.
//
// The same principle decides every phrase added below, and the live data is
// full of titles that break it if the setting is matched instead of the role:
// "Continuing Care Assistant" is a PSW but "Continuing Care Coordinator" is
// not; "Rehabilitation Assistant" is allied health but "Rehabilitation
// Consultant - Occupational Health, Safety & Wellness" is an HR return-to-work
// role; "Home Care Attendant" is support care but "Coordinator, Home Support
// Scheduling" is admin; "Coordinator | Central Functions | Pharmacy" is not a
// pharmacy role. So each rule names the job, not where it is done.
//
// Deliberately left unmatched, because the title alone cannot say: bare
// "Unit Assistant" (care aide in some places, clerical in others), "Assessor
// Coordinator" (filled by nurses or social workers), and bare "counsellor"
// (the pool holds genetic, addictions and employment counsellors side by side).
// Shared by the management and admin rules and by the mental-health department
// guard below, so the three cannot drift apart.
const MANAGEMENT_ROLE = String.raw`manager|director|chief|supervisor|vice president|gestionnaire|chef de service|chef d equipe|chef de secteur|cheffe de service|cheffe d equipe|cheffe de secteur|directeur|directrice`;
// The feminine forms are listed beside the masculine ones because Quebec titles pair them:
// "Chef / Cheffe de secteur" normalizes to "chef cheffe de secteur", so "chef de secteur"
// never appears contiguously and only "cheffe de secteur" can match.
// "Office admin", "office administration" and "transcription" are how BC marks a
// clerical post that carries a clinical program's name ("Program Assistant (Office
// Admin), Child and Youth Mental Health"). Bare "program assistant" is not safe
// here: "Program Assistant - Adult Day Centre" may be an activity role.
const ADMIN_ROLE = String.raw`clerk|secretary|administrative|receptionist|scheduler|registration|clerical|office assistant|agent administratif|agente administrative|secretaire medicale|commis|procedes administratifs|office admin|office administration|transcription|transcriptionist`;

/**
 * Matches `words` only when the title names no management or clerical role.
 *
 * For words that name a department rather than a job: "Housekeeping Aide" is
 * environmental services and "Housekeeping Supervisor" is management, and a guard
 * says that once where a separate role list per department would say it badly.
 */
const unlessLeadershipOrClerical = (words: string) =>
  new RegExp(String.raw`^(?!.*\b(${MANAGEMENT_ROLE}|${ADMIN_ROLE})\b).*\b(${words})\b`);

const RULES: ReadonlyArray<{ pattern: RegExp; category: Category }> = [
  { pattern: /\b(registered nurse|practical nurse|nurse practitioner|nursing|nurse|infirmier|infirmiere|infirmiers|infirmieres|soins infirmiers)\b/, category: 'nursing' },
  // A physician assistant is an allied-health role, not a physician. Must
  // precede the physicians rule, which would otherwise claim it.
  { pattern: /\bphysician assistant\b/, category: 'allied_health' },
  // Specialists by name. Not a general "-ologist" rule: that would claim
  // technologists and kinesiologists, and "speech pathologist" — which is
  // allied health — ahead of its own rule. "pathologist" is left out for that
  // reason.
  { pattern: /\b(physician(?!\s+(assistant|recruitment|liaison|services|relations|advisor))|surgeon|anesthesiologist|hospitalist|psychiatrist|cardiologist|oncologist|radiologist|gastroenterologist|otolaryngologist|physiatrist|obstetrician|gynecologist|neurologist|nephrologist|dermatologist|urologist|internist|intensivist|pediatrician|geriatrician|endocrinologist|rheumatologist|hematologist|respirologist|pulmonologist|ophthalmologist|medecin|medecins)\b/, category: 'physicians' },
  // Mental health is split in two, because its words are of two kinds.
  //
  // Roles first, with the same precedence as every specialty, so that
  // "Psychologist Supervisor" stays a mental health job the way "Nurse Manager"
  // stays nursing. "Clinical counsellor" is BC's registered clinical counsellor, a
  // mental health profession — unlike bare "counsellor", which is not safe here.
  { pattern: /\b(psychologists?|psychologue|crisis intervention|crisis worker|crisis counsellor|crisis counselor|clinical counsellor|clinical counselor|addictions? counsellor|addictions? counselor)\b/, category: 'mental_health' },
  // Then the department phrases — "mental health", "addictions", "substance use",
  // "withdrawal management" (detox), and "MHSU" / "MH&SU" (BC's abbreviation,
  // normalizing to "mhsu" / "mh su").
  // These name where a job is, not what it is, which is exactly the trap in this
  // file's header: as a plain match they had filed "Clerk - 4, Inpatient Pool -
  // Medicine and Mental Health", "Administrative Secretary - Child and Adolescent
  // Mental Health Service" and "Manager, Community Based Mental Health Program" as
  // mental health jobs. So they count only when the title names no management or
  // clerical role, and those titles fall through to the rules that describe them.
  //
  // A guard rather than a later position: the rule has to beat allied health (a
  // "Mental Health Therapist" is a mental health job, not a generic therapist) while
  // losing to management and admin, which themselves sit after allied health. No
  // single ordering does both.
  { pattern: unlessLeadershipOrClerical(String.raw`mental health|psychiatric|addictions?|substance use|withdrawal management|mhsu|mh su|sante mentale|psychiatrie|toxicomanie|dependances`), category: 'mental_health' },
  // Provincial names for the same PSW/HCA job. "Continuing care assistant" is
  // Nova Scotia's and Saskatchewan's, and on its own was the largest
  // uncategorised title on the site (147 jobs). "Resident assistant" is the
  // long-term-care term; one employer writes it "Resident Assistant (Personal
  // Support Worker)". "Care aide" is BC's. Matched as roles: "Continuing Care
  // Coordinator" and "Home Support Scheduling" must not land here.
  { pattern: /\b(personal support worker|health care aide|care aide|continuing care assistant|resident assistant|home care attendant|community care assistant|home support worker|patient support assistant|patient attendant|porter|orderly|prepose aux beneficiaires|preposee aux beneficiaires|auxiliaire aux services de sante|auxiliaires aux services de sante|aide soignant|aide soignante)\b/, category: 'support_care' },
  // Ahead of management like every specialty: "Paramedic Supervisor" is still a paramedic role.
  { pattern: /\b(paramedics?|emergency medical responder|emergency med responder|emergency medical technician)\b/, category: 'paramedics' },
  // Alberta titles: "Nuclear Medicine Technologist I", "Combined Laboratory / X-Ray Technologist I".
  // BC writes "Radiological Technologist" where Ontario writes "Medical Radiation
  // Technologist". "M.R.T." normalizes to "m r t" — the dots separate the letters,
  // so the "mrt" alias in normalizeTitle never fires on it. Named imaging and
  // cardiac modalities rather than bare "technologist", which would also claim
  // "Biomedical Engineering Technologist".
  { pattern: /\b(laboratory technologist|laboratory assistant|laboratory technician|lab technician|radiation technologist|radiological technologist|radiology technologist|m r t|mri technologist|mri specialty technologist|ct technologist|ultrasound technologist|cardiology technologist|cardiovascular technologist|pacemaker technologist|echocardiographer|sonographer|ultrasonographer|phlebotomist|cytotechnologist|imaging technologist|nuclear medicine technologist|x ray technologist|technologiste medical|technologiste medicale|technologue en radiologie|technologue en imagerie|technologue en electrophysiologie|cytotechnologiste)\b/, category: 'diagnostics_lab' },
  // Roles only. "Coordinator | Central Functions | Pharmacy" is the department
  // trap this file's header warns about, so bare "pharmacy" never matches.
  // "Pharm D" is the pharmacist degree, and SK posts it as a title.
  { pattern: /\b(pharmacist|pharmacy technician|pharmacy assistant|pharmacy specialist|pharmacy practice assistant|pharmacy student|pharm d|pharmd|pharmacien|pharmacienne)\b/, category: 'pharmacy' },
  // Alberta says "Speech Pathologist" and "Therapy Assistant" where Ontario says
  // "Speech-Language Pathologist" and "Rehabilitation Assistant" — the second of
  // which was named here but never matched until now. "Physiotherapy assistant"
  // is a separate phrase because "therapy" sits inside one word there and
  // "therapy assistant" cannot reach it. "Communicative disorders assistant" is
  // Ontario's speech-language assistant. Therapeutic recreation is allied health;
  // its workers and aides are matched as roles, not on "recreation" alone.
  { pattern: /\b(occupational therapist|physiotherapist|respiratory therapist|speech language pathologist|speech pathologist|dietitian|audiologist|social worker|therapist|therapy assistant|rehabilitation assistant|physiotherapy assistant|occupational therapy assistant|communicative disorders assistant|genetic counsellor|genetic counselor|kinesiologist|dietetic technician|orthopaedic technician|orthopedic technician|recreation assistant|recreation worker|recreation aide|recreation coordinator|recreation therapy worker|activity worker|activity aide|activity assistant|perfusionist|anesthesia assistant|ergotherapeute|physiotherapeute|inhalotherapeute|orthophoniste|(?<!aide )dietetiste|(?<!aide )nutritionniste|travailleur social|travailleuse sociale|audiologiste|kinesiologue|hygieniste dentaire|recreologue|en dietetique)\b/, category: 'allied_health' },
  { pattern: /\b(research associate|research assistant|research coordinator|research scientist|clinical scientist|postdoctoral|clinical trial)\b/, category: 'research' },
  // The non-clinical disciplines. After every clinical specialty, so "Dietitian, Food
  // Services" stays allied health; guarded, so their supervisors and clerks go to
  // management and admin like every other department's.
  // The department phrase itself is matched, like "environmental services" below, so
  // "General Worker - Food Services" is caught; "Dietitian, Food Services" is not,
  // because allied health has already claimed it.
  { pattern: unlessLeadershipOrClerical(String.raw`cook|cooks|cuisinier|cuisiniere|chef cuisinier|aide dietetiste|aide nutritionniste|food services|food service|service alimentaire|services alimentaires|aide alimentaire|dietary aide|diet aide|dietary worker|dishwasher|kitchen helper|kitchen aide|hospitality service associate|hospitality services associate|nutrition services worker`), category: 'food_services' },
  // Never bare "environmental": an Environmental Health Officer is a public health
  // inspector. "Porter" is not here either — support care already claims it.
  { pattern: unlessLeadershipOrClerical(String.raw`environmental services|environmental service|environmental attendant|environmental aide|housekeeping|housekeeper|cleaner|custodian|custodial|laundry|linen|entretien menager|hygiene et salubrite|salubrite|buanderie`), category: 'environmental_services' },
  // Engineers only by class or as power/stationary engineers — never bare "engineer",
  // which would claim software and data engineers. "Biomedical engineering
  // technologist" is clinical engineering, kept out of lab and imaging on purpose.
  { pattern: unlessLeadershipOrClerical(String.raw`maintenance|power engineer|stationary engineer|engineer (1st|2nd|3rd|4th|5th) class|building operator|electrician|plumber|pipefitter|carpenter|millwright|refrigeration mechanic|hvac|painter|groundskeeper|grounds keeper|tradesperson|menuisier|menuisiere|mecanicien de machines fixes|machines fixes|biomedical engineering technologist|biomedical engineering technician|biomedical technologist|instrumentation`), category: 'facilities_trades' },
  // Physical security by role. The lookbehind keeps information and cyber security
  // — IT roles — out, since "Information Security Officer" names no manager and would
  // otherwise land here.
  { pattern: unlessLeadershipOrClerical(String.raw`(?<!(information|cyber|data|it) )(security officer|security guard|security coordinator|relational security)|patrol officer|protection services officer|protection officer|institutional safety officer`), category: 'security' },
  { pattern: new RegExp(String.raw`\b(${MANAGEMENT_ROLE})\b`), category: 'management' },
  // "Medical Office Assistant (MOA)" is BC's clinic front-desk role.
  { pattern: new RegExp(String.raw`\b(${ADMIN_ROLE})\b`), category: 'admin_clerical' },
];

/** Returns null when no rule matches. Never guess a category. */
export function classify(title: string): Category | null {
  const normalized = normalizeTitle(title);
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.category;
  }
  return null;
}
