/** When set, clinician/nurse sees full chart navigator (Review + Visit documentation). Only set after starting a visit from Schedule. */
export const CLINICIAN_VISIT_DOC_SESSION_KEY = "ehr_clinician_visit_documentation";

export function setClinicianVisitDocumentationSession(): void {
  sessionStorage.setItem(CLINICIAN_VISIT_DOC_SESSION_KEY, "1");
}

export function clearClinicianVisitDocumentationSession(): void {
  sessionStorage.removeItem(CLINICIAN_VISIT_DOC_SESSION_KEY);
}

export function readClinicianVisitDocumentationSession(): boolean {
  return sessionStorage.getItem(CLINICIAN_VISIT_DOC_SESSION_KEY) === "1";
}
