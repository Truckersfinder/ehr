import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { PatientRecordTab } from "@/components/patient-record-tab";
import type { Encounter, Patient, PatientAllergy, PatientProblem, Prescription } from "@shared/schema";
import { PATIENT_PORTAL_TOKEN_STORAGE_KEY } from "@/lib/patient-portal-token";
import { normalizeOrgTimeZone } from "@/lib/org-timezone";
import type { PatientPortalVisibilityConfig } from "@shared/patient-portal-config";

type RecordBundle = {
  patient: Patient;
  prescriptions: Prescription[];
  problems: PatientProblem[];
  allergies: PatientAllergy[];
  encounters: Encounter[];
  users: { id: string; fullName: string; username?: string }[];
  prescriberNameById: Record<string, string>;
  visibility: PatientPortalVisibilityConfig;
};

export default function PatientPortalRecordPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const token = typeof window !== "undefined" ? localStorage.getItem(PATIENT_PORTAL_TOKEN_STORAGE_KEY) : null;

  const { data: me } = useQuery({
    queryKey: ["/api/patient-portal/me", token],
    queryFn: async (): Promise<{ timeZone: string; facilityName: string | null }> => {
      const res = await fetch("/api/patient-portal/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("session");
      return (await res.json()) as { timeZone: string; facilityName: string | null };
    },
    enabled: !!token,
  });

  useEffect(() => {
    const name = me?.facilityName?.trim();
    document.title = name
      ? t("portal.record.documentTitle", { facility: name })
      : t("portal.record.documentTitleFallback");
  }, [me?.facilityName, t]);

  const orgTz = normalizeOrgTimeZone(me?.timeZone);

  const { data: bundle, isLoading, error } = useQuery({
    queryKey: ["/api/patient-portal/record", token],
    queryFn: async (): Promise<RecordBundle> => {
      const res = await fetch("/api/patient-portal/record", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("record");
      return (await res.json()) as RecordBundle;
    },
    enabled: !!token,
  });

  const prescriberMap = useMemo(() => {
    if (!bundle?.prescriberNameById) return new Map<string, string>();
    return new Map(Object.entries(bundle.prescriberNameById));
  }, [bundle?.prescriberNameById]);

  function logout() {
    localStorage.removeItem(PATIENT_PORTAL_TOKEN_STORAGE_KEY);
    navigate("/portal");
  }

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">{t("portal.record.signInPrompt")}</p>
        <Button asChild>
          <Link href="/portal">{t("portal.record.signInLink")}</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || !bundle) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-destructive">{t("portal.record.sessionError")}</p>
        <Button
          onClick={() => {
            logout();
          }}
        >
          {t("portal.record.signInAgain")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0 sticky top-0 z-10">
        <div>
          {me?.facilityName?.trim() ? (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{me.facilityName.trim()}</p>
          ) : null}
          <p className="text-sm font-semibold">{t("portal.record.myHealthRecord")}</p>
          <p className="text-xs text-muted-foreground">
            {bundle.patient.firstName} {bundle.patient.lastName} · {bundle.patient.mrn}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={logout}>
          {t("portal.record.signOut")}
        </Button>
      </header>
      <div className="flex-1 min-h-0 overflow-auto">
        <PatientRecordTab
          token={token}
          patient={bundle.patient}
          prescriptions={bundle.prescriptions}
          problems={bundle.problems}
          allergies={bundle.allergies}
          users={bundle.users}
          prescriberNameById={prescriberMap}
          encountersOverride={bundle.encounters}
          encountersLoading={false}
          visitSummaryUrlForEncounter={(id) => `/api/patient-portal/encounters/${id}/visit-summary`}
          orgTimeZone={orgTz}
          tabVisibility={bundle.visibility}
          uiVariant="portal"
          welcomeBanner={bundle.visibility.welcomeMessage}
        />
      </div>
    </div>
  );
}
