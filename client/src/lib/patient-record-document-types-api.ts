import { apiGetJson } from "@/lib/api-client";
import type { PatientRecordDocumentTypeOption } from "@shared/patient-record-document-types";

export const patientRecordDocumentTypesQueryKey = ["/api/patient-record-document-types"] as const;

export async function fetchPatientRecordDocumentTypes(token: string | null): Promise<PatientRecordDocumentTypeOption[]> {
  return apiGetJson<PatientRecordDocumentTypeOption[]>("/api/patient-record-document-types", token);
}
