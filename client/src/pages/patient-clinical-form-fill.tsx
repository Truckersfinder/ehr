import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { ClinicalFormFillFields } from "@/components/clinical-form-fill-fields";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPostJson } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { validateAndNormalizeClinicalFormAnswers } from "@shared/clinical-form-fill";
import type { ClinicalFormField, ClinicalFormTemplateKind } from "@shared/schema";
import { excludeLegacyPatientSignOffFieldsFromQrConsent } from "@shared/consent-patient-signature";
type FillContext = {
  form: {
    id: string;
    title: string;
    description: string | null;
    fields: ClinicalFormField[];
    templateKind: ClinicalFormTemplateKind;
  };
  patient: {
    id: string;
    patientIdentifierLabel: string;
    patientIdentifier: string;
    firstName: string;
    lastName: string;
  };
  prefill: Record<string, string>;
};

export default function PatientClinicalFormFillPage() {
  const params = useParams<{ id: string; formId: string }>();
  const patientId = params.id;
  const formId = params.formId;
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isClinicianUser = user?.role === "clinician" || user?.role === "nurse";

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/patients", patientId, "clinical-forms", formId, "fill-context"],
    queryFn: () =>
      apiGetJson<FillContext>(
        `/api/patients/${encodeURIComponent(patientId!)}/clinical-forms/${encodeURIComponent(formId!)}/fill-context`,
        token,
      ),
    enabled: !!token && !!patientId && !!formId,
  });

  // Must be declared before any conditional returns (React hooks rule).
  const fillMode: "patient" | "clinician" =
    data?.form.templateKind === "consent" && isClinicianUser ? "clinician" : "patient";

  const { data: clinicians = [] } = useQuery({
    queryKey: ["/api/clinicians"],
    queryFn: () => apiGetJson<{ id: string; fullName: string }[]>("/api/clinicians", token),
    enabled: !!token && fillMode === "clinician",
  });

  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});

  useEffect(() => {
    if (!data) return;
    setAnswers({ ...data.prefill });
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: (body: { answers: Record<string, string | number | boolean> }) =>
      apiPostJson<{ id: string; completedAt?: string }, typeof body>(
        `/api/patients/${encodeURIComponent(patientId!)}/clinical-forms/${encodeURIComponent(formId!)}/submit`,
        body,
        token,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "clinical-form-completions"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/patients", patientId, "procedure-consents", "pending-patient-signature"],
      });
      toast({ title: "Saved", description: "The form has been saved to this patient’s chart." });
      setLocation(`/patients/${patientId}?tab=forms-consent`);
    },
    onError: (e: Error) => {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    },
  });

  const setAnswer = (fieldId: string, value: string | number | boolean | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[fieldId];
      else next[fieldId] = value;
      return next;
    });
  };

  const handleSubmit = () => {
    if (!data) return;
    const consentType = String(answers["sys_consent_type"] ?? "");
    const baseFields: ClinicalFormField[] =
      data.form.templateKind === "consent"
        ? excludeLegacyPatientSignOffFieldsFromQrConsent(data.form.fields)
        : data.form.fields;
    const validationFields: ClinicalFormField[] =
      data.form.templateKind === "consent" && fillMode === "clinician"
        ? baseFields.map((f) => {
            if (f.id === "sys_provider_attestation") return { ...f, required: false };
            return f;
          })
        : data.form.templateKind === "consent" && fillMode === "patient" && consentType === "Procedure Consent"
          ? baseFields.map((f) => {
              if (f.id === "sys_provider_attestation") return { ...f, required: true };
              return f;
            })
          : baseFields;

    const norm = validateAndNormalizeClinicalFormAnswers(validationFields, answers);
    if (!norm.ok) {
      toast({ title: "Check the form", description: norm.message, variant: "destructive" });
      return;
    }
    submitMutation.mutate({ answers: norm.answers });
  };

  if (!patientId || !formId) {
    return <p className="p-6 text-sm text-muted-foreground">Missing route parameters.</p>;
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl">
        <p className="text-sm text-muted-foreground">Loading form…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load form."}</p>
        <Button variant="outline" asChild>
          <Link href={`/patients/${patientId}?tab=forms-consent`}>Back to chart</Link>
        </Button>
      </div>
    );
  }

  const consentType = String(answers["sys_consent_type"] ?? "");
  const formFieldsForUi: ClinicalFormField[] =
    data.form.templateKind === "consent"
      ? excludeLegacyPatientSignOffFieldsFromQrConsent(data.form.fields)
      : data.form.fields;
  const verb =
    data.form.templateKind === "consent"
      ? fillMode === "clinician"
        ? consentType === "Procedure Consent"
          ? "Create & Sign Consent"
          : "Create Consent"
        : "Sign consent"
      : "Complete form";

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" asChild>
          <Link href={`/patients/${patientId}?tab=forms-consent`}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {data.form.description ? (
              <SectionTitleWithHint hint={data.form.description}>{data.form.title}</SectionTitleWithHint>
            ) : (
              data.form.title
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground pt-2">
            {data.patient.patientIdentifierLabel}: {data.patient.patientIdentifier} · {data.patient.firstName}{" "}
            {data.patient.lastName}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <ClinicalFormFillFields
            fields={formFieldsForUi}
            answers={answers}
            onChange={setAnswer}
            mode={fillMode}
            clinicianOptions={clinicians}
          />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={submitMutation.isPending} data-testid="button-submit-clinical-form">
              {submitMutation.isPending ? "Saving…" : verb}
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/patients/${patientId}?tab=forms-consent`}>Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
