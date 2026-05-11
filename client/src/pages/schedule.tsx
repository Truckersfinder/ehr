import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTableSort } from "@/hooks/use-table-sort";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { ADMITTED_PATIENT_STATUS_BADGE_CLASS } from "@/lib/appointment-status";
import { differenceInYears, format, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { fr as frDateLocale } from "date-fns/locale/fr";
import { es as esDateLocale } from "date-fns/locale/es";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  MoreHorizontal,
  Pill,
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bed,
} from "lucide-react";
import type { Appointment, Patient, User as UserType } from "@shared/schema";
import { excludeAppointmentsWithActiveAdmission } from "@/lib/exclude-admitted-appointments";
import { formatInOrgTimeZone, normalizeOrgTimeZone } from "@/lib/org-timezone";
import { cn } from "@/lib/utils";
import { ScheduleAppointmentStatusBadge } from "@/components/schedule-page/schedule-appointment-status-badge";
import {
  ScheduleViewToggle,
  type ScheduleViewMode,
} from "@/components/schedule-page/schedule-view-toggle";
import { ScheduleCalendarPlaceholder } from "@/components/schedule-page/schedule-calendar-placeholder";
import { ScheduleBoardView } from "@/components/schedule-page/schedule-board-view";

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

const APPOINTMENT_FILTER_STATUSES = [
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "no_show",
  "cancelled",
] as const;

