/** Default family relationship options; users can add "Other" with custom name. */
export const FAMILY_RELATIONSHIPS = ["Father", "Mother", "Sister", "Brother"] as const;

/** Common inherited/familial conditions relevant to the African context (plus Other). */
export const COMMON_INHERITED_CONDITIONS_AFRICA = [
  "Sickle cell disease",
  "Sickle cell trait",
  "Thalassemia",
  "G6PD deficiency",
  "Hypertension",
  "Diabetes type 2",
  "Heart disease",
  "Stroke",
  "Cancer",
  "Kidney disease",
  "Glaucoma",
  "Asthma",
  "Obesity",
  "Tuberculosis (family exposure)",
  "Other",
] as const;
