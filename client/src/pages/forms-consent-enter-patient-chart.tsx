import { useEffect } from "react";
import { useLocation } from "wouter";
import { PATIENT_CHART_FORMS_CONSENT_TAB } from "@/components/patient-chart-review-constants";

/**
 * Legacy URLs `/forms` and `/forms-activity` should not show a standalone workspace.
 * Send the user into the patient chart on the Forms & Consent tab when a patient id is known
 * (`?patientId=` or session), otherwise to patient search.
 */
export default function FormsConsentEnterPatientChart() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(
      typeof window !== "undefined" && window.location.search?.length
        ? window.location.search.slice(1)
        : "",
    );
    const fromQuery = params.get("patientId")?.trim();
    const fromSession = sessionStorage.getItem("ehr_active_patient_id")?.trim();
    const patientId = fromQuery || fromSession || "";
    if (patientId) {
      setLocation(`/patients/${patientId}?tab=${PATIENT_CHART_FORMS_CONSENT_TAB}`);
      return;
    }
    setLocation("/patients");
  }, [setLocation]);

  return (
    <div
      className="flex min-h-[40vh] items-center justify-center p-6 text-muted-foreground text-sm"
      role="status"
    >
      Opening Forms &amp; Consent in the patient chart…
    </div>
  );
}
