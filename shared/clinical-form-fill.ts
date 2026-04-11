import type { ClinicalFormField } from "./schema";

export type PatientIdentifierPrefill = {
  /** Organization patient identifier (e.g. MRN). */
  patientIdentifier: string;
  firstName: string;
  lastName: string;
  /** ISO date YYYY-MM-DD for `type: "date"` inputs. */
  dateOfBirth: string;
};

/** Normalize DB/API date values for HTML date inputs. */
export function formatPatientDateOfBirthForFormPrefill(d: unknown): string {
  if (d == null || d === "") return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/**
 * Maps template fields to patient identifier / name / DOB using stable system field ids and common labels.
 */
export function inferClinicalFormPrefill(
  fields: ClinicalFormField[],
  patient: PatientIdentifierPrefill,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.id === "sys_mrn_number") {
      out[f.id] = patient.patientIdentifier;
      continue;
    }
    if (f.id === "sys_first_name") {
      out[f.id] = patient.firstName;
      continue;
    }
    if (f.id === "sys_last_name") {
      out[f.id] = patient.lastName;
      continue;
    }
    if (f.id === "sys_date_of_birth") {
      out[f.id] = patient.dateOfBirth;
      continue;
    }
    if (f.type === "date") {
      const raw = f.label.trim();
      const label = raw.toLowerCase();
      if (
        /^(dob|date of birth|birthdate|birth date)$/i.test(raw) ||
        label === "date of birth" ||
        /\b(dob|birth\s*date)\b/i.test(label)
      ) {
        out[f.id] = patient.dateOfBirth;
      }
      continue;
    }
    if (f.type !== "text" && f.type !== "textarea" && f.type !== "number") continue;
    const raw = f.label.trim();
    const label = raw.toLowerCase();
    let v: string | undefined;
    if (
      /^(mrn|medical\s*record(\s*(number|no\.?))?|patient\s*(id|identifier|number)|record\s*#|identifier)/i.test(
        raw,
      ) ||
      /\bmrn\b/i.test(label) ||
      (label.includes("patient") && label.includes("id"))
    ) {
      v = patient.patientIdentifier;
    } else if (/^first(\s*name)?$/i.test(raw) || /^given(\s*name)?$/i.test(raw) || label === "first name") {
      v = patient.firstName;
    } else if (
      /^last(\s*name)?$/i.test(raw) ||
      /^surname$/i.test(raw) ||
      /^family(\s*name)?$/i.test(raw) ||
      label === "last name"
    ) {
      v = patient.lastName;
    }
    if (v !== undefined) out[f.id] = v;
  }
  return out;
}

export function validateAndNormalizeClinicalFormAnswers(
  fields: ClinicalFormField[],
  raw: Record<string, unknown>,
):
  | { ok: true; answers: Record<string, string | number | boolean> }
  | { ok: false; message: string } {
  const answers: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const key = f.id;
    const val = raw[key];
    if (f.type === "checkbox") {
      const b = val === true || val === false ? val : undefined;
      if (f.required && b !== true) {
        return { ok: false, message: `“${f.label}” must be checked to continue.` };
      }
      if (b === undefined) {
        if (f.required) {
          return { ok: false, message: `“${f.label}” must be checked to continue.` };
        }
        continue;
      }
      if (typeof val !== "boolean") {
        return { ok: false, message: `“${f.label}” must be checked or unchecked.` };
      }
      answers[key] = val;
      continue;
    }
    const empty =
      val === undefined ||
      val === null ||
      val === "" ||
      (typeof val === "string" && val.trim() === "");
    if (empty) {
      if (f.required) {
        return { ok: false, message: `“${f.label}” is required.` };
      }
      continue;
    }
    if (f.type === "number") {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isNaN(n)) {
        return { ok: false, message: `“${f.label}” must be a number.` };
      }
      answers[key] = n;
      continue;
    }
    if (f.type === "date") {
      const s = String(val).trim();
      answers[key] = s;
      continue;
    }
    if (f.type === "select") {
      const s = String(val).trim();
      if (f.options && !f.options.includes(s)) {
        return { ok: false, message: `Invalid choice for “${f.label}”.` };
      }
      answers[key] = s;
      continue;
    }
    answers[key] = String(val).trim();
  }
  return { ok: true, answers };
}
