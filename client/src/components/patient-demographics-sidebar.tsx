import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, X, User, Phone, Mail, MapPin, Heart, AlertTriangle,
  Stethoscope, CalendarDays, Activity, FilePenLine, CreditCard,
  Thermometer, Wind, Droplets, Ruler, Weight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import type { Patient, User as UserType, Vitals, LabOrder, PatientAllergy } from "@shared/schema";
import { clearClinicianVisitDocumentationSession } from "@/lib/clinician-visit-doc-session";
import { readApiJsonOrThrow } from "@/lib/api-response";
import { normalizePatientRow, profileImageDisplaySrc } from "@/lib/patient-photo";
import {
  mergeLatestStoryboardVitals,
  storyboardVitalsHasAnyValue,
  storyboardVitalsLatestTimestamp,
} from "@/lib/storyboard-vitals";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getAge(dob: string) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

function readScheduleEncounterSession(patientId: string): { encounterId: string; appointmentId: string | null } | null {
  if (typeof window === "undefined") return null;
  const encounterId = sessionStorage.getItem("ehr_active_encounter_id");
  const storedPatientId = sessionStorage.getItem("ehr_active_encounter_patient_id");
  if (!encounterId || storedPatientId !== patientId) return null;
  return {
    encounterId,
    appointmentId: sessionStorage.getItem("ehr_schedule_appointment_id"),
  };
}

function readAdmissionEncounterSession(patientId: string): { encounterId: string; admissionId: string } | null {
  if (typeof window === "undefined") return null;
  const encounterId = sessionStorage.getItem("ehr_active_encounter_id");
  const storedPatientId = sessionStorage.getItem("ehr_active_encounter_patient_id");
  const admissionId = sessionStorage.getItem("ehr_active_admission_id");
  if (!encounterId || storedPatientId !== patientId || !admissionId) return null;
  return { encounterId, admissionId };
}

function ProfilePhotoAvatar({
  profilePhotoUrl,
  initials,
  className,
}: {
  profilePhotoUrl: string | null | undefined;
  initials: string;
  className?: string;
}) {
  const src = profileImageDisplaySrc(profilePhotoUrl);
  return (
    <div
      className={`relative flex h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-border shadow-sm bg-muted ${className ?? ""}`}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-lg text-sm font-medium">{initials}</div>
      )}
    </div>
  );
}

