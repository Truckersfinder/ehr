import type { ClinicalFormTemplateKind } from "./schema";

/** Normalize DB/API values to `form` | `consent` (case-insensitive, trims). */
export function normalizeClinicalFormTemplateKind(raw: unknown): ClinicalFormTemplateKind {
  const s = raw == null ? "" : String(raw).trim().toLowerCase();
  return s === "consent" ? "consent" : "form";
}

/**
 * Read kind from a clinical form row (camelCase from Drizzle, or snake_case from raw JSON).
 * Prefer `template_kind` when both are present so the DB column wins over any stale camelCase field.
 */
export function clinicalTemplateKindFromRow(row: {
  templateKind?: unknown;
  template_kind?: unknown;
}): ClinicalFormTemplateKind {
  const snake = row.template_kind;
  const camel = row.templateKind;
  const raw =
    snake !== undefined && snake !== null && String(snake).trim() !== ""
      ? snake
      : camel !== undefined && camel !== null && String(camel).trim() !== ""
        ? camel
        : snake ?? camel;
  return normalizeClinicalFormTemplateKind(raw);
}
