import { ClinicalFormsTemplatesCard } from "@/components/clinical-forms-templates-card";
import { ClinicalFormCompletionsList } from "@/components/clinical-form-completions-list";
import { ProcedureConsentsPendingProviderSignatureList } from "@/components/procedure-consents-pending-provider-signature-list";

/**
 * Review → Forms & Consent: same tab shell as Overview / History (stays on the patient chart).
 */
export function PatientChartFormsConsentTab({ patientId }: { patientId: string }) {
  return (
    <div className="space-y-8 max-w-5xl" data-testid="patient-chart-forms-consent-tab" data-patient-id={patientId}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Forms & Consent</h2>
        <p className="text-sm text-muted-foreground">
          Start forms or consents for this patient (staff-assisted or QR on a mobile device). Completed documents appear
          below. Editing templates is in Administration (Systems administrator).
        </p>
      </div>
      <ClinicalFormsTemplatesCard variant="patient-chart" patientId={patientId} />
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Consent Needing Patient Signature</h3>
        <ProcedureConsentsPendingProviderSignatureList patientId={patientId} />
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Completed forms & Consent</h3>
        <ClinicalFormCompletionsList patientId={patientId} />
      </section>
    </div>
  );
}
