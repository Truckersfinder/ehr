import type { PatientDocument } from "./schema";

/** API / DB may expose either camelCase or snake_case for this column */
export type PatientDocumentRow = PatientDocument & { record_document_type?: string | null };

export function getRecordDocumentTypeId(doc: PatientDocumentRow): string | undefined {
  const v = doc.recordDocumentType ?? doc.record_document_type;
  if (v == null || String(v).trim() === "") return undefined;
  return String(v).trim();
}

export function normalizePatientDocumentRow<T extends PatientDocumentRow>(row: T): PatientDocument {
  const recordDocumentType = getRecordDocumentTypeId(row) ?? null;
  return { ...row, recordDocumentType } as PatientDocument;
}