export function PatientStoryboard({ patientId, onRequestLeave }: { patientId: string; onRequestLeave?: (path: string) => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const chartBackPath = user?.role === "reception" ? "/appointments" : "/schedule";
  const [scheduleEncounter, setScheduleEncounter] = useState(() => readScheduleEncounterSession(patientId));
  const [admissionEncounter, setAdmissionEncounter] = useState(() => readAdmissionEncounterSession(patientId));
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [dischargeReason, setDischargeReason] = useState("");
  const [dischargeNotes, setDischargeNotes] = useState("");
  const [causeOfDeath, setCauseOfDeath] = useState("");
  const [dateOfDeath, setDateOfDeath] = useState("");
  const [timeOfDeath, setTimeOfDeath] = useState("");
  const galleryPhotoInputRef = useRef<HTMLInputElement>(null);
  const cameraPhotoInputRef = useRef<HTMLInputElement>(null);

  const uploadProfilePhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/patients/${patientId}/profile-photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await readApiJsonOrThrow<Patient>(res);
      return normalizePatientRow(data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Patient>(["/api/patients", patientId], (prev) => ({
        ...(prev ?? ({} as Patient)),
        ...updated,
        profilePhotoUrl: updated.profilePhotoUrl ?? prev?.profilePhotoUrl ?? null,
      }));
      toast({ title: t("components.patientStoryboard.toastProfilePhotoUpdated") });
      if (galleryPhotoInputRef.current) galleryPhotoInputRef.current.value = "";
      if (cameraPhotoInputRef.current) cameraPhotoInputRef.current.value = "";
    },
    onError: (e: Error) =>
      toast({
        title: t("components.patientStoryboard.toastPhotoUploadFailed"),
        description: e.message,
        variant: "destructive",
      }),
  });

  const refreshEncounterSession = useCallback(() => {
    setScheduleEncounter(readScheduleEncounterSession(patientId));
    setAdmissionEncounter(readAdmissionEncounterSession(patientId));
  }, [patientId]);

  useEffect(() => {
    refreshEncounterSession();
    const onSession = () => refreshEncounterSession();
    window.addEventListener("ehr-encounter-session", onSession);
    return () => window.removeEventListener("ehr-encounter-session", onSession);
  }, [refreshEncounterSession]);

  const closeScheduleEncounter = async () => {
    if (!scheduleEncounter || !token) return;
    const { encounterId, appointmentId } = scheduleEncounter;
    try {
      const r1 = await fetch(`/api/encounters/${encounterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!r1.ok) {
        const err = await r1.json().catch(() => ({}));
        throw new Error(err.message || "Failed to close encounter");
      }
      if (appointmentId) {
        await fetch(`/api/appointments/${appointmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: "completed" }),
        });
      }
      sessionStorage.removeItem("ehr_active_encounter_id");
      sessionStorage.removeItem("ehr_active_encounter_patient_id");
      sessionStorage.removeItem("ehr_schedule_appointment_id");
      clearClinicianVisitDocumentationSession();
      window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: t("components.patientStoryboard.toastEncounterClosedTitle"), description: t("components.patientStoryboard.toastEncounterClosedDesc") });
      if (onRequestLeave) {
        onRequestLeave(chartBackPath);
      } else {
        navigate(chartBackPath);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("components.patientStoryboard.errCouldNotCloseEncounter");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const { data: activeAdmission } = useQuery<{ id: string; bedId: string; appointmentId?: string | null } | null>({
    queryKey: ["/api/patients", patientId, "admission"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/admission`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const isClinicianOrNurse = user?.role === "clinician" || user?.role === "nurse";
  const inAdmissionWorkflow =
    isClinicianOrNurse &&
    !!activeAdmission?.id &&
    (admissionEncounter?.admissionId === activeAdmission.id ||
      (!!scheduleEncounter?.appointmentId && activeAdmission.appointmentId === scheduleEncounter.appointmentId));

  const dischargeMutation = useMutation({
    mutationFn: async () => {
      if (!activeAdmission?.id) throw new Error(t("components.patientStoryboard.errNoActiveAdmission"));
      if (!dischargeReason.trim()) throw new Error(t("components.patientStoryboard.errSelectDischargeReason"));
      if (dischargeReason.trim() === "deceased") {
        if (!causeOfDeath.trim()) throw new Error(t("components.patientStoryboard.errCauseOfDeathRequired"));
        if (!dateOfDeath.trim()) throw new Error(t("components.patientStoryboard.errDateOfDeathRequired"));
        if (!timeOfDeath.trim()) throw new Error(t("components.patientStoryboard.errTimeOfDeathRequired"));
      }
      const timeOfDeathIso =
        dischargeReason.trim() === "deceased"
          ? new Date(`${dateOfDeath.trim()}T${timeOfDeath.trim()}`).toISOString()
          : null;
      const res = await fetch(`/api/admissions/${activeAdmission.id}/discharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dischargeReason: dischargeReason.trim(),
          dischargeNotes: dischargeNotes.trim() || null,
          causeOfDeath: dischargeReason.trim() === "deceased" ? causeOfDeath.trim() : null,
          timeOfDeath: timeOfDeathIso,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t("components.patientStoryboard.errCouldNotDischargePatient"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("components.patientStoryboard.toastPatientDischarged") });
      setDischargeOpen(false);
      setDischargeReason("");
      setDischargeNotes("");
      setCauseOfDeath("");
      setDateOfDeath("");
      setTimeOfDeath("");
      queryClient.invalidateQueries({ queryKey: ["/api/admissions/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admissions/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", patientId, "admission"] });
      // Clear schedule encounter session if present.
      sessionStorage.removeItem("ehr_active_encounter_id");
      sessionStorage.removeItem("ehr_active_encounter_patient_id");
      sessionStorage.removeItem("ehr_schedule_appointment_id");
      sessionStorage.removeItem("ehr_active_admission_id");
      clearClinicianVisitDocumentationSession();
      window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
      if (onRequestLeave) {
        onRequestLeave(chartBackPath);
      } else {
        navigate(chartBackPath);
      }
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients", patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return normalizePatientRow(await res.json());
    },
    enabled: !!patientId && !!token,
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });
  const userNameById = new Map(users.map((u) => [u.id, u.fullName || u.username || "Unknown user"]));

  const { data: primaryProvider } = useQuery<Omit<UserType, "password"> | null>({
    queryKey: ["/api/users", "provider", patient?.primaryProviderId],
    queryFn: async () => {
      if (!patient?.primaryProviderId) return null;
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const users: Omit<UserType, "password">[] = await res.json();
      return users.find((u) => u.id === patient.primaryProviderId) ?? null;
    },
    enabled: !!patient && !!patient.primaryProviderId && !!token,
  });

  const { data: vitalsList = [] } = useQuery<Vitals[]>({
    queryKey: ["/api/patients", patientId, "vitals"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/vitals`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const storyboardVitals = useMemo(() => mergeLatestStoryboardVitals(vitalsList), [vitalsList]);

  const { data: criticalLabs = [] } = useQuery<LabOrder[]>({
    queryKey: ["/api/patients", patientId, "critical-labs"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/critical-labs`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const { data: patientAllergies = [] } = useQuery<PatientAllergy[]>({
    queryKey: ["/api/patients", patientId, "allergies"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/allergies`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const highSeverityAllergies = patientAllergies.filter((a) => a.severity === "HIGH");
  const hasLegacyAllergies = patient?.allergies && typeof patient.allergies === "string" && patient.allergies.trim().length > 0;
  const showInRed = highSeverityAllergies.length > 0 ? highSeverityAllergies.map((a) => a.allergen).join(", ") : hasLegacyAllergies ? patient!.allergies!.trim() : null;

  if (isLoading || !patient) {
    return (
      <div className="w-[clamp(12rem,calc(var(--sidebar-width,16rem)*0.5),18rem)] flex-shrink-0 border-r bg-muted/30 flex flex-col overflow-y-auto">
        <div className="p-4 space-y-4">
            <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-start gap-0 min-w-0">
            <Skeleton className="h-9 w-9 rounded-md shrink-0" />
            <div className="flex flex-col items-center gap-2 pt-0.5 min-w-0">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-14 w-14 rounded-lg" />
            </div>
            <div className="flex justify-end shrink-0">
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="mystic-water-sidebar w-[clamp(12rem,calc(var(--sidebar-width,16rem)*0.5),18rem)] flex-shrink-0 border-r flex flex-col overflow-y-auto"
      data-testid="patient-demographics-sidebar"
    >
      <div className="p-4 space-y-4">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-start gap-0 min-w-0">
            <div className="flex justify-start shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => (onRequestLeave ? onRequestLeave(chartBackPath) : navigate(chartBackPath))}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-col items-center text-center gap-2 pt-0.5 min-w-0 px-0.5">
              <div className="min-w-0 w-full max-w-full">
                <h2
                  className="font-semibold truncate text-center"
                  data-testid="patient-sidebar-name"
                >
                  {patient.firstName} {patient.lastName}
                </h2>
                <p className="text-xs text-muted-foreground">{patient.mrn}</p>
              </div>
              {user?.role === "reception" ? (
                <>
                  <input
                    ref={galleryPhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    data-testid="sidebar-profile-photo-gallery"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadProfilePhotoMutation.mutate(f);
                    }}
                  />
                  <input
                    ref={cameraPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    data-testid="sidebar-profile-photo-camera"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadProfilePhotoMutation.mutate(f);
                    }}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={uploadProfilePhotoMutation.isPending}
                        className="rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background disabled:opacity-60"
                        title="Add or change profile photo"
                        aria-label="Profile photo: take or upload"
                        data-testid="sidebar-profile-photo-trigger"
                      >
                        <ProfilePhotoAvatar
                          profilePhotoUrl={patient.profilePhotoUrl}
                          initials={`${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`}
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuItem onSelect={() => cameraPhotoInputRef.current?.click()}>
                        Take photo
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => galleryPhotoInputRef.current?.click()}>
                        Upload photo
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <ProfilePhotoAvatar
                  profilePhotoUrl={patient.profilePhotoUrl}
                  initials={`${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`}
                />
              )}
            </div>
            <div className="flex justify-end shrink-0">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => (onRequestLeave ? onRequestLeave(chartBackPath) : navigate(chartBackPath))}
                title="Close patient workspace"
                aria-label="Close patient workspace"
                data-testid="button-close-storyboard"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {scheduleEncounter && (
            inAdmissionWorkflow ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-center gap-2 font-medium border-amber-600/70 text-amber-900 bg-amber-50 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-600 dark:text-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/40 shadow-sm"
                aria-label="Discharge patient"
                title="Discharge this admitted patient"
                data-testid="button-discharge-patient"
                onClick={() => setDischargeOpen(true)}
              >
                <FilePenLine className="h-4 w-4 shrink-0" />
                Discharge Patient
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-center gap-2 font-medium border-green-600/70 text-green-800 bg-green-50 hover:bg-green-100 hover:text-green-900 dark:border-green-600 dark:text-green-100 dark:bg-green-950/50 dark:hover:bg-green-900/40 shadow-sm"
                aria-label="Sign visit and complete encounter"
                title="Complete this visit and return to scheduling"
                data-testid="button-close-encounter"
                onClick={closeScheduleEncounter}
              >
                <FilePenLine className="h-4 w-4 shrink-0" />
                Sign visit
              </Button>
            )
          )}
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Demographics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase() : ""} · {getAge(patient.dateOfBirth)} years</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{format(new Date(patient.dateOfBirth), "MMM d, yyyy")}</span>
            </div>
            {patient.nationalId && (
              <p className="text-muted-foreground">ID: {patient.nationalId}</p>
            )}
            {patient.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{patient.phone}</span>
              </div>
            )}
            {patient.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{patient.email}</span>
              </div>
            )}
            {patient.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  {patient.address}
                  {patient.city ? `, ${patient.city}` : ""}
                  {patient.state ? `, ${patient.state}` : ""}
                  {patient.country ? `, ${patient.country}` : ""}
                </span>
              </div>
            )}
            {patient.bloodGroup && (
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-destructive shrink-0" />
                <span>Blood: {patient.bloodGroup}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Allergies</h3>
          <div className="space-y-1.5 text-sm">
            {showInRed ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <span className="text-destructive">{showInRed}</span>
              </div>
            ) : patientAllergies.length > 0 ? (
              <ul className="space-y-1">
                {patientAllergies.map((a) => (
                  <li key={a.id} className={a.severity === "HIGH" ? "text-destructive font-medium" : "text-muted-foreground"}>
                    <span>{a.allergen}</span>
                  </li>
                ))}
              </ul>
            ) : hasLegacyAllergies ? (
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{patient!.allergies}</p>
            ) : (
              <p className="text-muted-foreground text-xs">No known allergies</p>
            )}
          </div>
        </div>

        {(patient.insuranceCarrier ||
          patient.insurancePolicyNumber ||
          patient.insuranceGroupNumber ||
          patient.billingGuarantorName ||
          patient.billingGuarantorPhone ||
          patient.billingGuarantorRelation ||
          patient.billingNotes) && (
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5" />
              Billing & insurance
            </h3>
            <div className="space-y-1.5 text-sm text-muted-foreground">
              {patient.insuranceCarrier && <p>Payer: {patient.insuranceCarrier}</p>}
              {patient.insurancePolicyNumber && <p>Policy #: {patient.insurancePolicyNumber}</p>}
              {patient.insuranceGroupNumber && <p>Group / plan: {patient.insuranceGroupNumber}</p>}
              {(patient.billingGuarantorName || patient.billingGuarantorPhone) && (
                <p>
                  Guarantor: {patient.billingGuarantorName ?? "—"}
                  {patient.billingGuarantorPhone ? ` · ${patient.billingGuarantorPhone}` : ""}
                  {patient.billingGuarantorRelation ? ` (${patient.billingGuarantorRelation})` : ""}
                </p>
              )}
              {patient.billingNotes && <p className="whitespace-pre-wrap text-xs">{patient.billingNotes}</p>}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Vitals</h3>
          <div className="space-y-1.5 text-sm">
            {storyboardVitals && storyboardVitalsHasAnyValue(storyboardVitals) ? (
              <>
                {(() => {
                  const latest = storyboardVitalsLatestTimestamp(storyboardVitals);
                  return (
                    <p className="text-xs text-muted-foreground mb-1.5">
                      Most recent values {latest ? format(latest, "MMM d, yyyy · HH:mm") : ""}
                    </p>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    Temperature:{" "}
                    {storyboardVitals.temperature != null ? `${storyboardVitals.temperature} °C` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    Blood pressure:{" "}
                    {storyboardVitals.bloodPressureSystolic != null || storyboardVitals.bloodPressureDiastolic != null
                      ? `${storyboardVitals.bloodPressureSystolic ?? "—"} / ${storyboardVitals.bloodPressureDiastolic ?? "—"} mmHg`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    Pulse rate:{" "}
                    {storyboardVitals.pulseRate != null ? `${storyboardVitals.pulseRate} bpm` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    Respiration rate:{" "}
                    {storyboardVitals.respiratoryRate != null ? `${storyboardVitals.respiratoryRate} /min` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    SpO₂:{" "}
                    {storyboardVitals.oxygenSaturation != null ? `${storyboardVitals.oxygenSaturation}%` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Weight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    Weight:{" "}
                    {storyboardVitals.weight != null ? `${storyboardVitals.weight} kg` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>
                    Height:{" "}
                    {storyboardVitals.height != null ? `${storyboardVitals.height} cm` : "—"}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-xs">No vitals recorded</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Relevant labs</h3>
          <p className="text-xs text-muted-foreground mb-2">Critical results since last appointment</p>
          {criticalLabs.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {criticalLabs.map((lab) => (
                <li key={lab.id} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{lab.testName}</span>
                    {lab.resultValue && <span className="text-muted-foreground"> — {lab.resultValue}</span>}
                    {lab.completedAt && (
                      <p className="text-xs text-muted-foreground">{format(new Date(lab.completedAt), "MMM d, yyyy")}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Primary provider</h3>
          {primaryProvider ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-background border text-sm">
              <Stethoscope className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{primaryProvider.fullName}</p>
                <p className="text-xs text-muted-foreground capitalize">{primaryProvider.role}</p>
                {primaryProvider.email && <p className="text-xs text-muted-foreground truncate">{primaryProvider.email}</p>}
                {primaryProvider.phone && <p className="text-xs text-muted-foreground">{primaryProvider.phone}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not assigned at registration</p>
          )}
        </div>

      </div>

      <Dialog
        open={dischargeOpen}
        onOpenChange={(open: boolean) => {
          setDischargeOpen(open);
          if (!open) {
            setDischargeReason("");
            setDischargeNotes("");
            setCauseOfDeath("");
            setDateOfDeath("");
            setTimeOfDeath("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge patient</DialogTitle>
            <DialogDescription>Document why the patient is being discharged. This will free the assigned bed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Discharge reason *</Label>
              <Select value={dischargeReason || undefined} onValueChange={setDischargeReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="improved">Improved / stable</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="left_against_medical_advice">Left against medical advice</SelectItem>
                  <SelectItem value="referred">Referred</SelectItem>
                  <SelectItem value="deceased">Deceased</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Additional notes</Label>
              <Textarea
                value={dischargeNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDischargeNotes(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="Optional details…"
              />
            </div>
            {dischargeReason === "deceased" ? (
              <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="space-y-2">
                  <Label>Cause of Death *</Label>
                  <Input value={causeOfDeath} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCauseOfDeath(e.target.value)} placeholder="e.g. Sepsis" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date of Death *</Label>
                    <Input
                      type="date"
                      value={dateOfDeath}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateOfDeath(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time of Death *</Label>
                    <Input
                      type="time"
                      value={timeOfDeath}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTimeOfDeath(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDischargeOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => dischargeMutation.mutate()}
              disabled={
                !dischargeReason.trim() ||
                dischargeMutation.isPending ||
                (dischargeReason === "deceased" && (!causeOfDeath.trim() || !dateOfDeath.trim() || !timeOfDeath.trim()))
              }
            >
              {dischargeMutation.isPending ? "Discharging…" : "Discharge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Backwards-compatible alias (internal code should prefer `PatientStoryboard`). */
export const PatientDemographicsSidebar = PatientStoryboard;
