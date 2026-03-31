/**
 * Orderable lab tests (same list as the patient chart / lab order UI).
 * Keep in sync with billing `lab_order` catalog via `buildLabOrderBillingChargeSeeds` + sync.
 */
export const COMMON_LAB_TESTS_ORDERABLE: { testName: string; testCode: string }[] = [
  { testName: "Full blood count (FBC)", testCode: "CBC" },
  { testName: "Malaria RDT", testCode: "MAL-RDT" },
  { testName: "Malaria blood smear", testCode: "MAL-SMEAR" },
  { testName: "HIV viral load", testCode: "HIV-VL" },
  { testName: "CD4 count", testCode: "CD4" },
  { testName: "HIV rapid test", testCode: "HIV-RAPID" },
  { testName: "Liver function tests (LFT)", testCode: "LFT" },
  { testName: "Renal function tests (RFT)", testCode: "RFT" },
  { testName: "Blood glucose (fasting)", testCode: "GLU-F" },
  { testName: "Blood glucose (random)", testCode: "GLU-R" },
  { testName: "HbA1c", testCode: "HBA1C" },
  { testName: "Urinalysis", testCode: "UA" },
  { testName: "Stool O&P", testCode: "STOOL-OP" },
  { testName: "TB GeneXpert", testCode: "TB-XPERT" },
  { testName: "Sputum AFB smear", testCode: "SPUTUM-AFB" },
  { testName: "Blood culture", testCode: "BLOOD-CULT" },
  { testName: "Urine culture", testCode: "URINE-CULT" },
  { testName: "Serum electrolytes (U&E)", testCode: "U&E" },
  { testName: "Lipid profile", testCode: "LIPID" },
  { testName: "TSH", testCode: "TSH" },
  { testName: "HBsAg", testCode: "HBSAG" },
  { testName: "HCV antibody", testCode: "HCV-AB" },
  { testName: "Pregnancy test (urine)", testCode: "HCG-U" },
  { testName: "Haemoglobin", testCode: "HB" },
  { testName: "Widal test", testCode: "WIDAL" },
];

/** Stable key for `billing_charge_catalog.item_key` (matches test code semantics). */
export function labOrderCatalogItemKeyFromTestCode(testCode: string): string {
  const s = testCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "lab";
}
