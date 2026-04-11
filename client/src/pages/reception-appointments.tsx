import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import {
  ADMITTED_PATIENT_STATUS_BADGE_CLASS,
  ADMITTED_PATIENT_STATUS_LABEL,
  appointmentStatusBadgeClass,
  formatAppointmentStatusLabel,
} from "@/lib/appointment-status";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, CalendarClock, UserCheck, XCircle } from "lucide-react";
import type { Appointment, Patient, User as UserType, CommonVisitReason } from "@shared/schema";
import { APPOINTMENT_REASON_FOR_VISIT_LABEL } from "@shared/appointment-labels";
import { EmptyState } from "@/components/empty-state";
import { excludeAppointmentsWithActiveAdmission } from "@/lib/exclude-admitted-appointments";
import { useTableSort } from "@/hooks/use-table-sort";
import { SortableGridHeaderButton } from "@/components/ui/sortable-table-head";
import { useTranslation } from "react-i18next";

/** Match saved reason text to a common-reason option (exact or "Label - detail" style). */
function matchingCommonVisitReasonLabel(
  storedReason: string,
  visitReasons: CommonVisitReason[]
): string | undefined {
  const t = storedReason.trim();
  if (!t || visitReasons.length === 0) return undefined;
  if (visitReasons.some((r) => r.label === t)) return t;
  const sorted = [...visitReasons].sort((a, b) => b.label.length - a.label.length);
  for (const r of sorted) {
    if (t === r.label) return r.label;
    if (t.startsWith(r.label + " - ") || t.startsWith(r.label + " – ") || t.startsWith(r.label + " — "))
      return r.label;
  }
  return undefined;
}

type SortKey =
  | "time"
  | "patient"
  | "mrn"
  | "clinician"
  | "duration"
  | "status"
  | "reason";

type AdmittedSortKey = "patient" | "mrn" | "clinician" | "status" | "reason" | "bed" | "admittedAt";

type ApptRow = Appointment & {
  patientName: string;
  mrn: string;
  clinicianName: string;
};

type ActiveAdmissionRow = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  bedId: string;
  bedName: string;
  admittedAt: string | Date | null;
  clinicianId: string;
  scheduledDate: string | Date;
  status: string;
  reason: string | null;
};

