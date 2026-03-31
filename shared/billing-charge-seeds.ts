import type { InsertBillingChargeCatalog } from "./schema";
import {
  COMMON_LAB_TESTS_ORDERABLE,
  labOrderCatalogItemKeyFromTestCode,
} from "./common-lab-tests";

/** Default KES unit price per test code (clinician orderable list). */
const LAB_ORDER_UNIT_PRICE_KES: Record<string, string> = {
  CBC: "800",
  "MAL-RDT": "400",
  "MAL-SMEAR": "500",
  "HIV-VL": "3500",
  CD4: "1200",
  "HIV-RAPID": "350",
  LFT: "900",
  RFT: "900",
  "GLU-F": "300",
  "GLU-R": "300",
  HBA1C: "1100",
  UA: "500",
  "STOOL-OP": "600",
  "TB-XPERT": "1800",
  "SPUTUM-AFB": "450",
  "BLOOD-CULT": "1400",
  "URINE-CULT": "1100",
  "U&E": "850",
  LIPID: "900",
  TSH: "950",
  HBSAG: "600",
  "HCV-AB": "800",
  "HCG-U": "350",
  HB: "400",
  WIDAL: "550",
};

export function labOrderDefaultUnitPriceKes(testCode: string): string {
  return LAB_ORDER_UNIT_PRICE_KES[testCode] ?? "800";
}

export function buildLabOrderBillingChargeSeeds(): InsertBillingChargeCatalog[] {
  return COMMON_LAB_TESTS_ORDERABLE.map((t, i) => ({
    category: "lab_order",
    itemKey: labOrderCatalogItemKeyFromTestCode(t.testCode),
    label: t.testName,
    unitPrice: labOrderDefaultUnitPriceKes(t.testCode),
    sortOrder: (i + 1) * 10,
  }));
}

/** Rows merged into existing catalogs (idempotent) so new price keys exist after upgrades. */
export const VISIT_CHARGE_EXTRA_CATALOG_ROWS: InsertBillingChargeCatalog[] = [
  { category: "clinical_charge", itemKey: "visit_type_outpatient", label: "Visit — outpatient", unitPrice: "2500", sortOrder: 3 },
  { category: "clinical_charge", itemKey: "visit_type_inpatient", label: "Visit — inpatient", unitPrice: "5000", sortOrder: 4 },
  { category: "clinical_charge", itemKey: "visit_type_emergency", label: "Visit — emergency", unitPrice: "4000", sortOrder: 5 },
  { category: "imaging", itemKey: "imaging_default", label: "Imaging study (unspecified modality)", unitPrice: "1800", sortOrder: 110 },
];

