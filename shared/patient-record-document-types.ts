/**
 * Controlled vocabulary for general documents filed in the medical record
 * (outside lab orders / imaging orders). Served via GET /api/patient-record-document-types.
 */
export type PatientRecordDocumentTypeOption = {
  id: string;
  label: string;
};

export const PATIENT_RECORD_DOCUMENT_TYPES: PatientRecordDocumentTypeOption[] = [
  { id: "referral_letter", label: "Referral letter" },
  { id: "consent_authorization", label: "Consent / authorization" },
  { id: "advance_directive", label: "Advance directive / living will" },
  { id: "insurance_coverage", label: "Insurance / coverage document" },
  { id: "identification_verification", label: "Identification / verification" },
  { id: "discharge_summary_external", label: "Discharge summary (external facility)" },
  { id: "operative_report_external", label: "Operative report (external)" },
  { id: "pathology_report_external", label: "Pathology report (external)" },
  { id: "radiology_report_external", label: "Radiology report (external)" },
  { id: "clinical_correspondence", label: "Clinical correspondence / letters" },
  { id: "vaccination_record", label: "Vaccination / immunization record" },
  { id: "medical_history_external", label: "Medical history summary (external)" },
  { id: "clinical_photograph", label: "Clinical photograph" },
  { id: "occupational_school_form", label: "Occupational health / school form" },
  { id: "legal_custody", label: "Legal / custody document" },
  { id: "pharmacy_medication_list", label: "Pharmacy / medication list (external)" },
  { id: "durable_medical_equipment", label: "DME / equipment documentation" },
  { id: "other_medical", label: "Other medical document" },
];

const IDS = new Set(PATIENT_RECORD_DOCUMENT_TYPES.map((t) => t.id));

export function isValidPatientRecordDocumentTypeId(id: string): boolean {
  return IDS.has(id);
}
