import {
  PATIENT_CHART_REVIEW_ORDER,
  PATIENT_CHART_VISIT_DOC_ORDER,
} from "@shared/application-ui";
import { showFormsConsentInPatientReviewNav } from "@/lib/patient-review-forms-consent-nav";

type ActivityEntry = { id: string; label: string };

type UserLike = {
  role?: string;
  activityUi?: {
    patientChartReview: ActivityEntry[];
    patientChartVisitDoc: ActivityEntry[];
  };
};

/**
 * Review / visit-doc nav from Application configuration (`/api/auth/me` → activityUi).
 * When `activityUi` is present, use it as-is (may be empty if everything is hidden).
 * When absent (legacy), fall back to full catalog defaults.
 * Forms & Consent is omitted for roles that use Admin for templates (same as legacy nav).
 */
export function getPatientChartReviewNav(user: UserLike | null | undefined): ActivityEntry[] {
  let items: ActivityEntry[];
  if (user?.activityUi?.patientChartReview != null) {
    items = user.activityUi.patientChartReview;
  } else {
    items = PATIENT_CHART_REVIEW_ORDER.map((x) => ({ id: x.id, label: x.defaultLabel }));
  }
  if (!showFormsConsentInPatientReviewNav(user?.role)) {
    return items.filter((e) => e.id !== "pc_forms_consent");
  }
  return items;
}

export function getPatientChartVisitDocNav(user: UserLike | null | undefined): ActivityEntry[] {
  if (user?.activityUi?.patientChartVisitDoc != null) {
    return user.activityUi.patientChartVisitDoc;
  }
  return PATIENT_CHART_VISIT_DOC_ORDER.map((x) => ({ id: x.id, label: x.defaultLabel }));
}

/** Main chart `Tabs` value for a review activity id. `null` = Demographics (separate route). */
export function reviewActivityIdToMainTabValue(id: string): string | null {
  switch (id) {
    case "pc_demographics":
      return null;
    case "pc_patient_call":
      return "patient-call";
    case "pc_patient_record":
      return "patient-record";
    case "pc_overview":
      return "overview";
    case "pc_history":
      return "history";
    case "pc_immunization":
      return "immunization";
    case "pc_results":
      return "results";
    case "pc_forms_consent":
      return "forms-consent";
    default:
      return "overview";
  }
}

/** Same as embedded navigator — `?tab=` slug for visit documentation. */
export function visitDocActivityIdToTab(id: string): string {
  switch (id) {
    case "pc_allergy":
      return "allergy";
    case "pc_problems":
      return "problems";
    case "pc_vitals":
      return "vitals";
    case "pc_medication":
      return "medication";
    case "pc_orders":
      return "orders";
    case "pc_notes":
      return "notes";
    case "pc_visit_summary":
      return "visit-summary";
    default:
      return "overview";
  }
}

/** Build the set of allowed main-chart tab slugs from configured review items. */
export function reviewTabsAllowedSet(reviewNav: ActivityEntry[]): Set<string> {
  const s = new Set<string>();
  for (const e of reviewNav) {
    const t = reviewActivityIdToMainTabValue(e.id);
    if (t) s.add(t);
  }
  return s;
}

/** Build the set of allowed visit-documentation tab slugs (excludes visit-summary unless included via metadata). */
export function visitDocTabsAllowedSet(visitDocNav: ActivityEntry[], includeVisitSummary: boolean): Set<string> {
  const s = new Set<string>();
  for (const e of visitDocNav) {
    if (e.id === "pc_visit_summary") continue;
    s.add(visitDocActivityIdToTab(e.id));
  }
  if (includeVisitSummary && visitDocNav.some((e) => e.id === "pc_visit_summary")) {
    s.add("visit-summary");
  }
  return s;
}

const REVIEW_FALLBACK_ORDER = ["overview", "patient-call", "history", "immunization", "results", "forms-consent"] as const;
const DOC_FALLBACK_ORDER = ["allergy", "problems", "vitals", "medication", "orders", "notes"] as const;

/** Pick a valid main tab when the current one is not allowed (e.g. after hiding in Application configuration). */
export function pickFallbackMainTab(
  reviewSectionTabs: Set<string>,
  documentationTabs: Set<string>,
  showVisitDocumentation: boolean,
): string {
  for (const t of REVIEW_FALLBACK_ORDER) {
    if (reviewSectionTabs.has(t)) return t;
  }
  if (showVisitDocumentation) {
    for (const t of DOC_FALLBACK_ORDER) {
      if (documentationTabs.has(t)) return t;
    }
    if (documentationTabs.has("visit-summary")) return "visit-summary";
  }
  const firstReview = reviewSectionTabs.values().next().value;
  if (firstReview) return firstReview;
  if (showVisitDocumentation) {
    const firstDoc = documentationTabs.values().next().value;
    if (firstDoc) return firstDoc;
  }
  return "overview";
}
