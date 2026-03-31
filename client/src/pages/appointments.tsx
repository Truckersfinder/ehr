import { useState } from "react";
import { PatientSearchCombobox } from "@/components/patient-search-combobox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { appointmentStatusBadgeClass, formatAppointmentStatusLabel } from "@/lib/appointment-status";
import ReceptionAppointmentsPage from "@/pages/reception-appointments";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar, Clock, User } from "lucide-react";
import { format } from "date-fns";
import type { Appointment, Patient, User as UserType, CommonVisitReason } from "@shared/schema";

function AppointmentsManagementPage() {
  const { toast } = useToast();
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<{ id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [formData, setFormData] = useState({
    clinicianId: "", scheduledDate: "", scheduledTime: "09:00",
    duration: 30, reason: "", notes: "",
  });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: async () => {
      const res = await fetch("/api/appointments", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const res = await fetch("/api/patients", { headers: { Authorization: `Bearer ${token}` } });
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
    enabled: open && !!token,
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const clinicians = users.filter((u) => u.role === "clinician");
  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { patientId: string }) => {
      const dateTime = new Date(`${data.scheduledDate}T${data.scheduledTime}`);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: data.patientId,
          clinicianId: data.clinicianId,
          scheduledDate: dateTime.toISOString(),
          duration: data.duration,
          reason: data.reason,
          notes: data.notes,
          status: "scheduled",
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
          issues?: { path: string; message: string }[];
          errors?: unknown;
        };
        const detail =
          err.issues?.map((i) => `${i.path || "?"}: ${i.message}`).join(" · ") ||
          (err.errors ? JSON.stringify(err.errors) : "");
        throw new Error([err.message || "Failed to schedule", detail].filter(Boolean).join(" — "));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment scheduled" });
      setOpen(false);
      setSelectedPatient(null);
      setFormData({
        clinicianId: "", scheduledDate: "", scheduledTime: "09:00",
        duration: 30, reason: "", notes: "",
      });
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      cancellationReason,
    }: {
      id: string;
      status: string;
      cancellationReason?: string;
    }) => {
      const body: Record<string, unknown> = { status };
      if (status === "cancelled" && cancellationReason) {
        body.cancellationReason = cancellationReason;
      }
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment updated" });
    },
  });

  const grouped = appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
    const dateKey = format(new Date(apt.scheduledDate), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(apt);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="appointments-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground text-sm mt-1">{appointments.length} total appointments</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setSelectedPatient(null);
              setFormData({
                clinicianId: "", scheduledDate: "", scheduledTime: "09:00",
                duration: 30, reason: "", notes: "",
              });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button data-testid="button-new-appointment">
              <Plus className="w-4 h-4 mr-2" /> Schedule Appointment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedPatient?.id) return;
                createMutation.mutate({ ...formData, patientId: selectedPatient.id });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Patient *</Label>
                <PatientSearchCombobox
                  token={token}
                  value={selectedPatient}
                  onChange={setSelectedPatient}
                  triggerTestId="select-appt-patient"
                />
              </div>
              <div className="space-y-2">
                <Label>Clinician *</Label>
                <Select value={formData.clinicianId} onValueChange={(v) => setFormData({ ...formData, clinicianId: v })}>
                  <SelectTrigger data-testid="select-appt-clinician"><SelectValue placeholder="Select clinician" /></SelectTrigger>
                  <SelectContent>
                    {clinicians.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input data-testid="input-appt-date" type="date" value={formData.scheduledDate} onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Time *</Label>
                  <Input data-testid="input-appt-time" type="time" value={formData.scheduledTime} onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Select value={String(formData.duration)} onValueChange={(v) => setFormData({ ...formData, duration: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  value={visitReasons.some((r) => r.label === formData.reason) ? formData.reason : undefined}
                  onValueChange={(v) => setFormData({ ...formData, reason: v })}
                >
                  <SelectTrigger data-testid="select-appt-common-reason">
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
                  data-testid="input-appt-reason"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="resize-none"
                  placeholder="Type or edit reason for visit…"
                />
              </div>
              <div className="space-y-2">
                <Label>Appointment note</Label>
                <Textarea
                  data-testid="input-appt-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="resize-none"
                  placeholder="Note for this appointment (shown on Schedule as APT Note)"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="button-create-appointment" disabled={createMutation.isPending || !selectedPatient?.id || !formData.clinicianId}>
                  {createMutation.isPending ? "Scheduling..." : "Schedule"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No appointments</p>
          </CardContent>
        </Card>
      ) : (
        sortedDates.map((dateKey) => {
          const dayAppts = grouped[dateKey].sort(
            (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
          );
          const isToday = dateKey === format(new Date(), "yyyy-MM-dd");
          return (
            <div key={dateKey} className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {format(new Date(dateKey), "EEEE, MMMM d, yyyy")}
                {isToday && <Badge variant="secondary" className="text-[10px]">Today</Badge>}
              </h3>
              {dayAppts.map((apt) => {
                const pt = patientMap.get(apt.patientId);
                const doc = userMap.get(apt.clinicianId);
                return (
                  <Card key={apt.id} data-testid={`card-appointment-${apt.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="text-center min-w-[55px]">
                            <p className="text-sm font-bold">{format(new Date(apt.scheduledDate), "HH:mm")}</p>
                            <p className="text-[10px] text-muted-foreground">{apt.duration}min</p>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {doc ? `Dr. ${doc.fullName}` : ""} - {apt.reason || "General visit"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={`text-[10px] ${appointmentStatusBadgeClass(apt.status)}`}>
                            {formatAppointmentStatusLabel(apt.status)}
                          </Badge>
                          {apt.status === "scheduled" && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate({ id: apt.id, status: "checked_in" })}>Check In</Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setCancelDialog({ id: apt.id });
                                  setCancelReason("");
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                          {apt.status === "checked_in" && (
                            <Button size="sm" onClick={() => statusMutation.mutate({ id: apt.id, status: "completed" })}>Complete</Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })
      )}

      <Dialog
        open={!!cancelDialog}
        onOpenChange={(o) => {
          if (!o) {
            setCancelDialog(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment</DialogTitle>
            <DialogDescription>
              Enter why this appointment is being cancelled. This is saved with the appointment record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mgmt-cancellation-reason">Cancellation reason *</Label>
            <Textarea
              id="mgmt-cancellation-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Patient requested, schedule conflict…"
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCancelDialog(null)}>
              Back
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!cancelReason.trim() || statusMutation.isPending}
              onClick={() => {
                if (!cancelDialog) return;
                const r = cancelReason.trim();
                if (!r) return;
                statusMutation.mutate(
                  { id: cancelDialog.id, status: "cancelled", cancellationReason: r },
                  {
                    onSuccess: () => {
                      setCancelDialog(null);
                      setCancelReason("");
                    },
                  }
                );
              }}
            >
              {statusMutation.isPending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  if (user?.role === "reception") {
    return <ReceptionAppointmentsPage />;
  }
  return <AppointmentsManagementPage />;
}
