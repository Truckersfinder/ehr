import type { ClinicalFormField, ClinicalFormTemplateKind } from "./schema";

/** Stable ids merged into every admin-defined form/consent template. */
export const SYSTEM_CLINICAL_FORM_FIELD_IDS = [
  "sys_mrn_number",
  "sys_first_name",
  "sys_last_name",
  "sys_date_of_birth",
] as const;

export type SystemClinicalFormFieldId = (typeof SYSTEM_CLINICAL_FORM_FIELD_IDS)[number];

const SYSTEM_LABELS = new Set(["mrn number", "first name", "last name", "date of birth"]);

export function isSystemClinicalFormFieldId(id: string): id is SystemClinicalFormFieldId {
  return (SYSTEM_CLINICAL_FORM_FIELD_IDS as readonly string[]).includes(id);
}

export function getSystemPatientClinicalFormFields(): ClinicalFormField[] {
  return [
    { id: "sys_mrn_number", label: "MRN Number", type: "text", required: true },
    { id: "sys_first_name", label: "First Name", type: "text", required: true },
    { id: "sys_last_name", label: "Last Name", type: "text", required: true },
    { id: "sys_date_of_birth", label: "Date of Birth", type: "date", required: true },
  ];
}

export const SYSTEM_CONSENT_FIELD_IDS = [
  "sys_consent_type",
  "sys_procedure_name",
  "sys_performing_clinician",
  "sys_procedure_risks_benefits",
  "sys_provider_attestation",
  "sys_patient_signature",
] as const;

export type SystemConsentFieldId = (typeof SYSTEM_CONSENT_FIELD_IDS)[number];

const CONSENT_LABELS = new Set([
  "consent type",
  "procedure name",
  "performing clinician",
  "procedure risk and benefits",
  "i attest and sign off on this consent",
  "patient signature",
]);

export function isSystemConsentFieldId(id: string): id is SystemConsentFieldId {
  return (SYSTEM_CONSENT_FIELD_IDS as readonly string[]).includes(id);
}

export function getSystemConsentClinicalFormFields(): ClinicalFormField[] {
  return [
    {
      id: "sys_consent_type",
      label: "Consent Type",
      type: "select",
      required: true,
      options: ["Procedure Consent", "Administrative Consent"],
    },
    // Provider-only fields for Procedure Consent (shown conditionally on fill UI).
    // Required is enforced at clinician-signature time (not at patient signature time).
    { id: "sys_procedure_name", label: "Procedure Name", type: "text", required: false },
    { id: "sys_performing_clinician", label: "Performing Clinician", type: "text", required: false },
    {
      id: "sys_procedure_risks_benefits",
      label: "Procedure Risk and Benefits",
      type: "textarea",
      required: false,
    },
    {
      id: "sys_provider_attestation",
      label: "I attest and sign off on this consent",
      type: "checkbox",
      required: false,
    },
    {
      id: "sys_patient_signature",
      label: "Patient Signature",
      type: "text",
      required: false,
    },
  ];
}

/**
 * Ensures the four patient identifier fields exist, are required, and appear first.
 * Drops duplicate user-defined fields that use the same ids or canonical labels.
 */
export function mergeSystemPatientFieldsIntoClinicalForm(fields: ClinicalFormField[]): ClinicalFormField[] {
  const system = getSystemPatientClinicalFormFields();
  const systemIds = new Set(system.map((f) => f.id));
  const filtered = fields.filter((f) => {
    if (systemIds.has(f.id)) return false;
    const lab = f.label.trim().toLowerCase();
    if (SYSTEM_LABELS.has(lab)) return false;
    return true;
  });
  return [...system, ...filtered];
}

/** Merges patient identifiers + (for consents) consent-type/provider-signature fields. */
export function mergeSystemFieldsIntoClinicalFormTemplate(
  kind: ClinicalFormTemplateKind,
  fields: ClinicalFormField[],
): ClinicalFormField[] {
  const withPatient = mergeSystemPatientFieldsIntoClinicalForm(fields);
  if (kind !== "consent") return withPatient;
  const consent = getSystemConsentClinicalFormFields();
  const consentIds = new Set(consent.map((f) => f.id));
  const filtered = withPatient.filter((f) => {
    if (consentIds.has(f.id)) return false;
    const lab = f.label.trim().toLowerCase();
    if (CONSENT_LABELS.has(lab)) return false;
    return true;
  });
  // Place consent type right after patient identifiers.
  const patientCount = getSystemPatientClinicalFormFields().length;
  const head = filtered.slice(0, patientCount);
  const tail = filtered.slice(patientCount);
  return [...head, ...consent, ...tail];
}
