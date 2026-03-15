/** Common dose options for medication orders (plus "Other" for free text). */
export const DOSE_OPTIONS = [
  "1mg", "2.5mg", "5mg", "10mg", "25mg", "50mg", "100mg", "250mg", "500mg",
  "1g", "2g", "5ml", "10ml", "15ml", "20ml", "Other",
] as const;

/** Common frequency options (plus "Other"). */
export const FREQUENCY_OPTIONS = [
  "once daily",
  "twice daily",
  "three times daily",
  "four times daily",
  "every 4 hours",
  "every 6 hours",
  "every 8 hours",
  "at bedtime",
  "in the morning",
  "as needed",
  "weekly",
  "every other day",
  "Other",
] as const;

/** Common duration options (plus "Other"). */
export const DURATION_OPTIONS = [
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "28 days",
  "30 days",
  "90 days",
  "ongoing",
  "Other",
] as const;
