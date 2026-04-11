/** Tab value for Review → Forms & Consent (patient chart `?tab=`). */
export const PATIENT_CHART_FORMS_CONSENT_TAB = "forms-consent" as const;

/**
 * Radix {@link TabsTrigger} defaults use `inline-flex` + `justify-center`, which makes the active
 * highlight narrower than the nav column for long labels. Use this for all vertical chart sidebar triggers.
 */
export const PATIENT_CHART_SIDEBAR_TAB_TRIGGER_CLASS =
  "flex w-full min-w-0 items-center justify-start gap-2 rounded-md px-3 py-2 h-auto text-left text-sm font-medium shadow-none " +
  "bg-transparent hover:bg-accent hover:text-foreground " +
  "data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:font-medium data-[state=active]:shadow-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function patientChartReviewHref(patientId: string, tab: string): string {
  if (tab === "demographics") {
    return `/patients/${patientId}/demographics`;
  }
  return `/patients/${patientId}?tab=${encodeURIComponent(tab)}`;
}
