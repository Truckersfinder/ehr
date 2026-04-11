import type { ClinicalForm, ClinicalFormTemplateKind } from "@shared/schema";
import { clinicalTemplateKindFromRow } from "@shared/clinical-form-template-kind";

/** Normalize API/DB row to `form` | `consent`. */
export function getClinicalTemplateKind(
  row: ClinicalForm | { templateKind?: unknown; template_kind?: unknown },
): ClinicalFormTemplateKind {
  return clinicalTemplateKindFromRow(row);
}
