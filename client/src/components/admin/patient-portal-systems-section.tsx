import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { PatientRecordTab } from "@/components/patient-record-tab";
import { apiGetJson, apiPatchJson } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  PATIENT_PORTAL_PREVIEW_ALLERGIES,
  PATIENT_PORTAL_PREVIEW_ENCOUNTERS,
  PATIENT_PORTAL_PREVIEW_PATIENT,
  PATIENT_PORTAL_PREVIEW_PRESCRIBER_MAP,
  PATIENT_PORTAL_PREVIEW_PRESCRIPTIONS,
  PATIENT_PORTAL_PREVIEW_PROBLEMS,
  PATIENT_PORTAL_PREVIEW_USERS,
} from "@/lib/patient-portal-preview-sample";
import { Eye, LayoutGrid, Settings2 } from "lucide-react";
import type { PatientPortalVisibilityConfig } from "@shared/patient-portal-config";
import { mergePatientPortalConfig } from "@shared/patient-portal-config";

type OrgWithPortal = {
  id: string;
  name: string;
  timeZone: string;
  patientPortalConfig: PatientPortalVisibilityConfig;
};

export function PatientPortalSystemsSection({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/facility/organization-settings"],
    queryFn: () => apiGetJson<OrgWithPortal>("/api/facility/organization-settings", token!),
    enabled: !!token,
  });

  const [draft, setDraft] = useState<PatientPortalVisibilityConfig>(() => mergePatientPortalConfig(undefined));

  useEffect(() => {
    if (!data) return;
    setDraft(mergePatientPortalConfig(data.patientPortalConfig));
  }, [data]);

  const previewVis = useMemo(
    () => ({
      showOverview: draft.showOverview,
      showVisits: draft.showVisits,
      showProblems: draft.showProblems,
      showMedications: draft.showMedications,
      showAllergies: draft.showAllergies,
    }),
    [draft],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPatchJson<unknown, { patientPortalConfig: Partial<PatientPortalVisibilityConfig> }>(
        "/api/facility/organization-settings",
        {
          patientPortalConfig: {
            showOverview: draft.showOverview,
            showVisits: draft.showVisits,
            showProblems: draft.showProblems,
            showMedications: draft.showMedications,
            showAllergies: draft.showAllergies,
            welcomeMessage: draft.welcomeMessage,
          },
        },
        token,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/facility/organization-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Patient portal configuration saved" });
    },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const setBool = (key: keyof Pick<PatientPortalVisibilityConfig, "showOverview" | "showVisits" | "showProblems" | "showMedications" | "showAllergies">, v: boolean) => {
    setDraft((d) => ({ ...d, [key]: v }));
  };

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="min-h-[12rem] animate-pulse bg-muted/40" />
        <Card className="min-h-[24rem] animate-pulse bg-muted/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 shrink-0" />
              <SectionTitleWithHint hint="Controls which tabs and content appear for patients at /portal. Changes apply to new sessions; patients only receive data for enabled sections.">
                Patient portal configuration
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure read-only sections for your organization&apos;s patient portal. At least one section must stay
              enabled.
            </p>
            <div className="space-y-3">
              {(
                [
                  ["showOverview", "Overview", "Demographics, contact, and chart summary"],
                  ["showVisits", "Visits", "Completed visits and visit documentation"],
                  ["showProblems", "Problems", "Active and resolved problem list"],
                  ["showMedications", "Medications", "Active and discontinued medications"],
                  ["showAllergies", "Allergies", "Structured allergies and demographics free-text"],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <Checkbox
                    id={`portal-${key}`}
                    checked={draft[key]}
                    onCheckedChange={(c) => setBool(key, c === true)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`portal-${key}`} className="font-medium cursor-pointer">
                      {label}
                    </Label>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="portal-welcome">Welcome message (optional)</Label>
              <Textarea
                id="portal-welcome"
                rows={3}
                maxLength={2000}
                placeholder="Short message shown at the top of the patient’s record after sign-in."
                value={draft.welcomeMessage ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, welcomeMessage: e.target.value || null }))}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">Up to 2,000 characters. Leave blank for no banner.</p>
            </div>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save portal configuration"}
            </Button>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 shrink-0" />
              <SectionTitleWithHint hint="Reflects the sections enabled in the form on the left. This is not live patient data.">
                Patient portal preview
              </SectionTitleWithHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t bg-muted/30 max-h-[min(70vh,900px)] overflow-auto rounded-b-lg">
              <div className="origin-top scale-[0.92] sm:scale-95 w-[108%] -ml-[4%] pb-4">
                <PatientRecordTab
                  token={null}
                  patient={PATIENT_PORTAL_PREVIEW_PATIENT}
                  prescriptions={PATIENT_PORTAL_PREVIEW_PRESCRIPTIONS}
                  problems={PATIENT_PORTAL_PREVIEW_PROBLEMS}
                  allergies={PATIENT_PORTAL_PREVIEW_ALLERGIES}
                  users={PATIENT_PORTAL_PREVIEW_USERS}
                  prescriberNameById={PATIENT_PORTAL_PREVIEW_PRESCRIBER_MAP}
                  encountersOverride={PATIENT_PORTAL_PREVIEW_ENCOUNTERS}
                  encountersLoading={false}
                  tabVisibility={previewVis}
                  uiVariant="preview"
                  welcomeBanner={draft.welcomeMessage}
                  isPreview
                  orgTimeZone={data.timeZone || "UTC"}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground border-t">
              <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
              Live portal URL: <span className="font-mono text-[11px]">/portal</span> and{" "}
              <span className="font-mono text-[11px]">/portal/record</span> after sign-in.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
