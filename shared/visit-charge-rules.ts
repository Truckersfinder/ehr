/**
 * Pure rules for mapping clinical orders / encounters to billing_charge_catalog keys.
 * Server code should call these and then resolve prices from the DB — keeps pricing logic
 * centralized when order UIs or payloads change.
 */
import { labOrderCatalogItemKeyFromTestCode } from "./common-lab-tests";

/** sourceId for the single per-encounter visit-type line. */
export const VISIT_TYPE_CHARGE_SOURCE_ID = "__visit_type__";

export function isExternalOrder(internalExternal: string | null | undefined): boolean {
  return String(internalExternal ?? "")
    .trim()
    .toLowerCase() === "external";
}

/** Maps encounters.type to clinical_charge catalog item_key (see billing-charge-seeds). */
export function visitTypeCatalogItemKey(encounterType: string | null | undefined): string {
  const t = String(encounterType ?? "outpatient")
    .trim()
    .toLowerCase();
  if (t === "inpatient") return "visit_type_inpatient";
  if (t === "emergency") return "visit_type_emergency";
  return "visit_type_outpatient";
}

export function labCatalogItemKeyFromOrder(testCode: string | null | undefined, testName: string | null | undefined): string {
  const code = testCode?.trim();
  if (code) return labOrderCatalogItemKeyFromTestCode(code);
  return labOrderCatalogItemKeyFromTestCode(testName?.trim() || "lab");
}

/**
 * Maps imaging modality / title to imaging catalog item_key.
 * Extend modalityKeywords when new modalities appear in the UI.
 */
export function imagingCatalogItemKeyFromOrder(modality: string, title?: string | null): string {
  const blob = `${modality} ${title ?? ""}`.trim().toLowerCase();
  const m = modality.trim().toLowerCase();

  if (blob.includes("pet") && blob.includes("ct")) return "pet_ct";
  if (blob.includes("dexa") || blob.includes("bone dens")) return "dexa";
  if (m.includes("mamm") || blob.includes("mamm")) return "mammography";
  if (blob.includes("echo") || blob.includes("echocardi")) return "echo";
  if (m.includes("mri") || blob.includes("mri")) return "mri";
  if (blob.includes("ct") && (blob.includes("contrast") || blob.includes("+c"))) return "ct_with_contrast";
  if (m.includes("ct") || blob.includes("ct scan")) return "ct_no_contrast";
  if (m.includes("us") || m.includes("ultra") || blob.includes("ultrasound")) return "ultrasound";
  if (m.includes("x-ray") || m.includes("xray") || m === "xr" || blob.includes("x-ray")) {
    if (blob.includes("two") || blob.includes("2 view") || blob.includes("bilateral")) return "xr_two_views";
    return "xr_single";
  }
  return "imaging_default";
}

/** Default medication line when no structured type exists on the prescription. */
export function medicationCatalogItemKeyFromPrescription(): string {
  return "oral_course";
}

export function isClinicAdministeredMedicationOrder(orderType: string | null | undefined): boolean {
  const t = String(orderType ?? "")
    .trim()
    .toLowerCase();
  return t === "administered" || t === "clinic" || t === "hospital" || t === "clinic/hospital_administered";
}

export function formatMoneyAmount(unitPrice: string, quantity: number): string {
  const u = Number(unitPrice);
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  if (Number.isNaN(u)) return "0";
  return String(Math.round(u * q * 100) / 100);
}
