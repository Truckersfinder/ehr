import { z } from "zod";

/** ISO 4217 codes supported for facility billing / price lists. */
export const BILLING_CURRENCY_CODES = [
  "KES",
  "USD",
  "EUR",
  "GBP",
  "UGX",
  "TZS",
  "ZAR",
  "INR",
  "AED",
  "NGN",
  "GHS",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "JPY",
] as const;

export type BillingCurrencyCode = (typeof BILLING_CURRENCY_CODES)[number];

export const billingCurrencyCodeSchema = z.enum(BILLING_CURRENCY_CODES);

export const patchFacilityBillingBodySchema = z.object({
  billingCurrency: billingCurrencyCodeSchema,
});

export type PatchFacilityBillingBody = z.infer<typeof patchFacilityBillingBodySchema>;

const LABELS: Partial<Record<BillingCurrencyCode, string>> = {
  KES: "Kenyan shilling",
  USD: "US dollar",
  EUR: "Euro",
  GBP: "British pound",
  UGX: "Ugandan shilling",
  TZS: "Tanzanian shilling",
  ZAR: "South African rand",
  INR: "Indian rupee",
  AED: "UAE dirham",
  NGN: "Nigerian naira",
  GHS: "Ghanaian cedi",
  CAD: "Canadian dollar",
  AUD: "Australian dollar",
  CHF: "Swiss franc",
  CNY: "Chinese yuan",
  JPY: "Japanese yen",
};

export function billingCurrencyLabel(code: string): string {
  const c = code as BillingCurrencyCode;
  const name = LABELS[c];
  return name ? `${code} — ${name}` : code;
}
