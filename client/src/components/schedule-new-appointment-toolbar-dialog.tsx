import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
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
import type { Patient, User as UserType, CommonVisitReason } from "@shared/schema";

type Flow = "choose" | "walkin" | "future";

const defaultForm = () => {
  const now = new Date();
  return {
    clinicianId: "",
    scheduledDate: format(now, "yyyy-MM-dd"),
    scheduledTime: format(now, "HH:mm"),
    duration: 30,
    reason: "",
    notes: "",
  };
};

export function ScheduleNewAppointmentToolbarDialog() {
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
      notes: string;
      status: "checked_in" | "scheduled";
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
          notes: payload.notes || undefined,
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
          [err.message || "Failed to create appointment", detail].filter(Boolean).join(" — ")
        );
      }
      return res.json();
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
      window.dispatchEvent(
        new CustomEvent("ehr-appointments-focus-day", { detail: { ymd: variables.scheduledDate } })
      );
      toast({
        title: variables.status === "checked_in" ? "Walk-in checked in" : "Appointment scheduled",
        description:
          variables.status === "checked_in"
            ? "The visit appears on today’s Appointments and Schedule as Checked in."
            : "The appointment appears on the Appointments list for the selected day.",
      });
      setOpen(false);
    },
    onError: (error: Error) =>
      toast({ title: "Error", description: error.message, variant: "destructive" }),
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
      toast({ title: "Missing fields", description: "Select a patient and a clinician or nurse.", variant: "destructive" });
      return;
    }
    // Walk-in: always this calendar day (local), at submit time — not a stale form value.
    // Future: use the date the receptionist picked in the date field.
    const appointmentDateYmd =
      flow === "walkin" ? format(new Date(), "yyyy-MM-dd") : form.scheduledDate;
    if (flow === "future" && !appointmentDateYmd) {
      toast({ title: "Select a date", description: "Choose the day for this appointment.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      patientId: selectedPatient.id,
      clinicianId: form.clinicianId,
      scheduledDate: appointmentDateYmd,
      scheduledTime: form.scheduledTime,
      duration: form.duration,
      reason: form.reason,
      notes: form.notes,
      status,
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
          <span className="hidden sm:inline">New Appointment</span>
          <span className="sm:hidden">New Appt</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-schedule-new-appointment">
        {flow === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>Schedule new appointment</DialogTitle>
              <DialogDescription>Choose how you want to add this visit.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 pt-2">
              <button
                type="button"
                onClick={startWalkIn}
                className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="option-walk-in"
              >
                <DoorOpen className="w-5 h-5 text-primary shrink-0" />
                <span className="font-medium">Walk in</span>
              </button>
              <button
                type="button"
                onClick={startFuture}
                className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="option-future-appointment"
              >
                <CalendarClock className="w-5 h-5 text-primary shrink-0" />
                <span className="font-medium">Future appointment</span>
              </button>
            </div>
          </>
        )}

        {(flow === "walkin" || flow === "future") && (
          <>
            <DialogHeader>
              <DialogTitle>{flow === "walkin" ? "Walk-in (today)" : "Future appointment"}</DialogTitle>
              <DialogDescription>
                {flow === "walkin"
                  ? "Patient is here now. The visit is booked for today’s date (below) at the time you set, and marked checked in."
                  : "The appointment uses the date and time you select below and appears on that day in Appointments and Schedule."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <PatientSearchCombobox
                  token={token}
                  value={selectedPatient}
                  onChange={setSelectedPatient}
                  triggerTestId="schedule-appt-select-patient"
                />
              </div>
              <div className="space-y-2">
                <Label>Clinician / nurse *</Label>
                <Select value={form.clinicianId} onValueChange={(v) => setForm((f) => ({ ...f, clinicianId: v }))}>
                  <SelectTrigger data-testid="schedule-appt-select-provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fullName}
                        {p.role === "nurse" ? " (Nurse)" : " (Clinician)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {flow === "walkin" ? (
                <div className="space-y-2">
                  <Label>Date (today)</Label>
                  <Input
                    type="text"
                    value={format(new Date(), "EEEE, MMM d, yyyy")}
                    readOnly
                    disabled
                    className="bg-muted"
                    data-testid="schedule-appt-walkin-date-display"
                  />
                  <p className="text-xs text-muted-foreground">
                    Walk-ins always use today’s date. Time below is the visit time.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Date *</Label>
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
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={form.scheduledTime}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                  data-testid="schedule-appt-input-time"
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Select
                  value={String(form.duration)}
                  onValueChange={(v) => setForm((f) => ({ ...f, duration: parseInt(v, 10) }))}
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
                <Label>Visit reason</Label>
                <Select
                  value={visitReasons.some((r) => r.label === form.reason) ? form.reason : undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}
                >
                  <SelectTrigger data-testid="schedule-appt-common-reason">
                    <SelectValue placeholder="Quick pick common reason (optional)" />
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
                  placeholder="Type or edit reason for visit…"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Appointment note</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="resize-none"
                  placeholder="Note for schedule / appointments list"
                  rows={2}
                />
              </div>
              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button type="button" variant="secondary" onClick={() => setFlow("choose")}>
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={createMutation.isPending || !selectedPatient?.id || !form.clinicianId}
                  onClick={() => submit(flow === "walkin" ? "checked_in" : "scheduled")}
                  data-testid="schedule-appt-submit"
                >
                  {createMutation.isPending
                    ? "Saving…"
                    : flow === "walkin"
                      ? "Create walk-in"
                      : "Schedule appointment"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
