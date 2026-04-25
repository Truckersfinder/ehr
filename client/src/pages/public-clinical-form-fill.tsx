import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { ClinicalFormFillFields } from "@/components/clinical-form-fill-fields";
import { apiGetJsonPublic, apiPostJsonPublic } from "@/lib/api-client";
import { validateAndNormalizeClinicalFormAnswers } from "@shared/clinical-form-fill";
import type { ClinicalFormField, ClinicalFormTemplateKind } from "@shared/schema";
import {
  excludeLegacyPatientSignOffFieldsFromQrConsent,
  fieldsForPublicConsentQrValidation,
} from "@shared/consent-patient-signature";
import { MutedIconBox } from "@/components/muted-icon-box";
import { publicOrganizationNameFallback, usePatientPortalBranding } from "@/lib/patient-portal-branding";
import { Heart } from "lucide-react";

type SessionPayload = {
  sessionId: string;
  patientId: string;
  form: {
    id: string;
    title: string;
    description: string | null;
    fields: ClinicalFormField[];
    templateKind: ClinicalFormTemplateKind;
  };
  patient: {
    patientIdentifierLabel: string;
    patientIdentifier: string;
    firstName: string;
    lastName: string;
  };
  prefill: Record<string, string>;
  expiresAt: string | null;
};

export default function PublicClinicalFormFillPage({ token }: { token: string }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: branding } = usePatientPortalBranding();
  const publicOrgName = branding?.organizationName ?? publicOrganizationNameFallback();
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ["/api/public/clinical-form-session", token],
    queryFn: () => apiGetJsonPublic<SessionPayload>(`/api/public/clinical-form-session/${encodeURIComponent(token)}`),
    retry: false,
  });

  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});

  useEffect(() => {
    if (!data) return;
    setAnswers({ ...data.prefill });
  }, [data]);

  const submitMutation = useMutation({
    mutationFn: (body: {
      answers: Record<string, string | number | boolean>;
      patientId: string;
    }) =>
      apiPostJsonPublic<{ id: string; completedAt?: string }, { answers: Record<string, string | number | boolean> }>(
        `/api/public/clinical-form-session/${encodeURIComponent(token)}/submit`,
        { answers: body.answers },
      ).then((res) => ({ ...res, patientId: body.patientId })),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/patients", res.patientId, "clinical-form-completions"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/patients", res.patientId, "procedure-consents", "pending-patient-signature"],
      });
      setLocation(`/patients/${encodeURIComponent(res.patientId)}?tab=forms-consent`);
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

  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!data) return;
    const validationFields: ClinicalFormField[] =
      data.form.templateKind === "consent"
        ? fieldsForPublicConsentQrValidation(data.form.fields)
        : data.form.fields;

    const norm = validateAndNormalizeClinicalFormAnswers(validationFields, answers);
    if (!norm.ok) {
      setLocalError(norm.message);
      return;
    }
    setLocalError(null);
    submitMutation.mutate({ answers: norm.answers, patientId: data.patientId });
  };

  const verb =
    data?.form.templateKind === "consent" ? t("publicClinicalForm.verbSign") : t("publicClinicalForm.verbSubmit");

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (isError || !data) {
    const msg = (error as Error)?.message || t("publicClinicalForm.errorGeneric");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <div className="flex items-center gap-2 mb-6">
          <MutedIconBox icon={Heart} size="sm" />
          <span className="font-semibold text-sm">{publicOrgName}</span>
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-base">{t("publicClinicalForm.formUnavailable")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{msg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fieldsForPatientUi =
    data.form.templateKind === "consent"
      ? excludeLegacyPatientSignOffFieldsFromQrConsent(data.form.fields)
      : data.form.fields;
  const patientEditableFieldIds = new Set<string>(["sys_provider_attestation", "sys_patient_signature"]);
  const readOnlyFieldIds = fieldsForPatientUi
    .filter((f) => !patientEditableFieldIds.has(f.id))
    .map((f) => f.id);

  return (
    <div className="min-h-screen flex flex-col items-stretch p-4 md:p-8 bg-muted/30">
      <div className="mx-auto w-full max-w-lg flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <MutedIconBox icon={Heart} size="sm" />
          <span className="font-semibold text-sm">{publicOrgName}</span>
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
            {data.expiresAt ? (
              <p className="text-xs text-muted-foreground">Link valid until {new Date(data.expiresAt).toLocaleString()}</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            <ClinicalFormFillFields
              fields={fieldsForPatientUi}
              answers={answers}
              onChange={setAnswer}
              mode="patient"
              readOnlyFieldIds={readOnlyFieldIds}
            />
            {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
            {submitMutation.isError ? (
              <p className="text-sm text-destructive">
                {(submitMutation.error as Error)?.message ?? t("publicClinicalForm.submitError")}
              </p>
            ) : null}
            <Button
              className="w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              data-testid="button-public-submit-clinical-form"
            >
              {submitMutation.isPending ? t("publicClinicalForm.submitting") : verb}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
