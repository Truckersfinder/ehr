import type { ClinicalFormField } from "./schema";

type Answers = Record<string, string | number | boolean>;

export const CONSENT_PATIENT_ATTESTATION_FIELD_ID = "sys_provider_attestation";
export const CONSENT_PATIENT_SIGNATURE_FIELD_ID = "sys_patient_signature";

/**
 * Older consent templates may still include a separate "Patient Sign Off" field (e.g. select).
 * Patient signing now uses attestation + {@link CONSENT_PATIENT_SIGNATURE_FIELD_ID} only.
 *
 * Matches labels like "Patient Sign Off", "Patient sign-off", "Patient Signoff" (spacing/hyphen variants).
 * Does not match {@link CONSENT_PATIENT_SIGNATURE_FIELD_ID} (captured image).
 */
export function isLegacyPatientSignOffTemplateField(f: ClinicalFormField): boolean {
  if (f.id === CONSENT_PATIENT_SIGNATURE_FIELD_ID) return false;
  const raw = f.label.trim().replace(/\u00a0/g, " ");
  const compact = raw
    .toLowerCase()
    .replace(/[\s\-–—_.]+/g, "");
  if (compact.includes("patientsignoff")) return true;
  return /\bpatient\s+sign(?:\s|[-–—])*off\b/i.test(raw);
}

/** Drop legacy sign-off fields from validation so they cannot block QR submission. */
export function excludeLegacyPatientSignOffFieldsFromQrConsent(fields: ClinicalFormField[]): ClinicalFormField[] {
  return fields.filter((f) => !isLegacyPatientSignOffTemplateField(f));
}

export function legacyPatientSignOffFieldIds(fields: ClinicalFormField[]): string[] {
  return fields.filter(isLegacyPatientSignOffTemplateField).map((f) => f.id);
}

/** Fields used for public QR consent submit validation (all consent types). */
export function fieldsForPublicConsentQrValidation(fields: ClinicalFormField[]): ClinicalFormField[] {
  return withConsentPatientSignatureRequiredFields(excludeLegacyPatientSignOffFieldsFromQrConsent(fields));
}

export function withConsentPatientSignatureRequiredFields(fields: ClinicalFormField[]): ClinicalFormField[] {
  return fields.map((f) => {
    if (f.id === CONSENT_PATIENT_ATTESTATION_FIELD_ID) return { ...f, required: true };
    if (f.id === CONSENT_PATIENT_SIGNATURE_FIELD_ID) return { ...f, required: true };
    return f;
  });
}

export function validateConsentPatientSignature(answers: Answers): { ok: true } | { ok: false; message: string } {
  if (answers[CONSENT_PATIENT_ATTESTATION_FIELD_ID] !== true) {
    return { ok: false, message: "You must attest and sign off to submit this consent." };
  }
  const sig = String(answers[CONSENT_PATIENT_SIGNATURE_FIELD_ID] ?? "");
  if (!sig.startsWith("data:image/")) {
    return { ok: false, message: "Please add your signature to submit this consent." };
  }
  return { ok: true };
}

