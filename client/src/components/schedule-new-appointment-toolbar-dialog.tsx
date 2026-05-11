import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { fr as frDateLocale } from "date-fns/locale/fr";
import { es as esDateLocale } from "date-fns/locale/es";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarPlus, DoorOpen, CalendarClock } from "lucide-react";
import { PatientSearchCombobox } from "@/components/patient-search-combobox";
import { BedSelect } from "@/components/bed-select";
import type { Patient, User as UserType, CommonVisitReason } from "@shared/schema";
import { useTranslation } from "react-i18next";

type Flow = "choose" | "walkin" | "future";

const defaultForm = () => {
  const now = new Date();
  return {
    clinicianId: "",
    scheduledDate: format(now, "yyyy-MM-dd"),
    scheduledTime: format(now, "HH:mm"),
    duration: 30,
    reason: "",
    overnightVisit: "no" as "yes" | "no",
    bedId: "",
  };
};

export function ScheduleNewAppointmentToolbarDialog() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<Flow>("choose");
  const [form, setForm] = useState(defaultForm);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  /** Local calendar date for "today" (min date for future bookings, walk-in anchor). */
  const todayYmd = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!open) {
      setFlow("choose");
      setForm(defaultForm());
      setSelectedPatient(null);
    }
  }, [open]);

  const dateLocale = useMemo(() => {
    const base = (i18n.language || "en").split("-")[0];
    if (base === "fr") return frDateLocale;
    if (base === "es") return esDateLocale;
    return enUS;
  }, [i18n.language]);

  const { data: visitReasons = [] } = useQuery<CommonVisitReason[]>({
    queryKey: ["/api/common-visit-reasons"],
    queryFn: async () => {
      const res = await fetch("/api/common-visit-reasons", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open && !!token && user?.role === "reception",
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open && !!token && user?.role === "reception",
  });

  const providers = users.filter((u) => u.role === "clinician" || u.role === "nurse");

  const createMutation = useMutation({
    mutationFn: async (payload: {
      patientId: string;
      clinicianId: string;
      scheduledDate: string;
      scheduledTime: string;
      duration: number;
      reason: string;
      status: "checked_in" | "scheduled";
      overnightVisit: "yes" | "no";
      bedId?: string;
    }) => {
      const dateTime = new Date(`${payload.scheduledDate}T${payload.scheduledTime}`);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: payload.patientId,
          clinicianId: payload.clinicianId,
          scheduledDate: dateTime.toISOString(),
          duration: payload.duration,
          reason: payload.reason || undefined,
          status: payload.status,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
          issues?: { path: string; message: string }[];
          errors?: Record<string, string[] | { _errors: string[] }>;
        };
        const detail =
          err.issues?.map((i) => `${i.path || "?"}: ${i.message}`).join(" · ") ||
          (err.errors ? JSON.stringify(err.errors) : "");
        throw new Error(
          [err.message || t("pages.receptionScheduleDialog.errCreateAppointment"), detail].filter(Boolean).join(" — ")
        );
      }
      const appt = await res.json();

      if (payload.status === "checked_in" && payload.overnightVisit === "yes") {
        if (!payload.bedId) throw new Error(t("pages.receptionScheduleDialog.errSelectBed"));
        const ar = await fetch("/api/admissions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            bedId: payload.bedId,
            patientId: payload.patientId,
            appointmentId: appt.id,
          }),
        });
        if (!ar.ok) {
          const err = await ar.json().catch(() => ({}));
          throw new Error(err.message || t("pages.receptionScheduleDialog.errAdmitPatient"));
        }
      }

      return appt;
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admissions/active"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/beds/available"] });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
      window.dispatchEvent(
        new CustomEvent("ehr-appointments-focus-day", { detail: { ymd: variables.scheduledDate } })
      );
      const overnightWalkIn =
        variables.status === "checked_in" && variables.overnightVisit === "yes";
      toast({
        title:
          variables.status === "checked_in"
            ? t("pages.receptionScheduleDialog.toastWalkInCheckedIn")
            : t("pages.receptionScheduleDialog.toastScheduled"),
        description: overnightWalkIn
          ? t("pages.receptionScheduleDialog.toastDescAdmittedUntilDischarged")
          : variables.status === "checked_in"
            ? t("pages.receptionScheduleDialog.toastDescCheckedInToday")
            : t("pages.receptionScheduleDialog.toastDescScheduledDay"),
      });
      setOpen(false);
    },
    onError: (error: Error) =>
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      }),
  });

  const startWalkIn = () => {
    const now = new Date();
    setForm({
      ...defaultForm(),
      scheduledDate: format(now, "yyyy-MM-dd"),
      scheduledTime: format(now, "HH:mm"),
    });
    setFlow("walkin");
  };

  const startFuture = () => {
    const tomorrow = addDays(new Date(), 1);
    setForm({
      ...defaultForm(),
      scheduledDate: format(tomorrow, "yyyy-MM-dd"),
      scheduledTime: "09:00",
    });
    setFlow("future");
  };

  const submit = (status: "checked_in" | "scheduled") => {
    if (!selectedPatient?.id || !form.clinicianId) {
      toast({
        title: t("pages.receptionScheduleDialog.missingFieldsTitle"),
        description: t("pages.receptionScheduleDialog.missingFieldsDesc"),
        variant: "destructive",
      });
      return;
    }
    // Walk-in: always this calendar day (local), at submit time — not a stale form value.
    // Future: use the date the receptionist picked in the date field.
    const appointmentDateYmd =
      flow === "walkin" ? format(new Date(), "yyyy-MM-dd") : form.scheduledDate;
    if (flow === "future" && !appointmentDateYmd) {
      toast({
        title: t("pages.receptionScheduleDialog.selectDateTitle"),
        description: t("pages.receptionScheduleDialog.selectDateDesc"),
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      patientId: selectedPatient.id,
      clinicianId: form.clinicianId,
      scheduledDate: appointmentDateYmd,
      scheduledTime: form.scheduledTime,
      duration: flow === "walkin" && form.overnightVisit === "yes" ? 30 : form.duration,
      reason: form.reason,
      status,
      overnightVisit: flow === "walkin" ? form.overnightVisit : "no",
      bedId: flow === "walkin" && form.overnightVisit === "yes" ? form.bedId : undefined,
    });
  };

  if (user?.role !== "reception") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="inline-flex items-center gap-2 px-3 py-2 h-auto rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          data-testid="toolbar-schedule-new-appointment"
        >
          <CalendarPlus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">{t("pages.receptionScheduleDialog.triggerLong")}</span>
          <span className="sm:hidden">{t("pages.receptionScheduleDialog.triggerShort")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-schedule-new-appointment">
        {flow === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("pages.receptionScheduleDialog.chooseTitle")}</DialogTitle>
              <DialogDescription>{t("pages.receptionScheduleDialog.chooseDescription")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 pt-2">
              <button
                type="button"
                onClick={startWalkIn}
                className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="option-walk-in"
              >
                <DoorOpen className="w-5 h-5 text-primary shrink-0" />
                <span className="font-medium">{t("pages.receptionScheduleDialog.walkInOption")}</span>
              </button>
              <button
                type="button"
                onClick={startFuture}
                className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="option-future-appointment"
              >
                <CalendarClock className="w-5 h-5 text-primary shrink-0" />
                <span className="font-medium">{t("pages.receptionScheduleDialog.futureOption")}</span>
              </button>
            </div>
          </>
        )}

        {(flow === "walkin" || flow === "future") && (
          <>
            <DialogHeader>
              <DialogTitle>
                {flow === "walkin"
                  ? t("pages.receptionScheduleDialog.walkInTitle")
                  : t("pages.receptionScheduleDialog.futureTitle")}
              </DialogTitle>
              <DialogDescription>
                {flow === "walkin"
                  ? t("pages.receptionScheduleDialog.walkInDescription")
                  : t("pages.receptionScheduleDialog.futureDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label>{t("pages.receptionScheduleDialog.labelPatient")}</Label>
                <PatientSearchCombobox
                  token={token}
                  value={selectedPatient}
                  onChange={setSelectedPatient}
                  triggerTestId="schedule-appt-select-patient"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("pages.receptionScheduleDialog.labelProvider")}</Label>
                <Select value={form.clinicianId} onValueChange={(v) => setForm((f) => ({ ...f, clinicianId: v }))}>
                  <SelectTrigger data-testid="schedule-appt-select-provider">
                    <SelectValue placeholder={t("pages.receptionScheduleDialog.placeholderSelectProvider")} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fullName}
                        {p.role === "nurse"
                          ? t("pages.receptionScheduleDialog.roleNurseSuffix")
                          : t("pages.receptionScheduleDialog.roleClinicianSuffix")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {flow === "walkin" && (
                <>
                  <div className="space-y-2">
                    <Label>{t("pages.receptionScheduleDialog.labelOvernight")}</Label>
                    <Select
                      value={form.overnightVisit}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          overnightVisit: v === "yes" ? "yes" : "no",
                          bedId: v === "yes" ? f.bedId : "",
                        }))
                      }
                    >
                      <SelectTrigger data-testid="walkin-overnight-visit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">{t("common.no")}</SelectItem>
                        <SelectItem value="yes">{t("common.yes")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.overnightVisit === "yes" && (
                    <div className="space-y-2">
                      <Label>{t("pages.receptionScheduleDialog.labelAssignBed")}</Label>
                      <BedSelect
                        token={token}
                        facilityId={user?.facilityId ?? undefined}
                        value={form.bedId}
                        onChange={(bedId) => setForm((f) => ({ ...f, bedId }))}
                        data-testid="walkin-bed-select"
                      />
                    </div>
                  )}
                </>
              )}
              {flow === "walkin" ? (
                <div className="space-y-2">
                  <Label>{t("pages.receptionScheduleDialog.labelDateToday")}</Label>
                  <Input
                    type="text"
                    value={format(new Date(), "EEEE, MMM d, yyyy", { locale: dateLocale })}
                    readOnly
                    disabled
                    className="bg-muted"
                    data-testid="schedule-appt-walkin-date-display"
                  />
                  <p className="text-xs text-muted-foreground">{t("pages.receptionScheduleDialog.walkInDateHint")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{t("pages.receptionScheduleDialog.labelDate")}</Label>
                  <Input
                    type="date"
                    value={form.scheduledDate}
                    min={todayYmd}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                    data-testid="schedule-appt-input-date"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{t("pages.receptionScheduleDialog.labelTime")}</Label>
                <Input
                  type="time"
                  value={form.scheduledTime}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                  data-testid="schedule-appt-input-time"
                />
              </div>
            {!(flow === "walkin" && form.overnightVisit === "yes") && (
              <div className="space-y-2">
                <Label>{t("pages.receptionScheduleDialog.labelDurationMinutes")}</Label>
                <Select
                  value={String(form.duration)}
                  onValueChange={(v) => setForm((f) => ({ ...f, duration: parseInt(v, 10) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">{t("pages.receptionScheduleDialog.durationOption", { minutes: 15 })}</SelectItem>
                    <SelectItem value="30">{t("pages.receptionScheduleDialog.durationOption", { minutes: 30 })}</SelectItem>
                    <SelectItem value="45">{t("pages.receptionScheduleDialog.durationOption", { minutes: 45 })}</SelectItem>
                    <SelectItem value="60">{t("pages.receptionScheduleDialog.durationOption", { minutes: 60 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
              <div className="space-y-2">
                <Label>{t("pages.schedule.col.reasonForVisit")}</Label>
                <Select
                  value={visitReasons.some((r) => r.label === form.reason) ? form.reason : undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}
                >
                  <SelectTrigger data-testid="schedule-appt-common-reason">
                    <SelectValue placeholder={t("pages.receptionScheduleDialog.commonReasonPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {visitReasons.map((r) => (
                      <SelectItem key={r.id} value={r.label}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="resize-none"
                  placeholder={t("pages.receptionScheduleDialog.reasonTextareaPlaceholder")}
                  rows={2}
                />
              </div>
              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button type="button" variant="secondary" onClick={() => setFlow("choose")}>
                  {t("pages.receptionScheduleDialog.back")}
                </Button>
                <Button
                  type="button"
                  disabled={
                    createMutation.isPending ||
                    !selectedPatient?.id ||
                    !form.clinicianId ||
                    (flow === "walkin" && form.overnightVisit === "yes" && !form.bedId)
                  }
                  onClick={() => submit(flow === "walkin" ? "checked_in" : "scheduled")}
                  data-testid="schedule-appt-submit"
                >
                  {createMutation.isPending
                    ? t("pages.receptionScheduleDialog.saving")
                    : flow === "walkin"
                      ? t("pages.receptionScheduleDialog.submitWalkIn")
                      : t("pages.receptionScheduleDialog.submitFuture")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