function patientInitials(p: Patient | undefined): string {
  if (!p) return "?";
  const a = p.firstName?.trim()?.[0] ?? "";
  const b = p.lastName?.trim()?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

function clinicianInitials(name: string | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase() || "?";
}

function formatGenderLabel(g: string): string {
  return g ? g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() : "";
}

function translatedTableColumnLabel(
  t: (key: string, opts?: { defaultValue?: string }) => string,
  i18nKeySuffix: string,
  fallback: string,
): string {
  return t(`pages.schedule.col.${i18nKeySuffix}`, { defaultValue: fallback });
}

/** Admitted table uses a longer header for the reason column (`reason` id). */
function admittedColumnI18nKey(columnId: string): string {
  return columnId === "reason" ? "reasonForVisit" : columnId;
}

export default function SchedulePage() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const orgTz = normalizeOrgTimeZone(user?.organization?.timeZone);
  const today = new Date();

  const dateLocale = useMemo(() => {
    const base = (i18n.language || "en").split("-")[0];
    if (base === "fr") return frDateLocale;
    if (base === "es") return esDateLocale;
    return enUS;
  }, [i18n.language]);

  const formatPatientDemographicLine = useCallback(
    (patient: Patient | undefined) => {
      if (!patient) return "";
      const years = differenceInYears(new Date(), new Date(patient.dateOfBirth));
      const g = formatGenderLabel(patient.gender ?? "");
      return t("pages.schedule.demographicsLine", { gender: g, years });
    },
    [t],
  );

  useEffect(() => {
    if (user?.role === "reception") {
      navigate("/appointments");
    }
  }, [user?.role, navigate]);

  const [viewingDate, setViewingDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>("list");
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [allowedStatuses, setAllowedStatuses] = useState(() => new Set<string>(APPOINTMENT_FILTER_STATUSES));

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

  const filteredAppointments = useMemo(() => {
    const q = appointmentSearch.trim().toLowerCase();
    return displayAppointments.filter((apt) => {
      if (!allowedStatuses.has(apt.status)) return false;
      if (!q) return true;
      const pt = patientMap.get(apt.patientId);
      const clin = userMap.get(apt.clinicianId);
      const name = pt ? `${pt.firstName} ${pt.lastName}` : "";
      return (
        name.toLowerCase().includes(q) ||
        (pt?.mrn ?? "").toLowerCase().includes(q) ||
        (apt.reason ?? "").toLowerCase().includes(q) ||
        (clin?.fullName ?? "").toLowerCase().includes(q)
      );
    });
  }, [displayAppointments, allowedStatuses, appointmentSearch, patientMap, userMap]);

  const { data: effectiveScheduleColsRes } = useQuery({
    queryKey: ["/api/ui-table-columns/effective", "schedule_appointments"],
    queryFn: () =>
      apiGetJson<{ columns: { id: string; label: string }[] }>(
        `/api/ui-table-columns/effective?tableKey=schedule_appointments`,
        token,
      ),
    enabled: !!token,
    staleTime: 60 * 60 * 1000,
  });

  const scheduleColumns = useMemo(() => {
    const cols = effectiveScheduleColsRes?.columns;
    if (cols?.length) {
      return cols.map((c) => ({
        ...c,
        label: translatedTableColumnLabel(t, c.id, c.label),
      }));
    }
    return [
      { id: "time", label: translatedTableColumnLabel(t, "time", "Time") },
      { id: "patient", label: translatedTableColumnLabel(t, "patient", "Patient name") },
      { id: "mrn", label: translatedTableColumnLabel(t, "mrn", "MRN") },
      { id: "clinician", label: translatedTableColumnLabel(t, "clinician", "Clinician") },
      { id: "duration", label: translatedTableColumnLabel(t, "duration", "Duration") },
      { id: "status", label: translatedTableColumnLabel(t, "status", "Status") },
      { id: "reason", label: translatedTableColumnLabel(t, "reason", "Reason") },
      { id: "meds_admin", label: translatedTableColumnLabel(t, "meds_admin", "Meds Admin") },
    ];
  }, [effectiveScheduleColsRes, t]);

  const scheduleSortableIds = useMemo(
    () => new Set(["time", "patient", "mrn", "clinician", "duration", "status", "reason"]),
    [],
  );

  const colIds = useMemo(() => new Set(scheduleColumns.map((c) => c.id)), [scheduleColumns]);

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
    if (cols?.length) {
      return cols.map((c) => ({
        ...c,
        label: translatedTableColumnLabel(t, admittedColumnI18nKey(c.id), c.label),
      }));
    }
    return [
      { id: "patient", label: translatedTableColumnLabel(t, "patient", "Patient name") },
      { id: "mrn", label: translatedTableColumnLabel(t, "mrn", "MRN") },
      { id: "clinician", label: translatedTableColumnLabel(t, "clinician", "Clinician") },
      { id: "status", label: translatedTableColumnLabel(t, "status", "Status") },
      { id: "reason", label: translatedTableColumnLabel(t, "reasonForVisit", "Reason for Visit") },
      { id: "bed", label: translatedTableColumnLabel(t, "bed", "Bed / Room") },
      { id: "admittedAt", label: translatedTableColumnLabel(t, "admittedAt", "Admission Date") },
      { id: "meds_admin", label: translatedTableColumnLabel(t, "meds_admin", "Meds Admin") },
    ];
  }, [effectiveAdmittedColsRes, t]);

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

  const toggleStatusFilter = (status: string) => {
    setAllowedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const selectAllStatuses = () => setAllowedStatuses(new Set(APPOINTMENT_FILTER_STATUSES));
  const clearAllStatuses = () => setAllowedStatuses(new Set<string>());

  function sortChipIcon(kind: ScheduleSortKey) {
    if (scheduleSortKey !== kind) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return scheduleSortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[#F97316]" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#F97316]" />
    );
  }

  const jumpToday = () => {
    const n = new Date();
    setViewingDate(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  };

  if (user?.role === "reception") {
    return (
      <div className="p-6 text-muted-foreground text-sm" data-testid="schedule-redirect-reception">
        {t("pages.schedule.redirectingReception")}
      </div>
    );
  }

  const appointmentHref = (apt: Appointment) =>
    `/patients/${apt.patientId}?fromSchedule=1&appointmentId=${encodeURIComponent(apt.id)}`;

  return (
    <div className="min-h-full bg-[#F7F6F3] pb-12" data-testid="schedule-page">
      <div className="max-w-[1400px] xl:max-w-[1600px] mx-auto px-4 sm:px-6 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("pages.schedule.title")}</h1>
          <ScheduleViewToggle value={scheduleViewMode} onChange={setScheduleViewMode} />
        </div>

        {/* Top controls bar */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-lg border-[#F97316]/40 text-[#0E3B2E] hover:bg-orange-50"
              onClick={jumpToday}
              data-testid="schedule-btn-today"
            >
              {t("pages.schedule.today")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-lg shrink-0"
              onClick={() => setViewingDate((d) => subDays(d, 1))}
              aria-label={t("pages.schedule.ariaPrevDay")}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 min-w-[220px] rounded-lg font-medium text-sm"
                  aria-label={t("pages.schedule.ariaOpenDatePicker")}
                >
                  {format(viewingDate, "EEEE, d MMMM yyyy", { locale: dateLocale })}
                  {isToday && (
                    <span className="text-muted-foreground font-normal ml-1">{t("pages.schedule.dateTodaySuffix")}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
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
              className="h-9 w-9 rounded-lg shrink-0"
              onClick={() => setViewingDate((d) => addDays(d, 1))}
              aria-label={t("pages.schedule.ariaNextDay")}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end flex-1 min-w-[min(100%,280px)]">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={t("pages.schedule.searchPlaceholder")}
                value={appointmentSearch}
                onChange={(e) => setAppointmentSearch(e.target.value)}
                className="h-9 pl-9 rounded-lg border-border bg-white"
                aria-label={t("pages.schedule.searchAria")}
                data-testid="schedule-appt-search"
              />
            </div>
            <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg gap-1.5 shrink-0">
                  <span>{t("pages.schedule.filter")}</span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="end">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("pages.schedule.statusFilterHeading")}</p>
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {APPOINTMENT_FILTER_STATUSES.map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={allowedStatuses.has(s)}
                        onCheckedChange={() => toggleStatusFilter(s)}
                      />
                      <span>{t(`appointmentStatus.${s}`)}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-3 pt-2 border-t border-border">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={selectAllStatuses}>
                    {t("pages.schedule.filterAll")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={clearAllStatuses}>
                    {t("pages.schedule.filterClear")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              className="h-9 shrink-0 rounded-lg bg-[#0E3B2E] text-white hover:bg-[#0a3026]"
              onClick={() => navigate("/appointments")}
              data-testid="schedule-new-appointment"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t("pages.schedule.newAppointment")}
            </Button>
          </div>
        </div>

        <div className="space-y-6 min-w-0">
            <Card
              className="rounded-xl border border-border bg-white shadow-sm overflow-hidden"
              data-testid="schedule-same-day-visits"
            >
              <CardHeader className="space-y-0 border-b bg-white px-4 py-4 sm:px-5">
                <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("pages.schedule.sameDayTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("pages.schedule.sameDaySubtitle")}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0 rounded-full px-3 py-1 w-fit">
                    {t("pages.schedule.sameDayBadge", { count: filteredAppointments.length })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 space-y-3 bg-[#F7F6F3]/30">
                {isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-xl" />
                    ))}
                  </div>
                ) : scheduleViewMode === "calendar" ? (
                  <ScheduleCalendarPlaceholder />
                ) : scheduleViewMode === "board" ? (
                  <ScheduleBoardView
                    appointments={filteredAppointments}
                    patientMap={patientMap}
                    orgTz={orgTz}
                  />
                ) : (
                  <>
                    {scheduleColumns.filter((c) => scheduleSortableIds.has(c.id as ScheduleSortKey)).length ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                          {t("pages.schedule.sortBy")}
                        </span>
                        {scheduleColumns
                          .filter((c) => scheduleSortableIds.has(c.id as ScheduleSortKey))
                          .map((c) => {
                            const k = c.id as ScheduleSortKey;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
                                  scheduleSortKey === k
                                    ? "border-[#0E3B2E]/30 bg-white text-[#0E3B2E]"
                                    : "border-transparent bg-white/70 text-muted-foreground hover:bg-white",
                                )}
                                onClick={() => toggleScheduleSort(k)}
                              >
                                {c.label}
                                {sortChipIcon(k)}
                              </button>
                            );
                          })}
                      </div>
                    ) : null}

                    {displayAppointments.length > 0 && filteredAppointments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white py-16 text-center px-4">
                        <Clock className="w-10 h-10 text-muted-foreground/35 mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">{t("pages.schedule.noAppointmentsFiltered")}</p>
                        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={selectAllStatuses}>
                          {t("pages.schedule.resetFilters")}
                        </Button>
                      </div>
                    ) : filteredAppointments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white py-16 text-center px-4">
                        <Clock className="w-10 h-10 text-muted-foreground/35 mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">{t("pages.schedule.noAppointmentsDay")}</p>
                      </div>
                    ) : (
                      <ul className="space-y-3 list-none">
                        {filteredAppointments.map((apt) => {
                          const patient = patientMap.get(apt.patientId);
                          const clinician = userMap.get(apt.clinicianId);
                          const medCount = medsAdminCounts?.byAppointmentId?.[apt.id] ?? 0;
                          const href = appointmentHref(apt);

                          return (
                            <li key={apt.id} data-testid={`schedule-row-${apt.id}`}>
                              <article className="group flex gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-colors hover:bg-gray-50">
                                {/* Time */}
                                {colIds.has("time") && (
                                  <div className="w-14 shrink-0 text-center pt-0.5">
                                    <p className="text-sm font-bold tabular-nums text-foreground">
                                      {formatInOrgTimeZone(apt.scheduledDate, "HH:mm", orgTz)}
                                    </p>
                                    {colIds.has("duration") && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {t("pages.schedule.durationMinutes", { minutes: apt.duration ?? 30 })}
                                      </p>
                                    )}
                                  </div>
                                )}

                                <div className="flex flex-1 min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  {/* Patient */}
                                  {(colIds.has("patient") || colIds.has("mrn")) && (
                                    <div className="flex min-w-0 flex-1 items-start gap-3">
                                      <div
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground"
                                        aria-hidden
                                      >
                                        {patientInitials(patient)}
                                      </div>
                                      <div className="min-w-0">
                                        <Link href={href}>
                                          <a className="text-sm font-bold text-[#0E3B2E] hover:underline truncate block">
                                            {patient ? `${patient.firstName} ${patient.lastName}` : "—"}
                                          </a>
                                        </Link>
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                          {formatPatientDemographicLine(patient)}
                                          {colIds.has("mrn") && patient?.mrn ? (
                                            <span className="text-muted-foreground/80">
                                              {" "}
                                              • {t("pages.schedule.mrnInline", { mrn: patient.mrn })}
                                            </span>
                                          ) : null}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex flex-[2] flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end xl:flex-nowrap min-w-0">
                                    {(colIds.has("reason") || colIds.has("clinician") || colIds.has("provider")) && (
                                      <div className="flex min-w-[8rem] flex-1 flex-col gap-3 sm:flex-row sm:gap-8 min-w-0">
                                        {colIds.has("reason") && (
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                              {t("pages.schedule.reasonFieldLabel")}
                                            </p>
                                            <p className="text-sm truncate" title={apt.reason ?? ""}>
                                              {apt.reason ?? "—"}
                                            </p>
                                          </div>
                                        )}
                                        {(colIds.has("clinician") || colIds.has("provider")) && (
                                          <div className="flex min-w-0 items-center gap-2 flex-1 max-w-[12rem]">
                                            <div
                                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                                              aria-hidden
                                            >
                                              {clinicianInitials(clinician?.fullName)}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                                {t("pages.schedule.providerFieldLabel")}
                                              </p>
                                              <p className="text-sm font-medium truncate">
                                                {clinician?.fullName ? `${clinician.fullName}` : "—"}
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                                      {colIds.has("status") && (
                                        <ScheduleAppointmentStatusBadge status={apt.status} />
                                      )}
                                      {colIds.has("meds_admin") && (
                                        <div className="text-xs text-muted-foreground min-w-[4rem]" title={t("pages.schedule.medsAdminTooltip")}>
                                          {medCount > 0 ? (
                                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                              <Pill className="h-3.5 w-3.5 text-[#0E3B2E]" />
                                              {medCount}
                                            </span>
                                          ) : (
                                            "—"
                                          )}
                                        </div>
                                      )}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 text-muted-foreground"
                                            aria-label={t("pages.schedule.actionsAria")}
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            onSelect={(e) => {
                                              e.preventDefault();
                                              navigate(href);
                                            }}
                                          >
                                            {t("pages.schedule.openPatientChart")}
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onSelect={(e) => {
                                              e.preventDefault();
                                              navigate("/appointments");
                                            }}
                                          >
                                            {t("pages.schedule.scheduleAppointment")}
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                </div>
                              </article>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card
              className="rounded-xl border border-border bg-white shadow-sm overflow-hidden"
              data-testid="schedule-admitted-patients"
            >
              <CardHeader className="space-y-0 border-b border-border bg-white px-4 py-4 sm:px-5">
                <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-foreground">{t("pages.schedule.admittedTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("pages.schedule.admittedSubtitle")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 text-xs rounded-lg"
                      onClick={() => navigate("/admissions/recently-discharged")}
                      data-testid="button-recently-discharged"
                    >
                      {t("pages.schedule.recentlyDischarged")}
                    </Button>
                    <Badge variant="secondary" className="text-[10px] shrink-0 rounded-full px-3 py-1">
                      {t("pages.schedule.admissionsBadge", { count: admissions.length })}
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 text-xs rounded-lg bg-[#0E3B2E] text-white hover:bg-[#0a3026]"
                      onClick={() => navigate("/appointments")}
                      data-testid="schedule-admit-patient"
                    >
                      <Bed className="h-4 w-4 mr-1.5 shrink-0" />
                      {t("pages.schedule.admitPatient")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 bg-[#F7F6F3]/20">
                {admissionsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                  </div>
                ) : admissions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-white px-8 py-16 text-center shadow-sm">
                    <Bed className="w-11 h-11 mx-auto text-muted-foreground/35 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">{t("pages.schedule.noAdmittedTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{t("pages.schedule.noAdmittedHint")}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
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
                                active={admittedSortKey === (c.id as AdmittedSortKey)}
                                sortDir={admittedSortDir}
                                onSort={() => toggleAdmittedSort(c.id as AdmittedSortKey)}
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
                                          {t("appointmentStatus.admitted")}
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
                                    return (
                                      <TableCell key={c.id} className="max-w-0 truncate whitespace-nowrap">
                                        {a.bedName}
                                      </TableCell>
                                    );
                                  case "admittedAt":
                                    return (
                                      <TableCell key={c.id} className="text-muted-foreground whitespace-nowrap">
                                        {formatInOrgTimeZone(a.admittedAt, "MMMM d, yyyy", orgTz, { locale: dateLocale })}
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
      </div>
    </div>
  );
}
