import * as XLSX from "xlsx";
import type { InsertBillingChargeCatalog } from "@shared/schema";

const BILLING_CHARGE_CATEGORY_VALUES = [
  "lab_order",
  "medication",
  "imaging",
  "problem_list",
  "clinical_charge",
] as const;

export type BillingChargeCategoryValue = (typeof BILLING_CHARGE_CATEGORY_VALUES)[number];

export function isBillingChargeCategory(s: string): s is BillingChargeCategoryValue {
  return (BILLING_CHARGE_CATEGORY_VALUES as readonly string[]).includes(s);
}

function normalizeHeaderKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

function headerRole(norm: string): "key" | "label" | "price" | null {
  if (norm === "item_key" || norm === "key" || norm === "code" || norm === "test_code") return "key";
  if (
    norm === "label" ||
    norm === "display_name" ||
    norm === "name" ||
    norm === "item" ||
    norm === "title" ||
    norm === "description" ||
    norm === "display_name"
  )
    return "label";
  if (norm.includes("price") || norm === "kes" || norm === "amount" || norm === "cost" || norm === "unit_price")
    return "price";
  return null;
}

function normalizeItemKey(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "item";
}

function parsePrice(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value * 100) / 100);
  const s = String(value).trim().replace(/,/g, "").replace(/^kes\s*/i, "").trim();
  const n = parseFloat(s);
  if (Number.isNaN(n)) return "";
  return String(Math.round(n * 100) / 100);
}

/**
 * Parses first sheet of an .xlsx/.xls file.
 * First row must be headers. Use columns such as:
 * Item key | Item / Label | Price (KES)
 * Or: key | label | unit_price
 * If only two columns are detected: key | price (label defaults from key).
 */
export function parseBillingChargeXlsxBuffer(buffer: Buffer, category: BillingChargeCategoryValue): InsertBillingChargeCatalog[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const name = wb.SheetNames[0];
  if (!name) throw new Error("Workbook has no sheets");
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("Sheet is empty");

  const first = rows[0];
  const rawKeys = Object.keys(first).filter((k) => k != null && String(k).trim() !== "");
  const keyMap = new Map<string, "key" | "label" | "price">();
  for (const k of rawKeys) {
    const nk = normalizeHeaderKey(k);
    const role = headerRole(nk);
    if (role) keyMap.set(k, role);
  }

  let keyCol: string | undefined;
  let labelCol: string | undefined;
  let priceCol: string | undefined;
  for (const [k, role] of Array.from(keyMap.entries())) {
    if (role === "key") keyCol = k;
    if (role === "label") labelCol = k;
    if (role === "price") priceCol = k;
  }

  if (!keyCol && rawKeys.length >= 3) {
    keyCol = rawKeys[0];
    labelCol = rawKeys[1];
    priceCol = rawKeys[2];
  } else if (!keyCol && rawKeys.length === 2) {
    keyCol = rawKeys[0];
    priceCol = rawKeys[1];
  }

  if (!keyCol || !priceCol) {
    throw new Error(
      "Could not detect columns. Use a header row with: Item key (or key), Item / Label, Price (KES), or three columns in that order.",
    );
  }

  const out: InsertBillingChargeCatalog[] = [];
  let sortOrder = 10;

  for (const row of rows) {
    const keyRaw = String(row[keyCol] ?? "").trim();
    if (!keyRaw) continue;

    const itemKey = normalizeItemKey(keyRaw);
    const labelRaw = labelCol ? String(row[labelCol] ?? "").trim() : "";
    const label = labelRaw || itemKey.replace(/_/g, " ");
    const priceStr = parsePrice(row[priceCol]);
    if (!priceStr) continue;

    out.push({
      category,
      itemKey,
      label,
      unitPrice: priceStr,
      sortOrder,
    });
    sortOrder += 10;
  }

  if (!out.length) throw new Error("No data rows with a key and price were found.");

  const byKey = new Map<string, InsertBillingChargeCatalog>();
  for (const r of out) {
    byKey.set(r.itemKey, r);
  }
  const merged = Array.from(byKey.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return merged.map((r, i) => ({ ...r, sortOrder: (i + 1) * 10 }));
}
