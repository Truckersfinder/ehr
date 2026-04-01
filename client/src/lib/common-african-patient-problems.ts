/**
 * Common active problems seen across African clinical settings (communicable disease,
 * maternal/child health, NCDs, and regionally prevalent conditions). Not the same list as
 * family-history inherited conditions — this is for the patient problem list.
 * Sorted alphabetically (except "Other" last).
 */
export const COMMON_AFRICAN_PATIENT_PROBLEMS = [
  "Acute gastroenteritis",
  "Acute malnutrition (severe)",
  "Alcohol use disorder",
  "Anemia",
  "Anxiety disorder",
  "Asthma",
  "Atrial fibrillation",
  "Bacterial meningitis",
  "Bronchiolitis (pediatric)",
  "Cervical cancer (suspected or known)",
  "Chronic kidney disease",
  "Chronic obstructive pulmonary disease (COPD)",
  "Congenital heart disease",
  "Congestive heart failure",
  "Coronary artery disease / angina",
  "COVID-19",
  "Deep vein thrombosis / pulmonary embolism",
  "Dengue fever (where relevant)",
  "Depression",
  "Diabetes mellitus type 1",
  "Diabetes mellitus type 2",
  "Epilepsy / seizure disorder",
  "Esophageal or gastric cancer (suspected or known)",
  "Family planning / contraception counseling",
  "Gastro-esophageal reflux disease (GERD)",
  "Heart failure",
  "Hepatitis B (chronic or acute)",
  "Hepatitis C (chronic or acute)",
  "HIV infection",
  "Human African trypanosomiasis (sleeping sickness) — exposure or suspected",
  "Hypertension",
  "Hypothyroidism",
  "Influenza or influenza-like illness",
  "Liver cirrhosis",
  "Lower respiratory tract infection (pneumonia)",
  "Lymphatic filariasis — chronic complications",
  "Malaria (confirmed or suspected)",
  "Maternal anemia (pregnancy)",
  "Meningitis (acute)",
  "Neonatal sepsis or infection (suspected)",
  "Obesity",
  "Osteoarthritis",
  "Peptic ulcer disease",
  "Pneumonia (adult)",
  "Postpartum hemorrhage — history or risk",
  "Pre-eclampsia / eclampsia — history or current",
  "Pregnancy — routine antenatal care",
  "Prostate cancer (suspected or known)",
  "Pulmonary tuberculosis (active or suspected)",
  "Rheumatic heart disease",
  "Schistosomiasis — chronic complications",
  "Sickle cell disease",
  "Sickle cell trait",
  "Stroke (ischemic or hemorrhagic)",
  "Substance use disorder (non-alcohol)",
  "Syphilis",
  "Trachoma — chronic complications",
  "Tuberculosis (extrapulmonary)",
  "Typhoid fever",
  "Upper respiratory tract infection",
  "Urinary tract infection",
  "Other",
] as const;

export function joinAfricanPatientProblem(select: string, other: string): string {
  if (!select) return "";
  if (select === "Other") return other.trim();
  return select;
}

export function splitAfricanPatientProblem(stored: string): { select: string; other: string } {
  const all = COMMON_AFRICAN_PATIENT_PROBLEMS as readonly string[];
  const t = stored.trim();
  if (!t) return { select: "", other: "" };
  if (all.includes(t)) {
    return t === "Other" ? { select: "Other", other: "" } : { select: t, other: "" };
  }
  return { select: "Other", other: t };
}