export default function ReceptionAppointmentsPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();
  const today = new Date();
  const [viewingDate, setViewingDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("time", "asc");
  const {
    sortKey: admittedSortKey,
    sortDir: admittedSortDir,
    toggleSort: toggleAdmittedSort,
  } = useTableSort<AdmittedSortKey>("admittedAt", "desc");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleForm, setRescheduleForm] = useState({
    clinicianId: "",
    scheduledDate: "",
    scheduledTime: "09:00",
    duration: 30,
    reason: "",
  });

  const viewingDayStart = startOfDay(viewingDate).toISOString();
  const viewingDayEnd = endOfDay(viewingDate).toISOString();

  /** Toolbar "Schedule New Appointment" / other flows: show the day the booking was made for */
  useEffect(() => {
    const onFocusDay = (e: Event) => {
      const ymd = (e as CustomEvent<{ ymd?: string }>).detail?.ymd;
      if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
      const [y, m, d] = ymd.split("-").map(Number);
      setViewingDate(new Date(y, m - 1, d));
    };
    window.addEventListener("ehr-appointments-focus-day", onFocusDay);
    return () => window.removeEventListener("ehr-appointments-focus-day", onFocusDay);
  }, []);

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", "day", viewingDayStart, viewingDayEnd],
    queryFn: async () => {
      const res = await fetch(
        `/api/appointments?start=${encodeURIComponent(viewingDayStart)}&end=${encodeURIComponent(viewingDayEnd)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: admissions = [], isLoading: admissionsLoading } = useQuery<ActiveAdmissionRow[]>({
    queryKey: ["/api/admissions/active"],
    queryFn: async () => {
      const res = await fetch("/api/admissions/active", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  /** Overnight walk-ins: show under Admitted Patients only, not in this table. */
  const appointmentsForSchedule = useMemo(
    () => excludeAppointmentsWithActiveAdmission(appointments, admissions),
    [appointments, admissions],
  );

  useEffect(() => {
    if (selectedId && !appointmentsForSchedule.some((a) => a.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, appointmentsForSchedule]);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const res = await fetch("/api/patients", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: visitReasons = [] } = useQuery<CommonVisitReason[]>({
    queryKey: ["/api/common-visit-reasons"],
    queryFn: async () => {
      const res = await fetch("/api/common-visit-reasons", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const patchAppointmentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || "Failed to update appointment");
      }
      return res.json() as Promise<Appointment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
  });

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const clinicians = users.filter((u) => u.role === "clinician");

  const rows: ApptRow[] = useMemo(() => {
    return appointmentsForSchedule.map((apt) => {
      const p = patientMap.get(apt.patientId);
      const c = userMap.get(apt.clinicianId);
      return {
        ...apt,
        patientName: p ? `${p.firstName} ${p.lastName}` : "—",
        mrn: p?.mrn ?? "—",
        clinicianName: c?.fullName ?? "—",
      };
    });
  }, [appointmentsForSchedule, patientMap, userMap]);

  const sortedRows = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    const list = [...rows];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "time":
          cmp = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
          break;
        case "patient":
          cmp = a.patientName.localeCompare(b.patientName);
          break;
        case "mrn":
          cmp = a.mrn.localeCompare(b.mrn);
          break;
        case "clinician":
          cmp = a.clinicianName.localeCompare(b.clinicianName);
          break;
        case "duration":
          cmp = (a.duration ?? 30) - (b.duration ?? 30);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "reason":
          cmp = (a.reason ?? "").localeCompare(b.reason ?? "");
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const selectedAppt = selectedId ? appointmentsForSchedule.find((a) => a.id === selectedId) : undefined;
  const selectedPatient = selectedAppt ? patientMap.get(selectedAppt.patientId) : undefined;

  const canStartCheckIn =
    selectedAppt &&
    selectedPatient &&
    (selectedAppt.status === "scheduled" || selectedAppt.status === "confirmed");

  const canRescheduleOrCancel = selectedAppt?.status === "scheduled";

  /** When the dialog opens (or selection changes), load the current appointment into the form. */
  const rescheduleSyncRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!rescheduleOpen || !selectedAppt) {
      if (!rescheduleOpen) rescheduleSyncRef.current = null;
      return;
    }
    if (rescheduleSyncRef.current === selectedAppt.id) return;
    rescheduleSyncRef.current = selectedAppt.id;
    const d = new Date(selectedAppt.scheduledDate);
    setRescheduleForm({
      clinicianId: selectedAppt.clinicianId,
      scheduledDate: format(d, "yyyy-MM-dd"),
      scheduledTime: format(d, "HH:mm"),
      duration: selectedAppt.duration ?? 30,
      reason: selectedAppt.reason ?? "",
    });
  }, [rescheduleOpen, selectedAppt]);

  const openReschedule = () => {
    if (!selectedAppt) return;
    setRescheduleOpen(true);
  };

  const submitReschedule = () => {
    if (!selectedAppt || !rescheduleForm.clinicianId) return;
    const dateTime = new Date(`${rescheduleForm.scheduledDate}T${rescheduleForm.scheduledTime}`);
    patchAppointmentMutation.mutate(
      {
        id: selectedAppt.id,
        body: {
          scheduledDate: dateTime.toISOString(),
          clinicianId: rescheduleForm.clinicianId,
          duration: rescheduleForm.duration,
          reason: rescheduleForm.reason.trim() || null,
          status: "scheduled",
        },
      },
      {
        onSuccess: (updated) => {
          toast({ title: "Appointment rescheduled" });
          setRescheduleOpen(false);
          const nd = new Date(updated.scheduledDate);
          setViewingDate(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()));
          setSelectedId(updated.id);
        },
        onError: (e: Error) =>
          toast({ title: "Could not reschedule", description: e.message, variant: "destructive" }),
      }
    );
  };

  const confirmCancel = () => {
    if (!selectedAppt) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast({
        title: "Cancellation reason required",
        description: "Please enter why this appointment is being cancelled.",
        variant: "destructive",
      });
      return;
    }
    patchAppointmentMutation.mutate(
      { id: selectedAppt.id, body: { status: "cancelled", cancellationReason: reason } },
      {
        onSuccess: () => {
          toast({ title: "Appointment cancelled" });
          setCancelOpen(false);
          setCancelReason("");
          setSelectedId(null);
        },
        onError: (e: Error) =>
          toast({ title: "Could not cancel", description: e.message, variant: "destructive" }),
      }
    );
  };

  const sortedAdmissions = useMemo(() => {
    const list = [...admissions];
    const mult = admittedSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const pA = patientMap.get(a.patientId);
      const pB = patientMap.get(b.patientId);
      const cA = userMap.get(a.clinicianId);
      const cB = userMap.get(b.clinicianId);
      const patientName = (p: Patient | undefined) => (p ? `${p.firstName} ${p.lastName}` : "—");
      let cmp = 0;
      switch (admittedSortKey) {
        case "patient":
          cmp = patientName(pA).localeCompare(patientName(pB));
          break;
        case "mrn":
          cmp = (pA?.mrn ?? "").localeCompare(pB?.mrn ?? "");
          break;
        case "clinician":
          cmp = (cA?.fullName ?? "").localeCompare(cB?.fullName ?? "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "reason":
          cmp = (a.reason ?? "").localeCompare(b.reason ?? "");
          break;
        case "bed":
          cmp = a.bedName.localeCompare(b.bedName);
          break;
        case "admittedAt":
          cmp =
            new Date(a.admittedAt ?? 0).getTime() - new Date(b.admittedAt ?? 0).getTime();
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return list;
  }, [admissions, admittedSortKey, admittedSortDir, patientMap, userMap]);

  const goToCheckIn = () => {
    if (!selectedAppt || !selectedPatient) return;
    navigate(`/appointments/check-in/${selectedAppt.id}`);
  };

  const isToday =
    viewingDate.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto" data-testid="reception-appointments-page">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pages.appointments.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 justify-end w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 min-h-8 p-0 shrink-0 [&_svg]:size-3.5"
            onClick={() => setViewingDate((d) => subDays(d, 1))}
            aria-label={t("pages.receptionAppointments.previousDay")}
          >
            <ChevronLeft />
          </Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="min-w-[168px] h-8 text-xs">
                {format(viewingDate, "EEE, MMM d, yyyy")}
                {isToday && <span className="text-muted-foreground ml-1">{t("pages.receptionAppointments.today")}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={viewingDate}
                onSelect={(date) => {
                  if (!date) return;
                  setViewingDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
                  setDatePickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 min-h-8 p-0 shrink-0 [&_svg]:size-3.5"
            onClick={() => setViewingDate((d) => addDays(d, 1))}
            aria-label={t("pages.receptionAppointments.nextDay")}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("pages.receptionAppointments.rescheduleAppointment")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitReschedule();
            }}
          >
            <div className="space-y-2">
              <Label>Clinician *</Label>
              <Select
                value={rescheduleForm.clinicianId}
                onValueChange={(v) => setRescheduleForm((f) => ({ ...f, clinicianId: v }))}
              >
                <SelectTrigger data-testid="reception-reschedule-clinician">
                  <SelectValue placeholder="Select clinician" />
                </SelectTrigger>
                <SelectContent>
                  {clinicians.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={rescheduleForm.scheduledDate}
                  onChange={(e) => setRescheduleForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                  required
                  data-testid="reception-reschedule-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={rescheduleForm.scheduledTime}
                  onChange={(e) => setRescheduleForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                  required
                  data-testid="reception-reschedule-time"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Select
                value={String(rescheduleForm.duration)}
                onValueChange={(v) => setRescheduleForm((f) => ({ ...f, duration: parseInt(v, 10) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{APPOINTMENT_REASON_FOR_VISIT_LABEL}</Label>
              <Select
                value={matchingCommonVisitReasonLabel(rescheduleForm.reason, visitReasons)}
                onValueChange={(v) => setRescheduleForm((f) => ({ ...f, reason: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Quick pick (optional)" />
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
                value={rescheduleForm.reason}
                onChange={(e) => setRescheduleForm((f) => ({ ...f, reason: e.target.value }))}
                className="resize-none"
                placeholder="Reason for visit…"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setRescheduleOpen(false)}>
                Close
              </Button>
              <Button
                type="submit"
                disabled={patchAppointmentMutation.isPending || !rescheduleForm.clinicianId}
                data-testid="reception-reschedule-submit"
              >
                {patchAppointmentMutation.isPending ? "Saving…" : "Save new time"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the appointment as cancelled. The patient can be scheduled again later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2 py-1">
            <Label htmlFor="reception-cancellation-reason">Cancellation reason *</Label>
            <Textarea
              id="reception-cancellation-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Patient requested, no-show risk, schedule conflict…"
              rows={3}
              className="resize-none"
              data-testid="reception-cancellation-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => confirmCancel()}
              disabled={patchAppointmentMutation.isPending || !cancelReason.trim()}
              data-testid="reception-cancel-confirm"
            >
              {patchAppointmentMutation.isPending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="border-2 shadow-sm" data-testid="reception-same-day-visits">
        <CardHeader className="space-y-0 border-b bg-muted/40 px-4 py-3 sm:px-5">
          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Same Day Visits</p>
              <p className="text-xs text-muted-foreground">
                Outpatient appointments for the day you are viewing. Select a row to reschedule, cancel, or check in.
              </p>
            </div>
            <div
              className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto"
              data-testid="reception-appt-actions"
            >
              <Badge variant="secondary" className="text-[10px]">
                {sortedRows.length} appointment{sortedRows.length !== 1 ? "s" : ""}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openReschedule}
                disabled={!canRescheduleOrCancel || patchAppointmentMutation.isPending}
                className="h-8 min-h-8 gap-1 border-border bg-background px-2.5 text-xs shadow-sm [&_svg]:size-3.5"
                data-testid="reception-reschedule"
              >
                <CalendarClock />
                Reschedule
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
                disabled={!canRescheduleOrCancel || patchAppointmentMutation.isPending}
                className="h-8 min-h-8 gap-1 border-border bg-background px-2.5 text-xs text-destructive shadow-sm hover:text-destructive [&_svg]:size-3.5"
                data-testid="reception-cancel-appointment"
              >
                <XCircle />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={goToCheckIn}
                disabled={!canStartCheckIn}
                className="h-8 min-h-8 gap-1 px-2.5 text-xs shadow-sm [&_svg]:size-3.5"
                data-testid="reception-check-in-open"
              >
                <UserCheck />
                Check in
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto rounded-b-xl p-0">
          {isLoading ? (
            <p className="p-8 text-center text-muted-foreground">Loading…</p>
          ) : (
            <div className="min-w-[780px]">
              <div
                className="grid grid-cols-[5.5rem_1fr_6.5rem_1fr_4rem_6.5rem_1fr] bg-muted/60 border-b border-border"
                role="row"
              >
                <SortableGridHeaderButton
                  active={sortKey === "time"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("time")}
                >
                  Time
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={sortKey === "patient"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("patient")}
                >
                  Patient
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={sortKey === "mrn"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("mrn")}
                >
                  MRN
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={sortKey === "clinician"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("clinician")}
                >
                  Clinician
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={sortKey === "duration"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("duration")}
                  className="justify-center"
                >
                  Dur.
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={sortKey === "status"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("status")}
                >
                  Status
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={sortKey === "reason"}
                  sortDir={sortDir}
                  onSort={() => toggleSort("reason")}
                >
                  {APPOINTMENT_REASON_FOR_VISIT_LABEL}
                </SortableGridHeaderButton>
              </div>
              {sortedRows.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">No appointments on this day.</div>
              ) : (
                sortedRows.map((apt) => {
                  const selected = apt.id === selectedId;
                  return (
                    <button
                      key={apt.id}
                      type="button"
                      onClick={() => setSelectedId(apt.id)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/patients/${apt.patientId}?tab=overview&chartEntry=browse`);
                      }}
                      title="Double-click to open patient chart"
                      className={`grid grid-cols-[5.5rem_1fr_6.5rem_1fr_4rem_6.5rem_1fr] w-full text-left text-xs font-mono border-b border-border last:border-b-0 hover:bg-muted/30 ${
                        selected ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : "bg-background"
                      }`}
                      data-testid={`reception-appt-row-${apt.id}`}
                    >
                      <span className="px-2 py-2 border-r border-border/80 whitespace-nowrap font-medium">
                        {format(new Date(apt.scheduledDate), "HH:mm")}
                      </span>
                      <span className="px-2 py-2 border-r border-border/80 truncate">{apt.patientName}</span>
                      <span className="px-2 py-2 border-r border-border/80 text-muted-foreground truncate">{apt.mrn}</span>
                      <span className="px-2 py-2 border-r border-border/80 truncate">{apt.clinicianName}</span>
                      <span className="px-2 py-2 border-r border-border/80 text-center">{apt.duration ?? 30}</span>
                      <span className="px-2 py-2 border-r border-border/80">
                        <Badge variant="secondary" className={`text-[10px] capitalize ${appointmentStatusBadgeClass(apt.status)}`}>
                          {formatAppointmentStatusLabel(apt.status)}
                        </Badge>
                      </span>
                      <span className="px-2 py-2 truncate" title={apt.reason ?? ""}>
                        {apt.reason || "—"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-2 shadow-sm" data-testid="reception-admitted-patients">
        <CardHeader className="space-y-0 border-b bg-muted/40 px-4 py-3 sm:px-5">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">Admitted Patients</p>
              <p className="text-xs text-muted-foreground">Overnight visits remain here until discharged.</p>
            </div>
            <Badge variant="secondary" className="text-[10px]">
              {admissions.length} Admissions
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto rounded-b-xl p-0">
          {admissionsLoading ? (
            <p className="p-8 text-center text-muted-foreground text-sm">Loading…</p>
          ) : admissions.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No admitted patients" description="Overnight walk-ins appear here until discharged." />
            </div>
          ) : (
            <div className="min-w-[1180px]">
              <div
                className="grid grid-cols-[minmax(0,1.2fr)_6.5rem_minmax(0,1fr)_5.75rem_minmax(0,1.2fr)_minmax(5rem,7rem)_minmax(9.5rem,11rem)] bg-muted/60 border-b border-border"
                role="row"
              >
                <SortableGridHeaderButton
                  active={admittedSortKey === "patient"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("patient")}
                >
                  Patient
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={admittedSortKey === "mrn"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("mrn")}
                >
                  MRN
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={admittedSortKey === "clinician"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("clinician")}
                >
                  Clinician
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={admittedSortKey === "status"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("status")}
                >
                  Status
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={admittedSortKey === "reason"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("reason")}
                >
                  {APPOINTMENT_REASON_FOR_VISIT_LABEL}
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={admittedSortKey === "bed"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("bed")}
                >
                  Bed / Room
                </SortableGridHeaderButton>
                <SortableGridHeaderButton
                  active={admittedSortKey === "admittedAt"}
                  sortDir={admittedSortDir}
                  onSort={() => toggleAdmittedSort("admittedAt")}
                >
                  Admission Date
                </SortableGridHeaderButton>
              </div>
              {sortedAdmissions.map((a) => {
                const p = patientMap.get(a.patientId);
                const clinician = userMap.get(a.clinicianId);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate(`/patients/${a.patientId}?tab=overview&chartEntry=browse`)}
                    className="grid grid-cols-[minmax(0,1.2fr)_6.5rem_minmax(0,1fr)_5.75rem_minmax(0,1.2fr)_minmax(5rem,7rem)_minmax(9.5rem,11rem)] w-full min-w-0 text-left text-xs border-b border-border last:border-b-0 hover:bg-muted/30 bg-background items-center"
                  >
                    <span className="px-2 py-2 border-r border-border/80 min-w-0 truncate">
                      {p ? `${p.firstName} ${p.lastName}` : "—"}
                    </span>
                    <span className="px-2 py-2 border-r border-border/80 text-muted-foreground min-w-0 truncate">
                      {p?.mrn ?? "—"}
                    </span>
                    <span className="px-2 py-2 border-r border-border/80 min-w-0 truncate">
                      {clinician?.fullName ?? "—"}
                    </span>
                    <span className="px-2 py-2 border-r border-border/80 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-medium border ${ADMITTED_PATIENT_STATUS_BADGE_CLASS}`}
                      >
                        {ADMITTED_PATIENT_STATUS_LABEL}
                      </Badge>
                    </span>
                    <span className="px-2 py-2 border-r border-border/80 min-w-0 truncate" title={a.reason ?? ""}>
                      {a.reason || "—"}
                    </span>
                    <span className="px-2 py-2 border-r border-border/80 min-w-0 truncate">{a.bedName}</span>
                    <span className="px-2 py-2 min-w-0 truncate whitespace-nowrap">
                      {a.admittedAt ? format(new Date(a.admittedAt), "MMMM d, yyyy") : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
