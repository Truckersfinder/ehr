import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTableSort } from "@/hooks/use-table-sort";
import { PatientSearchCombobox } from "@/components/patient-search-combobox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  ADMITTED_PATIENT_STATUS_BADGE_CLASS,
  ADMITTED_PATIENT_STATUS_LABEL,
  appointmentStatusBadgeClass,
  formatAppointmentStatusLabel,
} from "@/lib/appointment-status";
import ReceptionAppointmentsPage from "@/pages/reception-appointments";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
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
import { Link, useLocation } from "wouter";
import type { Appointment, Patient, User as UserType, CommonVisitReason } from "@shared/schema";
import { APPOINTMENT_REASON_FOR_VISIT_LABEL } from "@shared/appointment-labels";
import { EmptyState } from "@/components/empty-state";
import { excludeAppointmentsWithActiveAdmission } from "@/lib/exclude-admitted-appointments";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";

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

type AdmittedSortKey = "patient" | "mrn" | "clinician" | "status" | "reason" | "bed" | "admittedAt";

function AppointmentsManagementPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { token } = useAuth();
  const orgTz = useOrgTimeZone();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<{ id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [formData, setFormData] = useState({
    clinicianId: "", scheduledDate: "", scheduledTime: "09:00",
    duration: 30, reason: "",
  });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: async () => {
      const res = await fetch("/api/appointments", { headers: { Authorization: `Bearer ${token}` } });
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

  const appointmentsForList = useMemo(
    () => excludeAppointmentsWithActiveAdmission(appointments, admissions),
    [appointments, admissions],
  );

  const { sortKey: admittedSortKey, sortDir: admittedSortDir, toggleSort: toggleAdmittedSort } =
    useTableSort<AdmittedSortKey>("admittedAt", "desc");

  const displayAdmissions = useMemo(() => {
    const list = [...admissions];
    const mult = admittedSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const pa = patientMap.get(a.patientId);
      const pb = patientMap.get(b.patientId);
      const ca = userMap.get(a.clinicianId);
      const cb = userMap.get(b.clinicianId);
      const patientName = (p: Patient | undefined) => (p ? `${p.firstName} ${p.lastName}` : "—");
      let cmp = 0;
      switch (admittedSortKey) {
        case "patient":
          cmp = patientName(pa).localeCompare(patientName(pb));
          break;
        case "mrn":
          cmp = (pa?.mrn ?? "").localeCompare(pb?.mrn ?? "");
          break;
        case "clinician":
          cmp = (ca?.fullName ?? "").localeCompare(cb?.fullName ?? "");
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
        duration: 30, reason: "",
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

  const grouped = appointmentsForList.reduce<Record<string, Appointment[]>>((acc, apt) => {
    const dateKey = formatInOrgTimeZone(apt.scheduledDate, "yyyy-MM-dd", orgTz);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(apt);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="appointments-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pages.appointments.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{appointmentsForList.length} total appointments</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setSelectedPatient(null);
              setFormData({
                clinicianId: "", scheduledDate: "", scheduledTime: "09:00",
                duration: 30, reason: "",
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
                <Label>{APPOINTMENT_REASON_FOR_VISIT_LABEL}</Label>
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
          const isToday = dateKey === formatInOrgTimeZone(Date.now(), "yyyy-MM-dd", orgTz);
          return (
            <div key={dateKey} className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {formatInOrgTimeZone(new Date(dateKey), "EEEE, MMMM d, yyyy", orgTz)}
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
                            <p className="text-sm font-bold">{formatInOrgTimeZone(apt.scheduledDate, "HH:mm", orgTz)}</p>
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

      <Card data-testid="appointments-admitted-patients">
        <CardHeader className="space-y-0 border-b bg-muted/40 px-4 py-3 sm:px-5">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 text-left">
              <p className="text-sm font-semibold">Admitted Patients</p>
              <p className="text-xs text-muted-foreground">Overnight visits remain here until discharged.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => navigate("/admissions/recently-discharged")}
                data-testid="button-recently-discharged"
              >
                Recently discharged
              </Button>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {admissions.length} Admissions
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {admissionsLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : admissions.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No admitted patients" description="Overnight walk-ins appear here until discharged." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1180px] w-full text-sm table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      className="whitespace-nowrap w-[18%]"
                      active={admittedSortKey === "patient"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("patient")}
                    >
                      Patient
                    </SortableTableHead>
                    <SortableTableHead
                      className="whitespace-nowrap w-[9%]"
                      active={admittedSortKey === "mrn"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("mrn")}
                    >
                      MRN
                    </SortableTableHead>
                    <SortableTableHead
                      className="whitespace-nowrap w-[18%]"
                      active={admittedSortKey === "clinician"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("clinician")}
                    >
                      Clinician
                    </SortableTableHead>
                    <SortableTableHead
                      className="whitespace-nowrap w-[8%]"
                      active={admittedSortKey === "status"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("status")}
                    >
                      Status
                    </SortableTableHead>
                    <SortableTableHead
                      className="whitespace-nowrap w-[22%]"
                      active={admittedSortKey === "reason"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("reason")}
                    >
                      {APPOINTMENT_REASON_FOR_VISIT_LABEL}
                    </SortableTableHead>
                    <SortableTableHead
                      className="whitespace-nowrap w-[12%]"
                      active={admittedSortKey === "bed"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("bed")}
                    >
                      Bed / Room
                    </SortableTableHead>
                    <SortableTableHead
                      className="whitespace-nowrap w-[11%]"
                      active={admittedSortKey === "admittedAt"}
                      sortDir={admittedSortDir}
                      onSort={() => toggleAdmittedSort("admittedAt")}
                    >
                      Admission Date
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayAdmissions.map((a) => {
                    const pt = patientMap.get(a.patientId);
                    const clinician = userMap.get(a.clinicianId);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium whitespace-nowrap truncate max-w-0">
                          <Link href={`/patients/${a.patientId}?fromAdmission=1&admissionId=${encodeURIComponent(a.id)}&tab=medication`}>
                            <a className="text-primary hover:underline">
                              {pt ? `${pt.firstName} ${pt.lastName}` : "—"}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                          {pt?.mrn ?? "—"}
                        </TableCell>
                        <TableCell className="truncate max-w-0 whitespace-nowrap">{clinician?.fullName ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-medium border ${ADMITTED_PATIENT_STATUS_BADGE_CLASS}`}
                          >
                            {ADMITTED_PATIENT_STATUS_LABEL}
                          </Badge>
                        </TableCell>
                        <TableCell className="truncate max-w-0" title={a.reason ?? ""}>
                          {a.reason ?? "—"}
                        </TableCell>
                        <TableCell className="truncate max-w-0 whitespace-nowrap">{a.bedName}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatInOrgTimeZone(a.admittedAt, "MMMM d, yyyy", orgTz)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
