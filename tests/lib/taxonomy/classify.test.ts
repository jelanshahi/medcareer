import { describe, it, expect } from 'vitest';
import { classify } from '@/lib/taxonomy/classify';

describe('classify', () => {
  it('classifies nursing titles, including abbreviations', () => {
    expect(classify('Registered Nurse - Hemodialysis Unit - CP2 (GEN)')).toBe('nursing');
    expect(classify('RN - Emergency (Req #12345)')).toBe('nursing');
    expect(classify('Registered Practical Nurse - 3MBW CCC (CEN)')).toBe('nursing');
  });

  it('classifies allied health', () => {
    expect(classify('Occupational Therapist - ACTT')).toBe('allied_health');
  });

  it('classifies paramedic and EMS roles, including supervisors', () => {
    expect(classify('Primary Care Paramedic')).toBe('paramedics');
    expect(classify('Advanced Care Paramedic - Metro')).toBe('paramedics');
    expect(classify('Emergency Med Responder')).toBe('paramedics');
    expect(classify('Paramedic Supervisor')).toBe('paramedics');
  });

  it('classifies Alberta Health Services title variants', () => {
    expect(classify('Speech Pathologist II')).toBe('allied_health');
    expect(classify('Therapy Assistant')).toBe('allied_health');
    expect(classify('Cardiovascular Perfusionist I')).toBe('allied_health');
    expect(classify('Psychologist II')).toBe('mental_health');
    expect(classify('Nuclear Medicine Technologist I')).toBe('diagnostics_lab');
    expect(classify('Combined Laboratory / X-Ray Technologist I')).toBe('diagnostics_lab');
  });

  it('prefers mental health over allied health for psychiatric roles', () => {
    expect(classify('Social Worker, Acute Mental Health')).toBe('mental_health');
  });

  it('classifies support care', () => {
    expect(classify('PSW - Nights')).toBe('support_care');
  });

  it('classifies admin and clerical', () => {
    expect(classify('Unit Secretary, Diabetes and Pediatric Ambulatory Clinics (CUPE) - Casual'))
      .toBe('admin_clerical');
  });

  it('classifies research', () => {
    expect(classify('Postdoctoral Fellow | Temporary Full Time (1.0 FTE) | CHEO Research Institute'))
      .toBe('research');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(classify('Weekend Switchboard Operator, Information Services')).toBeNull();
  });

  it('routes department-qualified management titles to management, not the specialty', () => {
    expect(classify('Manager, Diagnostic Imaging')).toBe('management');
    expect(classify('Laboratory Manager')).toBe('management');
    expect(classify('Manager, Clinical Research')).toBe('management');
  });

  it('routes department-qualified clerical titles to admin, not the specialty', () => {
    expect(classify('Secretary, Pharmacy')).toBe('admin_clerical');
    expect(classify('Unit Clerk, Diagnostic Imaging')).toBe('admin_clerical');
  });

  it('treats a physician assistant as allied health, not a physician', () => {
    expect(classify('Physician Assistant')).toBe('allied_health');
  });

  it('routes social workers by context, not by profession alone', () => {
    expect(classify('Social Worker, Oncology')).toBe('allied_health');
    expect(classify('Social Worker, Acute Mental Health')).toBe('mental_health');
  });

  it('keeps nursing leadership in nursing, where nurses look for it', () => {
    expect(classify('Nurse Manager')).toBe('nursing');
  });

  it('routes department- and institution-qualified titles away from specialties', () => {
    expect(classify('Medical Laboratory Manager')).toBe('management');
    expect(classify('Administrative Assistant, CHEO Research Institute')).toBe('admin_clerical');
    expect(classify('Manager, Emergency Preparedness and Crisis Response')).toBe('management');
  });

  it('treats "physician" used as a modifier as not a physician role', () => {
    expect(classify('Physician Recruitment Coordinator')).not.toBe('physicians');
    expect(classify('Physician Liaison')).not.toBe('physicians');
    expect(classify('Staff Physician, Emergency')).toBe('physicians');
  });

  it('returns null rather than guessing for roles outside the taxonomy', () => {
    expect(classify('Data Scientist, Health Informatics')).toBeNull();
  });

  // Every title below is a real posting from the live board, 22 Sep 2026.

  describe('provincial names for the PSW / HCA role', () => {
    it('reads each province’s own term as support care', () => {
      // Nova Scotia and Saskatchewan. On its own the largest uncategorised title on the
      // site: 147 jobs.
      expect(classify('Continuing Care Assistant')).toBe('support_care');
      expect(classify('Resident Assistant - Repost')).toBe('support_care');
      expect(classify('Home Care Attendant')).toBe('support_care');
      expect(classify('Community Care Assistant (Community Health Worker)')).toBe('support_care');
      expect(classify('Care Aide | Long Term Care/ Community Health')).toBe('support_care');
      expect(classify('Registered Care Aide, Med Surg')).toBe('support_care');
    });

    it('does not claim the coordinators and schedulers who share the setting', () => {
      // The role is the test, not the program it sits in.
      expect(classify('Continuing Care Coordinator - Continuing Care')).not.toBe('support_care');
      expect(classify('Coordinator, Home Support Scheduling')).not.toBe('support_care');
    });
  });

  describe('allied health', () => {
    it('matches the rehabilitation assistant this file always named but never matched', () => {
      expect(classify('Rehabilitation Assistant')).toBe('allied_health');
      expect(classify('Rehabilitation Assistant (Occupational Therapy/Physiotherapy)')).toBe('allied_health');
      // "therapy" is inside one word here, so "therapy assistant" cannot reach it.
      expect(classify('Physiotherapy Assistant - Rehabilitation Services')).toBe('allied_health');
    });

    it('does not read an HR return-to-work consultant as rehabilitation', () => {
      expect(classify('Rehabilitation Consultant - Occupational Health, Safety & Wellness'))
        .not.toBe('allied_health');
    });

    it('covers therapeutic recreation and the other assistant roles', () => {
      expect(classify('Recreation Worker')).toBe('allied_health');
      expect(classify('Activity Worker II - The Residence in Mission')).toBe('allied_health');
      expect(classify('Communicative Disorders Assistant, Home and Community Care')).toBe('allied_health');
      expect(classify('Kinesiologist - Chronic Disease')).toBe('allied_health');
    });

    it('files a genetic counsellor as allied health, not mental health', () => {
      expect(classify('Lab-Based Genetic Counsellor, Clinical Genomics')).toBe('allied_health');
    });
  });

  describe('lab and imaging', () => {
    it('reads BC’s "radiological" and the named modalities', () => {
      expect(classify('Radiological Technologist - Royal Columbian Hospital')).toBe('diagnostics_lab');
      expect(classify('MRI Specialty Technologist, Medical Imaging')).toBe('diagnostics_lab');
      expect(classify('General Duty Cardiology Technologist')).toBe('diagnostics_lab');
      expect(classify('CV & Pacemaker Technologist')).toBe('diagnostics_lab');
      expect(classify('Laboratory Technician, Core Lab (OPSEU)')).toBe('diagnostics_lab');
    });

    it('reads a dotted M.R.T., which splits into single letters', () => {
      expect(classify('M.R.T. - Radiology, CT (CEN)')).toBe('diagnostics_lab');
    });

    it('reads "radiology technologist" alongside "radiological"', () => {
      expect(classify('General Duty Medical Radiology Technologist')).toBe('diagnostics_lab');
    });

    it('does not claim a technologist whose field is not imaging', () => {
      expect(classify('Biomedical Engineering Technologist')).not.toBe('diagnostics_lab');
    });
  });

  describe('physicians', () => {
    it('recognises specialists by name', () => {
      expect(classify('Cardiologist - Surrey Memorial Hospital')).toBe('physicians');
      expect(classify('Locum Medical Oncologist')).toBe('physicians');
      expect(classify('Interventional Radiologist, Markham Stouffville Hospital')).toBe('physicians');
      expect(classify('Obstetrician/Gynecologist, Sechelt Hospital')).toBe('physicians');
      // A physiatrist in a continuing-care program is a physician, not a care aide.
      expect(classify('Physiatrist - Complex Continuing Care, Palliative Care and Rehabilitation'))
        .toBe('physicians');
    });

    it('does not read "radiological" as a radiologist', () => {
      expect(classify('Radiological Technologist')).not.toBe('physicians');
    });

    it('keeps speech pathology in allied health, which a general "-ologist" rule would steal', () => {
      expect(classify('Speech Pathologist II')).toBe('allied_health');
    });
  });

  describe('pharmacy', () => {
    it('matches pharmacy roles, including the degree SK posts as a title', () => {
      expect(classify('Pharm D Degree')).toBe('pharmacy');
      expect(classify('Clinical Pharmacy Specialist - Vancouver General Hospital')).toBe('pharmacy');
      expect(classify('Pharmacy Practice Assistant - Public Health')).toBe('pharmacy');
    });

    it('does not claim a coordinator merely working in pharmacy', () => {
      expect(classify('Coordinator | Central Functions | Pharmacy')).not.toBe('pharmacy');
    });
  });

  describe('mental health: roles against departments', () => {
    it('reads the plural "addictions" and BC’s MHSU abbreviation', () => {
      expect(classify('Addictions Counsellor Diploma')).toBe('mental_health');
      expect(classify('MHSU Counselling & Treatment Clinician | Intake/Screening')).toBe('mental_health');
      expect(classify('Primary Care Network, MH&SU Clinician/Clinical Counsellor')).toBe('mental_health');
    });

    it('files clerks in a mental health program as admin, not as mental health', () => {
      // All three were being filed as mental health, so a seeker filtering to it saw clerks.
      expect(classify('Clerk - 4, Inpatient Pool - Medicine and Mental Health')).toBe('admin_clerical');
      expect(classify('Administrative Secretary - Child and Adolescent Mental Health Service'))
        .toBe('admin_clerical');
      expect(classify('Program Assistant (Office Admin), Child and Youth Mental Health & Substance Use'))
        .toBe('admin_clerical');
    });

    it('reads withdrawal management — detox — as an addictions service', () => {
      expect(classify('Withdrawal Management Worker')).toBe('mental_health');
      // A department phrase, so it yields to a management role like the others.
      expect(classify('Manager, Withdrawal Management Services')).toBe('management');
    });

    it('files managers of a mental health program as management', () => {
      expect(classify('Manager, Community Based Mental Health Program')).toBe('management');
      expect(classify('Clinical Director, Maternal Child and Mental Health Services')).toBe('management');
    });

    it('keeps a mental health role in mental health when it also leads', () => {
      // The role noun wins over the management word, as "Nurse Manager" stays nursing.
      expect(classify('Psychologist Supervisor')).toBe('mental_health');
    });

    it('still beats allied health, since a mental health therapist is not a generic one', () => {
      expect(classify('Youth Therapist, Substance Use Services')).toBe('mental_health');
      expect(classify('Social Worker, Acute Mental Health')).toBe('mental_health');
    });
  });

  describe('admin', () => {
    it('reads BC’s medical office assistant as clerical', () => {
      expect(classify('Medical Office Assistant (MOA) - Urgent and Primary Care Centre (UPCC)'))
        .toBe('admin_clerical');
    });
  });

  describe('the non-clinical disciplines', () => {
    it('reads food services roles', () => {
      expect(classify('Cook')).toBe('food_services');
      expect(classify('Food Services Worker II')).toBe('food_services');
      expect(classify('Dietary Aide, Bella Coola')).toBe('food_services');
      expect(classify('Diet Aide - HSC')).toBe('food_services');
      expect(classify('Hospitality Service Associate')).toBe('food_services');
      expect(classify('General Worker, Food Services')).toBe('food_services');
    });

    it('reads environmental services and housekeeping roles', () => {
      expect(classify('Environmental Services Worker')).toBe('environmental_services');
      expect(classify('Housekeeping Aide')).toBe('environmental_services');
      expect(classify('Environmental & Laundry Services Worker')).toBe('environmental_services');
      expect(classify('Environmental Service Worker | Cleaner')).toBe('environmental_services');
    });

    it('reads facilities and trades roles', () => {
      expect(classify('Maintenance Services Worker')).toBe('facilities_trades');
      expect(classify('Engineer 5th Class')).toBe('facilities_trades');
      expect(classify('4th Class Power Engineer - Maintenance and Operations')).toBe('facilities_trades');
      expect(classify('Electrician - Industrial')).toBe('facilities_trades');
      expect(classify('Biomedical Engineering Technologist')).toBe('facilities_trades');
    });

    it('reads physical security roles', () => {
      expect(classify('Security Officer')).toBe('security');
      expect(classify('Relational Security Officer')).toBe('security');
      expect(classify('Patrol Officer (Security Guard) 1')).toBe('security');
      expect(classify('Institutional Safety Officer (ISO)')).toBe('security');
    });

    it('sends their supervisors and clerks to management and admin', () => {
      // The same guard as the mental health department phrases.
      expect(classify('Food Services Supervisor')).toBe('management');
      expect(classify('Manager, Environmental Services')).toBe('management');
      expect(classify('Housekeeping Clerk')).toBe('admin_clerical');
    });

    it('lets a clinical role keep a title that also names a non-clinical department', () => {
      expect(classify('Dietitian, Nutrition and Food Services')).toBe('allied_health');
      expect(classify('Dietetic Technician - Nutrition & Food Services')).toBe('allied_health');
    });

    it('does not read a public health inspector as housekeeping', () => {
      // An Environmental Health Officer inspects restaurants and water systems.
      expect(classify('Environmental Health Officer')).not.toBe('environmental_services');
    });

    it('does not read information or cyber security as physical security', () => {
      expect(classify('Information Security Officer')).not.toBe('security');
      expect(classify('Cyber Security Officer')).not.toBe('security');
      expect(classify('IT Security Officer')).not.toBe('security');
    });

    it('does not read software or data engineers as building engineers', () => {
      expect(classify('Software Engineer')).not.toBe('facilities_trades');
      expect(classify('Data Engineer')).not.toBe('facilities_trades');
    });
  });

  it('reads the plural "psychologists" as the singular is read', () => {
    expect(classify('Psychologists - 2026-2027 Graduates')).toBe('mental_health');
  });

  it('still leaves titles alone that the words cannot settle', () => {
    // Care aide in some places, clerical in others.
    expect(classify('Unit Assistant')).toBeNull();
    // Filled by nurses or by social workers.
    expect(classify('Assessor Coordinator Degree')).toBeNull();
  });
});
