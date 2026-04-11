/**
 * Patient chart **Review** section — one place for tab values, hrefs, and UI pieces so every
 * Review item behaves like the others (`?tab=` on `/patients/:id`, same labels/icons).
 *
 * - {@link PatientChartReviewTabTriggers} — `TabsTrigger` rows inside the main chart `Tabs`.
 * - {@link PatientChartReviewNavLinks} — `Link`-based nav (e.g. full-page demographics editor).
 * - {@link PatientChartFormsConsentTab} — inline content for the `forms-consent` tab.
 */
export { PatientChartReviewTabTriggers } from "./patient-chart-review-tab-triggers";
export { PatientChartReviewNavLinks } from "./patient-chart-review-nav-links";
export { PatientChartFormsConsentTab } from "./patient-chart-forms-consent-tab";
export { PATIENT_CHART_FORMS_CONSENT_TAB, patientChartReviewHref } from "./patient-chart-review-constants";