/** Default catalog rows seeded when `billing_charge_catalog` is empty. */
export const BILLING_CHARGE_CATALOG_SEEDS: InsertBillingChargeCatalog[] = [
  ...buildLabOrderBillingChargeSeeds(),
  // Medication orders
  { category: "medication", itemKey: "oral_course", label: "Oral medication (per course)", unitPrice: "400", sortOrder: 10 },
  { category: "medication", itemKey: "injectable", label: "Injectable medication (per dose)", unitPrice: "600", sortOrder: 20 },
  { category: "medication", itemKey: "iv_infusion_day", label: "IV infusion (per day)", unitPrice: "3500", sortOrder: 30 },
  { category: "medication", itemKey: "topical", label: "Topical preparation", unitPrice: "350", sortOrder: 40 },
  { category: "medication", itemKey: "chronic_refill_90", label: "Chronic refill (90-day supply)", unitPrice: "500", sortOrder: 50 },
  { category: "medication", itemKey: "controlled_dispensing", label: "Controlled substance dispensing fee", unitPrice: "250", sortOrder: 60 },
  { category: "medication", itemKey: "compounding", label: "Compounding fee", unitPrice: "800", sortOrder: 70 },
  { category: "medication", itemKey: "vaccine_admin", label: "Vaccine administration", unitPrice: "450", sortOrder: 80 },
  // Imaging orders
  { category: "imaging", itemKey: "xr_single", label: "X-ray (single view)", unitPrice: "1800", sortOrder: 10 },
  { category: "imaging", itemKey: "xr_two_views", label: "X-ray (two views)", unitPrice: "2400", sortOrder: 20 },
  { category: "imaging", itemKey: "ct_no_contrast", label: "CT scan (without contrast)", unitPrice: "8500", sortOrder: 30 },
  { category: "imaging", itemKey: "ct_with_contrast", label: "CT scan (with contrast)", unitPrice: "12000", sortOrder: 40 },
  { category: "imaging", itemKey: "mri", label: "MRI", unitPrice: "18000", sortOrder: 50 },
  { category: "imaging", itemKey: "ultrasound", label: "Ultrasound", unitPrice: "4500", sortOrder: 60 },
  { category: "imaging", itemKey: "mammography", label: "Mammography", unitPrice: "5500", sortOrder: 70 },
  { category: "imaging", itemKey: "echo", label: "Echocardiography", unitPrice: "6500", sortOrder: 80 },
  { category: "imaging", itemKey: "pet_ct", label: "PET-CT", unitPrice: "45000", sortOrder: 90 },
  { category: "imaging", itemKey: "dexa", label: "DEXA bone density", unitPrice: "4000", sortOrder: 100 },
  ...VISIT_CHARGE_EXTRA_CATALOG_ROWS,
  // Problem list
  { category: "problem_list", itemKey: "new_problem_doc", label: "New problem — documentation", unitPrice: "600", sortOrder: 10 },
  { category: "problem_list", itemKey: "chronic_annual_review", label: "Chronic problem — annual review", unitPrice: "900", sortOrder: 20 },
  { category: "problem_list", itemKey: "data_quality_review", label: "Problem data quality review", unitPrice: "400", sortOrder: 30 },
  { category: "problem_list", itemKey: "problem_resolved", label: "Problem resolved — closure", unitPrice: "350", sortOrder: 40 },
  { category: "problem_list", itemKey: "problem_transfer", label: "Problem transferred — handoff", unitPrice: "500", sortOrder: 50 },
  { category: "problem_list", itemKey: "multiple_problems_addon", label: "Multiple problems — complex visit add-on", unitPrice: "750", sortOrder: 60 },
  // Clinical charges
  { category: "clinical_charge", itemKey: "visit_new_patient", label: "Office visit — new patient", unitPrice: "3500", sortOrder: 10 },
  { category: "clinical_charge", itemKey: "visit_established", label: "Office visit — established", unitPrice: "2500", sortOrder: 20 },
  { category: "clinical_charge", itemKey: "nurse_triage", label: "Nurse triage / assessment", unitPrice: "1200", sortOrder: 30 },
  { category: "clinical_charge", itemKey: "specialist_consult", label: "Specialist consultation", unitPrice: "5500", sortOrder: 40 },
  { category: "clinical_charge", itemKey: "procedure_room_15", label: "Procedure room time (per 15 min)", unitPrice: "800", sortOrder: 50 },
  { category: "clinical_charge", itemKey: "injection_immunization", label: "Injection / immunization", unitPrice: "500", sortOrder: 60 },
  { category: "clinical_charge", itemKey: "wound_care", label: "Wound care / dressing", unitPrice: "900", sortOrder: 70 },
  { category: "clinical_charge", itemKey: "ecg_12lead", label: "ECG (12-lead)", unitPrice: "1500", sortOrder: 80 },
  { category: "clinical_charge", itemKey: "nebulizer", label: "Nebulizer treatment", unitPrice: "600", sortOrder: 90 },
  { category: "clinical_charge", itemKey: "observation_hour", label: "Observation bed (per hour)", unitPrice: "2000", sortOrder: 100 },
];
