import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTableSort } from "@/hooks/use-table-sort";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  ADMITTED_PATIENT_STATUS_BADGE_CLASS,
  ADMITTED_PATIENT_STATUS_LABEL,
  appointmentStatusBadgeClass,
  formatAppointmentStatusLabel,
} from "@/lib/appointment-status";
import { format, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ChevronLeft, ChevronRight, Pill } from "lucide-react";
import type { Appointment, Patient, User as UserType } from "@shared/schema";
import { APPOINTMENT_REASON_FOR_VISIT_LABEL } from "@shared/appointment-labels";
import { EmptyState } from "@/components/empty-state";
import { excludeAppointmentsWithActiveAdmission } from "@/lib/exclude-admitted-appointments";
import { formatInOrgTimeZone, normalizeOrgTimeZone } from "@/lib/org-timezone";

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

type RecentDischargedAdmissionRow = {
  id: string;
  appointmentId: string | null;
  dischargedAt: string | Date | null;
};

type ScheduleSortKey = "time" | "patient" | "mrn" | "clinician" | "duration" | "status" | "reason";
type AdmittedSortKey = "patient" | "mrn" | "clinician" | "status" | "reason" | "bed" | "admittedAt";

export default function SchedulePage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const orgTz = normalizeOrgTimeZone(user?.organization?.timeZone);
  const today = new Date();

  useEffect(() => {
    if (user?.role === "reception") {
      navigate("/appointments");
    }
  }, [user?.role, navigate]);

  const [viewingDate, setViewingDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const viewingDayStart = startOfDay(viewingDate).toISOString();
  const viewingDayEnd = endOfDay(viewingDate).toISOString();

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: queryKeys.appointments.dayRange(viewingDayStart, viewingDayEnd),
    queryFn: () =>
      apiGetJson<Appointment[]>(
        `/api/appointments?start=${encodeURIComponent(viewingDayStart)}&end=${encodeURIComponent(viewingDayEnd)}`,
        token,
      ),
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.root,
    queryFn: () => apiGetJson<Patient[]>("/api/patients", token),
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: queryKeys.users.root,
    queryFn: () => apiGetJson<Omit<UserType, "password">[]>("/api/users", token),
  });

  const { data: admissions = [], isLoading: admissionsLoading } = useQuery<ActiveAdmissionRow[]>({
    queryKey: ["/api/admissions/active"],
    queryFn: () => apiGetJson<ActiveAdmissionRow[]>("/api/admissions/active", token),
    enabled: !!token,
  });

  const { data: recentDischarged = [] } = useQuery<RecentDischargedAdmissionRow[]>({
    queryKey: ["/api/admissions/recent"],
    queryFn: () => apiGetJson<RecentDischargedAdmissionRow[]>("/api/admissions/recent", token),
    enabled: !!token,
  });

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const appointmentsForSchedule = useMemo(() => {
    const withoutActive = excludeAppointmentsWithActiveAdmission(appointments, admissions);
    // If an admission was just discharged, keep it out of "Same Day Visits" so it appears only under Recently discharged.
    const recentAdmissionApptIds = new Set(
      recentDischarged.map((a) => a.appointmentId).filter((id): id is string => !!id),
    );
    return withoutActive.filter((a) => !recentAdmissionApptIds.has(a.id));
  }, [appointments, admissions, recentDischarged]);

  const { sortKey: scheduleSortKey, sortDir: scheduleSortDir, toggleSort: toggleScheduleSort } =
    useTableSort<ScheduleSortKey>("time", "asc");

  const displayAppointments = useMemo(() => {
    const list = [...appointmentsForSchedule];
    const mult = scheduleSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const pa = patientMap.get(a.patientId);
      const pb = patientMap.get(b.patientId);
      const ca = userMap.get(a.clinicianId);
      const cb = userMap.get(b.clinicianId);
      const name = (p: Patient | undefined) => (p ? `${p.firstName} ${p.lastName}` : "—");
      let cmp = 0;
      switch (scheduleSortKey) {
        case "time":
          cmp = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
          break;
        case "patient":
          cmp = name(pa).localeCompare(name(pb));
          break;
        case "mrn":
          cmp = (pa?.mrn ?? "").localeCompare(pb?.mrn ?? "");
          break;
        case "clinician":
          cmp = (ca?.fullName ?? "").localeCompare(cb?.fullName ?? "");
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
  }, [appointmentsForSchedule, patientMap, userMap, scheduleSortKey, scheduleSortDir]);

  const { data: effectiveScheduleColsRes } = useQuery({
    queryKey: ["/api/ui-table-columns/effective", "schedule_appointments"],
    queryFn: () => apiGetJson<{ columns: { id: string; label: string }[] }>(`/api/ui-table-columns/effective?tableKey=schedule_appointments`, token),
    enabled: !!token,
    staleTime: 60 * 60 * 1000,
  });

  const scheduleColumns = useMemo(() => {
    const cols = effectiveScheduleColsRes?.columns;
    if (cols?.length) return cols;
    return [
      { id: "time", label: "Time" },
      { id: "patient", label: "Patient name" },
      { id: "mrn", label: "MRN" },
      { id: "clinician", label: "Clinician" },
      { id: "duration", label: "Duration" },
      { id: "status", label: "Status" },
      { id: "reason", label: "Reason" },
      { id: "meds_admin", label: "Meds Admin" },
    ];
  }, [effectiveScheduleColsRes]);

  const scheduleSortableIds = useMemo(
    () => new Set(["time", "patient", "mrn", "clinician", "duration", "status", "reason"]),
    [],
  );

  const appointmentIdsForMeds = useMemo(() => displayAppointments.map((a) => a.id), [displayAppointments]);
  const admissionIdsForMeds = useMemo(() => admissions.map((a) => a.id), [admissions]);

  const { data: medsAdminCounts } = useQuery<{
    byAppointmentId: Record<string, number>;
    byAdmissionId: Record<string, number>;
  }>({
    queryKey: ["meds-admin-counts", viewingDayStart, viewingDayEnd, appointmentIdsForMeds, admissionIdsForMeds],
    queryFn: () =>
      apiGetJson(
        `/api/meds-admin-counts?appointmentIds=${encodeURIComponent(appointmentIdsForMeds.join(","))}&admissionIds=${encodeURIComponent(admissionIdsForMeds.join(","))}`,
        token,
      ),
    enabled: !!token,
    staleTime: 15_000,
  });

  const { sortKey: admittedSortKey, sortDir: admittedSortDir, toggleSort: toggleAdmittedSort } =
    useTableSort<AdmittedSortKey>("admittedAt", "desc");

  const { data: effectiveAdmittedColsRes } = useQuery({
    queryKey: ["/api/ui-table-columns/effective", "schedule_admitted_patients"],
    queryFn: () =>
      apiGetJson<{ columns: { id: string; label: string }[] }>(
        `/api/ui-table-columns/effective?tableKey=schedule_admitted_patients`,
        token,
      ),
    enabled: !!token,
    staleTime: 60 * 60 * 1000,
  });

  const admittedColumns = useMemo(() => {
    const cols = effectiveAdmittedColsRes?.columns;
    if (cols?.length) return cols;
    return [
      { id: "patient", label: "Patient name" },
      { id: "mrn", label: "MRN" },
      { id: "clinician", label: "Clinician" },
      { id: "status", label: "Status" },
      { id: "reason", label: APPOINTMENT_REASON_FOR_VISIT_LABEL },
      { id: "bed", label: "Bed / Room" },
      { id: "admittedAt", label: "Admission Date" },
      { id: "meds_admin", label: "Meds Admin" },
    ];
  }, [effectiveAdmittedColsRes]);

  const admittedSortableIds = useMemo(
    () => new Set(["patient", "mrn", "clinician", "status", "reason", "bed", "admittedAt"]),
    [],
  );

  const displayAdmissions = useMemo(() => {
    const list = [...admissions];
    const mult = admittedSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const pa = patientMap.get(a.patientId);
      const pb = patientMap.get(b.patientId);
      const ca = userMap.get(a.clinicianId);
      const cb = userMap.get(b.clinicianId);
      const name = (p: Patient | undefined) => (p ? `${p.firstName} ${p.lastName}` : "—");
      let cmp = 0;
      switch (admittedSortKey) {
        case "patient":
          cmp = name(pa).localeCompare(name(pb));
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
          cmp = (a.bedName ?? "").localeCompare(b.bedName ?? "");
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
  }, [admissions, patientMap, userMap, admittedSortKey, admittedSortDir]);

  const isToday =
    viewingDate.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  if (user?.role === "reception") {
    return (
      <div className="p-6 text-muted-foreground text-sm" data-testid="schedule-redirect-reception">
        Redirecting to Appointments…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="schedule-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("pages.schedule.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setViewingDate((d) => subDays(d, 1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="font-medium min-w-[220px] text-center text-sm h-auto p-0 text-primary hover:text-primary hover:underline"
                aria-label="Open date picker"
              >
                {format(viewingDate, "EEEE, MMM d, yyyy")}
                {isToday && <span className="text-muted-foreground font-normal ml-1">(today)</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={viewingDate}
                onSelect={(date) => {
                  if (!date) return;
                  setViewingDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
                  setDatePickerOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setViewingDate((d) => addDays(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="border-2 shadow-sm" data-testid="schedule-same-day-visits">
        <CardHeader className="space-y-0 border-b bg-muted/40 px-4 py-3 sm:px-5">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold">Same Day Visits</p>
              <p className="text-xs text-muted-foreground">
                Scheduled visits for the day you are viewing (excludes overnight admissions below).
              </p>
            </div>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {displayAppointments.length} appointment{displayAppointments.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {scheduleColumns.map((c) =>
                    scheduleSortableIds.has(c.id) ? (
                      <SortableTableHead
                        key={c.id}
                        className={c.id === "time" ? "w-[6rem]" : c.id === "mrn" ? "w-[7rem]" : c.id === "duration" ? "w-[5rem]" : c.id === "status" ? "w-[6rem]" : c.id === "meds_admin" ? "w-[7rem]" : undefined}
                        active={scheduleSortKey === (c.id as any)}
                        sortDir={scheduleSortDir}
                        onSort={() => toggleScheduleSort(c.id as any)}
                      >
                        {c.label}
                      </SortableTableHead>
                    ) : (
                      <TableHead
                        key={c.id}
                        className={c.id === "meds_admin" ? "w-[7rem]" : undefined}
                      >
                        {c.label}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayAppointments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={scheduleColumns.length} className="h-24 text-center text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No appointments on this day</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayAppointments.map((apt) => {
                    const patient = patientMap.get(apt.patientId);
                    const clinician = userMap.get(apt.clinicianId);
                    return (
                      <TableRow key={apt.id} data-testid={`schedule-row-${apt.id}`}>
                        {scheduleColumns.map((c) => {
                          switch (c.id) {
                            case "time":
                              return (
                                <TableCell key={c.id} className="font-medium whitespace-nowrap">
                                  {formatInOrgTimeZone(apt.scheduledDate, "HH:mm", orgTz)}
                                </TableCell>
                              );
                            case "patient":
                              return (
                                <TableCell key={c.id}>
                                  <Link href={`/patients/${apt.patientId}?fromSchedule=1&appointmentId=${encodeURIComponent(apt.id)}`}>
                                    <a className="text-primary hover:underline font-medium">
                                      {patient ? `${patient.firstName} ${patient.lastName}` : "—"}
                                    </a>
                                  </Link>
                                </TableCell>
                              );
                            case "mrn":
                              return (
                                <TableCell key={c.id} className="text-muted-foreground font-mono text-xs">
                                  {patient?.mrn ?? "—"}
                                </TableCell>
                              );
                            case "clinician":
                            case "provider":
                              return <TableCell key={c.id}>{clinician?.fullName ?? "—"}</TableCell>;
                            case "duration":
                              return <TableCell key={c.id}>{apt.duration ?? 30} min</TableCell>;
                            case "status":
                              return (
                                <TableCell key={c.id}>
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] capitalize ${appointmentStatusBadgeClass(apt.status)}`}
                                  >
                                    {formatAppointmentStatusLabel(apt.status)}
                                  </Badge>
                                </TableCell>
                              );
                            case "reason":
                              return (
                                <TableCell key={c.id} className="max-w-[10rem] truncate" title={apt.reason ?? ""}>
                                  {apt.reason ?? "—"}
                                </TableCell>
                              );
                            case "meds_admin": {
                              const count = medsAdminCounts?.byAppointmentId?.[apt.id] ?? 0;
                              return (
                                <TableCell key={c.id}>
                                  {count > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                      <Pill className="w-4 h-4 text-primary" />
                                      {count}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              );
                            }
                            default:
                              return <TableCell key={c.id}>—</TableCell>;
                          }
                        })}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card data-testid="schedule-admitted-patients">
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
            <div className="p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full mt-2" />
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
                    {admittedColumns.map((c) =>
                      admittedSortableIds.has(c.id) ? (
                        <SortableTableHead
                          key={c.id}
                          className={
                            c.id === "patient"
                              ? "whitespace-nowrap w-[18%]"
                              : c.id === "mrn"
                                ? "whitespace-nowrap w-[9%]"
                                : c.id === "clinician"
                                  ? "whitespace-nowrap w-[18%]"
                                  : c.id === "status"
                                    ? "whitespace-nowrap w-[8%]"
                                    : c.id === "reason"
                                      ? "whitespace-nowrap w-[22%]"
                                      : c.id === "bed"
                                        ? "whitespace-nowrap w-[12%]"
                                        : c.id === "admittedAt"
                                          ? "whitespace-nowrap w-[11%]"
                                          : c.id === "meds_admin"
                                            ? "whitespace-nowrap w-[7rem]"
                                            : "whitespace-nowrap"
                          }
                          active={admittedSortKey === (c.id as any)}
                          sortDir={admittedSortDir}
                          onSort={() => toggleAdmittedSort(c.id as any)}
                        >
                          {c.label}
                        </SortableTableHead>
                      ) : (
                        <TableHead
                          key={c.id}
                          className={c.id === "meds_admin" ? "whitespace-nowrap w-[7rem]" : "whitespace-nowrap"}
                        >
                          {c.label}
                        </TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayAdmissions.map((a) => {
                    const patient = patientMap.get(a.patientId);
                    const clinician = userMap.get(a.clinicianId);
                    return (
                      <TableRow key={a.id}>
                        {admittedColumns.map((c) => {
                          switch (c.id) {
                            case "patient":
                              return (
                                <TableCell key={c.id} className="max-w-0 whitespace-nowrap truncate">
                                  <Link
                                    href={`/patients/${a.patientId}?fromAdmission=1&admissionId=${encodeURIComponent(a.id)}&tab=medication`}
                                  >
                                    <a className="text-primary hover:underline font-medium">
                                      {patient ? `${patient.firstName} ${patient.lastName}` : "—"}
                                    </a>
                                  </Link>
                                </TableCell>
                              );
                            case "mrn":
                              return (
                                <TableCell key={c.id} className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                                  {patient?.mrn ?? "—"}
                                </TableCell>
                              );
                            case "clinician":
                            case "provider":
                              return (
                                <TableCell key={c.id} className="max-w-0 truncate whitespace-nowrap">
                                  {clinician?.fullName ?? "—"}
                                </TableCell>
                              );
                            case "status":
                              return (
                                <TableCell key={c.id} className="whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-medium border ${ADMITTED_PATIENT_STATUS_BADGE_CLASS}`}
                                  >
                                    {ADMITTED_PATIENT_STATUS_LABEL}
                                  </Badge>
                                </TableCell>
                              );
                            case "reason":
                              return (
                                <TableCell key={c.id} className="max-w-0 truncate" title={a.reason ?? ""}>
                                  {a.reason ?? "—"}
                                </TableCell>
                              );
                            case "bed":
                              return <TableCell key={c.id} className="max-w-0 truncate whitespace-nowrap">{a.bedName}</TableCell>;
                            case "admittedAt":
                              return (
                                <TableCell key={c.id} className="text-muted-foreground whitespace-nowrap">
                                  {formatInOrgTimeZone(a.admittedAt, "MMMM d, yyyy", orgTz)}
                                </TableCell>
                              );
                            case "meds_admin": {
                              const count = medsAdminCounts?.byAdmissionId?.[a.id] ?? 0;
                              return (
                                <TableCell key={c.id}>
                                  {count > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                                      <Pill className="w-4 h-4 text-primary" />
                                      {count}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              );
                            }
                            default:
                              return <TableCell key={c.id}>—</TableCell>;
                          }
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
