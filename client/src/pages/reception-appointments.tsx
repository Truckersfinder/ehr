import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/lib/auth";
import { appointmentStatusBadgeClass, formatAppointmentStatusLabel } from "@/lib/appointment-status";
import { ChevronLeft, ChevronRight, UserCheck } from "lucide-react";
import type { Appointment, Patient, User as UserType } from "@shared/schema";

type SortKey =
  | "time"
  | "patient"
  | "mrn"
  | "clinician"
  | "duration"
  | "status"
  | "reason"
  | "notes";

type ApptRow = Appointment & {
  patientName: string;
  mrn: string;
  clinicianName: string;
};

export default function ReceptionAppointmentsPage() {
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const today = new Date();
  const [viewingDate, setViewingDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rows: ApptRow[] = useMemo(() => {
    return appointments.map((apt) => {
      const p = patientMap.get(apt.patientId);
      const c = userMap.get(apt.clinicianId);
      return {
        ...apt,
        patientName: p ? `${p.firstName} ${p.lastName}` : "—",
        mrn: p?.mrn ?? "—",
        clinicianName: c?.fullName ?? "—",
      };
    });
  }, [appointments, patientMap, userMap]);

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
        case "notes":
          cmp = (a.notes ?? "").localeCompare(b.notes ?? "");
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const selectedAppt = selectedId ? appointments.find((a) => a.id === selectedId) : undefined;
  const selectedPatient = selectedAppt ? patientMap.get(selectedAppt.patientId) : undefined;

  const canStartCheckIn =
    selectedAppt &&
    selectedPatient &&
    (selectedAppt.status === "scheduled" || selectedAppt.status === "confirmed");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "time" ? "asc" : "asc");
    }
  };

  const headerBtn = (key: SortKey, label: string, className = "") => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`text-left font-semibold text-xs uppercase tracking-wide text-foreground hover:bg-muted/80 px-2 py-2 border-r border-border last:border-r-0 w-full whitespace-nowrap ${className}`}
    >
      {label}
      {sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </button>
  );

  const goToCheckIn = () => {
    if (!selectedAppt || !selectedPatient) return;
    navigate(`/appointments/check-in/${selectedAppt.id}`);
  };

  const isToday =
    viewingDate.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto" data-testid="reception-appointments-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Today’s schedule — <strong>Double-click</strong> a row to open the patient chart. Select a row, then click{" "}
            <strong>Check in</strong> to review patient appointment and complete <strong>Check in</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => setViewingDate((d) => subDays(d, 1))} aria-label="Previous day">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="min-w-[200px]">
                {format(viewingDate, "EEE, MMM d, yyyy")}
                {isToday && <span className="text-muted-foreground ml-1">(today)</span>}
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
          <Button type="button" variant="outline" size="icon" onClick={() => setViewingDate((d) => addDays(d, 1))} aria-label="Next day">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            onClick={goToCheckIn}
            disabled={!canStartCheckIn}
            className="gap-2"
            data-testid="reception-check-in-open"
          >
            <UserCheck className="w-4 h-4" />
            Check in
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-2 shadow-sm">
        <CardHeader className="py-3 border-b bg-muted/40">
          <p className="text-sm text-muted-foreground">
            {sortedRows.length} appointment{sortedRows.length !== 1 ? "s" : ""} · Selected:{" "}
            {selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : "—"}
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <p className="p-8 text-center text-muted-foreground">Loading…</p>
          ) : (
            <div className="min-w-[900px]">
              <div
                className="grid grid-cols-[5.5rem_1fr_6.5rem_1fr_4rem_6.5rem_1fr_1fr] bg-muted/60 border-b border-border"
                role="row"
              >
                {headerBtn("time", "Time")}
                {headerBtn("patient", "Patient")}
                {headerBtn("mrn", "MRN")}
                {headerBtn("clinician", "Clinician")}
                {headerBtn("duration", "Dur.", "text-center")}
                {headerBtn("status", "Status")}
                {headerBtn("reason", "Reason")}
                {headerBtn("notes", "APT note")}
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
                      className={`grid grid-cols-[5.5rem_1fr_6.5rem_1fr_4rem_6.5rem_1fr_1fr] w-full text-left text-xs font-mono border-b border-border last:border-b-0 hover:bg-muted/30 ${
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
                      <span className="px-2 py-2 border-r border-border/80 truncate" title={apt.reason ?? ""}>
                        {apt.reason || "—"}
                      </span>
                      <span className="px-2 py-2 truncate" title={apt.notes ?? ""}>
                        {apt.notes || "—"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
