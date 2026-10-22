import { roleBySlug, type Role } from '@/lib/taxonomy/roles';

/**
 * Search-facing copy for the roles people search for most ("nurse jobs in Canada", "PSW
 * jobs"). A role's label is what the job is; its headline is what people type, so the
 * <title> and h1 match the query word for word. Roles without an entry use their label.
 *
 * Like lib/taxonomy/blurbs.ts, these are hand-written claims published under the site
 * owner's name: what the job is, what it is called where, and who regulates it. No pay,
 * demand or market claims — every number on a role page comes from live postings.
 */
export type Faq = { question: string; answer: string };

type RoleContent = {
  /** "PSW jobs" — followed by " in Canada" / " in Ontario". */
  headline: string;
  /** Appended to the <title> only, for the synonyms that don't fit the h1. */
  titleExtra?: string;
  /** Other URL slugs people guess or link to (/roles/psw), each redirected here. */
  aliases: string[];
  about: string;
  faqs: Faq[];
};

const APPLY_FAQ: Faq = {
  question: 'How do I apply?',
  answer:
    'Every listing links straight to the employer’s own job posting, and you apply there. MedCareer does not take ' +
    'applications or ask you to create an account, and listings are refreshed from employer career sites every six hours.',
};

const CONTENT: Record<string, RoleContent> = {
  'registered-nurse': {
    headline: 'Registered nurse (RN) jobs',
    aliases: ['rn', 'rns', 'registered-nurses'],
    about:
      'Registered nurses assess patients, plan and give care, and coordinate with the rest of the team in hospitals, ' +
      'long-term care, public health and community programs. Registered nurse is a protected title in every province ' +
      'and territory, so you need registration with the nursing regulator where you work — the College of Nurses of ' +
      'Ontario or the BC College of Nurses and Midwives, for example. Internationally educated nurses usually begin ' +
      'with the National Nursing Assessment Service (NNAS).',
    faqs: [
      {
        question: 'What is the difference between an RN and an RPN or LPN?',
        answer:
          'Both are regulated nurses. Registered nurses usually hold a bachelor’s degree in nursing and take on more ' +
          'complex and unpredictable patients; practical nurses (RPNs in Ontario, LPNs in most other provinces) hold a ' +
          'college diploma. Employers post them as separate jobs, and MedCareer lists practical nurse openings on their own page.',
      },
      {
        question: 'Do I need to be registered to work as an RN in Canada?',
        answer:
          'Yes. You must hold active registration with the nursing regulator in the province or territory where you ' +
          'practise. Postings usually ask for current registration, or eligibility for it, before a start date.',
      },
      APPLY_FAQ,
    ],
  },
  'practical-nurse': {
    headline: 'LPN and RPN jobs',
    titleExtra: 'practical nurse openings',
    aliases: ['lpn', 'rpn', 'lpns', 'rpns', 'licensed-practical-nurse', 'registered-practical-nurse', 'practical-nurses'],
    about:
      'Practical nurses are called registered practical nurses (RPNs) in Ontario and licensed practical nurses (LPNs) ' +
      'in most other provinces; Quebec’s equivalent is the infirmière auxiliaire. They work on hospital units, in ' +
      'long-term care and in the community, and like RNs they must be registered with their province’s nursing ' +
      'regulator. In the western provinces “RPN” usually means registered psychiatric nurse, a separate profession ' +
      'with its own page.',
    faqs: [
      {
        question: 'Is an RPN the same as an LPN?',
        answer:
          'In Ontario, yes: registered practical nurse is Ontario’s name for the role other provinces call licensed ' +
          'practical nurse. In British Columbia, Alberta, Saskatchewan and Manitoba, RPN normally stands for registered ' +
          'psychiatric nurse, which is a different regulated profession.',
      },
      APPLY_FAQ,
    ],
  },
  'personal-support-worker': {
    headline: 'PSW jobs',
    titleExtra: 'personal support worker & health care aide',
    aliases: ['psw', 'psws', 'hca', 'health-care-aide', 'healthcare-aide', 'health-care-assistant', 'care-aide',
      'personal-support-workers', 'continuing-care-assistant', 'cca'],
    about:
      'Personal support workers help people with bathing, dressing, eating, mobility and other daily activities in ' +
      'long-term care, hospitals, retirement homes and clients’ own homes. The job has a different name in almost ' +
      'every province: PSW in Ontario, health care aide (HCA) in Alberta and Manitoba, health care assistant or care ' +
      'aide in British Columbia, continuing care assistant (CCA) in Nova Scotia and Saskatchewan, and préposé aux ' +
      'bénéficiaires in Quebec. All of them are listed here.',
    faqs: [
      {
        question: 'Do PSWs need a certificate?',
        answer:
          'It depends on the province. In Ontario, PSW is not a regulated profession, so each employer sets its own ' +
          'certificate requirements. In British Columbia, health care assistants in publicly funded settings must be ' +
          'on the BC Care Aide & Community Health Worker Registry. Each posting states what that employer asks for.',
      },
      {
        question: 'Are PSW, HCA and care aide jobs the same?',
        answer:
          'Broadly, yes: they are regional names for the same front-line support role, and MedCareer groups them on ' +
          'this page. Training and scope differ a little between provinces, so check the posting.',
      },
      APPLY_FAQ,
    ],
  },
  'nurse-practitioner': {
    headline: 'Nurse practitioner (NP) jobs',
    aliases: ['np', 'nps', 'nurse-practitioners'],
    about:
      'Nurse practitioners are registered nurses with graduate education who can diagnose, order tests, prescribe ' +
      'and refer, in primary care clinics, hospitals and long-term care. Every province requires registration in the ' +
      'nurse practitioner class with its nursing regulator.',
    faqs: [APPLY_FAQ],
  },
};

const ALIAS_TO_ROLE = new Map(Object.entries(CONTENT).flatMap(([slug, c]) => c.aliases.map((a) => [a, slug] as const)));

/** The canonical role slug for a /roles/<alias> URL, or null when it is not an alias. */
export function roleAliasTarget(slug: string): string | null {
  return ALIAS_TO_ROLE.get(slug.toLowerCase()) ?? null;
}

/** "PSW jobs in Ontario" — the h1. */
export function roleHeading(role: Role, place: string): string {
  return `${CONTENT[role.slug]?.headline ?? `${role.label} jobs`} in ${place}`;
}

/** The <title>, before the site name: the h1 plus any synonyms it left out. */
export function roleTitle(role: Role, place: string): string {
  const extra = CONTENT[role.slug]?.titleExtra;
  return `${roleHeading(role, place)}${extra ? `: ${extra}` : ''}`;
}

export function roleAbout(role: Role): string | null {
  return CONTENT[role.slug]?.about ?? null;
}

export function roleFaqs(role: Role): Faq[] {
  return CONTENT[role.slug]?.faqs ?? [APPLY_FAQ];
}

/** Roles with hand-written content, for the home page and footer links. */
export const FEATURED_ROLES: Role[] = Object.keys(CONTENT).map((slug) => roleBySlug(slug)!);
