import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTableSort } from "@/hooks/use-table-sort";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  appointmentStatusBadgeClass,
  formatAppointmentStatusLabel,
  ADMITTED_PATIENT_STATUS_BADGE_CLASS,
} from "@/lib/appointment-status";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import type { LucideIcon } from "lucide-react";
import {
  Users,
  Calendar,
  Stethoscope,
  FlaskConical,
  UserRound,
  CalendarClock,
  HeartPulse,
  TestTube,
  Wallet,
  Clock,
  Activity,
  Bed,
} from "lucide-react";
import { MutedIconBox } from "@/components/muted-icon-box";
import { format, parse, startOfDay, endOfDay, subDays } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { fr as frDateLocale } from "date-fns/locale/fr";
import { es as esDateLocale } from "date-fns/locale/es";
import type { Appointment, Encounter, Patient, User as UserType } from "@shared/schema";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";

type OverdueVisitRow = {
  encounter: Encounter;
  patientName: string;
  clinicianName: string;
  appointmentDate: string | null;
};

type OverdueSortKey = "patient" | "appointmentDate" | "clinician" | "type";

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

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  testId,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  /** Stable test id (avoid locale-dependent strings). */
  testId: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              {description ? (
                <SectionTitleWithHint hint={description}>{title}</SectionTitleWithHint>
              ) : (
                title
              )}
            </p>
            <p className="text-3xl font-bold tracking-tight" data-testid={testId}>
              {value}
            </p>
          </div>
          <MutedIconBox icon={Icon} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const orgTz = useOrgTimeZone();
  const [overdueStart, setOverdueStart] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [overdueEnd, setOverdueEnd] = useState(() => format(subDays(new Date(), 3), "yyyy-MM-dd"));

  const dateLocale = useMemo(() => {
    const base = (i18n.language || "en").split("-")[0];
    if (base === "fr") return frDateLocale;
    if (base === "es") return esDateLocale;
    return enUS;
  }, [i18n.language]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => apiGetJson<Record<string, number>>("/api/dashboard/stats", token),
  });

  const todayBounds = useMemo(() => {
    const today = new Date();
    return {
      start: startOfDay(today).toISOString(),
      end: endOfDay(today).toISOString(),
    };
  }, []);

  const { data: todayAppts = [], isLoading: todayApptsLoading } = useQuery<Appointment[]>({
    queryKey: queryKeys.appointments.dayRange(todayBounds.start, todayBounds.end),
    queryFn: () =>
      apiGetJson<Appointment[]>(
        `/api/appointments?start=${encodeURIComponent(todayBounds.start)}&end=${encodeURIComponent(todayBounds.end)}`,
        token,
      ),
    enabled: !!token,
  });

  const { data: admissions = [], isLoading: admissionsLoading } = useQuery<ActiveAdmissionRow[]>({
    queryKey: ["/api/admissions/active"],
    queryFn: () => apiGetJson<ActiveAdmissionRow[]>("/api/admissions/active", token),
    enabled: !!token,
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.root,
    queryFn: () => apiGetJson<Patient[]>("/api/patients", token),
    enabled: !!token,
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: queryKeys.users.root,
    queryFn: () => apiGetJson<Omit<UserType, "password">[]>("/api/users", token),
    enabled: !!token,
  });

  const patientMap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const overdueBounds = useMemo(() => {
    const s = parse(overdueStart, "yyyy-MM-dd", new Date());
    const e = parse(overdueEnd, "yyyy-MM-dd", new Date());
    return {
      start: startOfDay(s).toISOString(),
      end: endOfDay(e).toISOString(),
    };
  }, [overdueStart, overdueEnd]);

  const { data: overdueEncounters = [], isLoading: overdueLoading } = useQuery<OverdueVisitRow[]>({
    queryKey: queryKeys.dashboard.overdueVisits(overdueBounds.start, overdueBounds.end),
    queryFn: () =>
      apiGetJson<OverdueVisitRow[]>(
        `/api/dashboard/overdue-visits?start=${encodeURIComponent(overdueBounds.start)}&end=${encodeURIComponent(overdueBounds.end)}`,
        token,
      ),
    enabled: !!token,
  });

  const { sortKey: overdueSortKey, sortDir: overdueSortDir, toggleSort: toggleOverdueSort } =
    useTableSort<OverdueSortKey>("appointmentDate", "asc");

  const sortedOverdueEncounters = useMemo(() => {
    const list = [...overdueEncounters];
    const mult = overdueSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (overdueSortKey) {
        case "patient":
          cmp = (a.patientName || "").localeCompare(b.patientName || "");
          break;
        case "appointmentDate":
          cmp =
            new Date(a.appointmentDate ?? 0).getTime() -
            new Date(b.appointmentDate ?? 0).getTime();
          break;
        case "clinician":
          cmp = (a.clinicianName || "").localeCompare(b.clinicianName || "");
          break;
        case "type":
          cmp = (a.encounter.type ?? "").localeCompare(b.encounter.type ?? "");
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return list;
  }, [overdueEncounters, overdueSortKey, overdueSortDir]);

  const activeEncounters = sortedOverdueEncounters;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-welcome">
          <SectionTitleWithHint
            hint={t("pages.dashboard.welcomeHint", {
              date: formatInOrgTimeZone(Date.now(), "EEEE, d MMMM yyyy", orgTz, { locale: dateLocale }),
            })}
          >
            {t("pages.dashboard.title")}
          </SectionTitleWithHint>
        </h1>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            testId="stat-total-patients"
            title={t("pages.dashboard.statTotalPatients")}
            value={stats?.totalPatients || 0}
            icon={UserRound}
          />
          <StatCard
            testId="stat-today-appointments"
            title={t("pages.dashboard.statTodayAppointments")}
            value={stats?.todayAppointments || 0}
            icon={CalendarClock}
          />
          <StatCard
            testId="stat-active-encounters"
            title={t("pages.dashboard.statActiveEncounters")}
            value={stats?.activeEncounters || 0}
            icon={HeartPulse}
          />
          <StatCard
            testId="stat-pending-lab"
            title={t("pages.dashboard.statPendingLab")}
            value={stats?.pendingLabOrders || 0}
            icon={TestTube}
          />
          <StatCard
            testId="stat-pending-invoices"
            title={t("pages.dashboard.statPendingInvoices")}
            value={stats?.pendingInvoices || 0}
            icon={Wallet}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div>
                <h3 className="font-semibold">{t("pages.dashboard.todaySchedule")}</h3>
                <p className="text-xs text-muted-foreground">
                  {todayApptsLoading
                    ? t("pages.dashboard.loading")
                    : t("pages.dashboard.appointmentsCount", { count: todayAppts.length })}
                </p>
              </div>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {todayApptsLoading ? (
                <Skeleton className="h-36 w-full" />
              ) : todayAppts.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{t("pages.dashboard.noAppointmentsToday")}</p>
                </div>
              ) : (
                todayAppts.slice(0, 5).map((apt) => (
                  <div key={apt.id} className="flex items-center gap-3 p-3 rounded-md bg-accent/30" data-testid={`appointment-item-${apt.id}`}>
                    <div className="text-center min-w-[50px]">
                      <p className="text-sm font-semibold">{formatInOrgTimeZone(apt.scheduledDate, "HH:mm", orgTz)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t("pages.dashboard.durationMinutesShort", { minutes: apt.duration ?? 30 })}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {apt.reason?.trim() ? apt.reason : t("pages.dashboard.defaultVisitReason")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("pages.dashboard.patientRecordPreview", { id: apt.patientId.slice(0, 8) })}
                      </p>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] ${appointmentStatusBadgeClass(apt.status)}`}>
                      {t(`appointmentStatus.${apt.status}`, { defaultValue: formatAppointmentStatusLabel(apt.status) })}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card data-testid="dashboard-current-admissions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div>
                <h3 className="font-semibold">{t("pages.dashboard.currentAdmissionsTitle")}</h3>
                <p className="text-xs text-muted-foreground">
                  {admissionsLoading
                    ? t("pages.dashboard.loading")
                    : t("pages.dashboard.admissionsCount", { count: admissions.length })}
                </p>
              </div>
              <Bed className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              {admissionsLoading ? (
                <Skeleton className="h-36 w-full" />
              ) : admissions.length === 0 ? (
                <div className="text-center py-8">
                  <Bed className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">{t("pages.dashboard.noActiveAdmissions")}</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="min-w-[860px] w-full text-sm table-fixed">
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead active={false} sortDir={"asc"} onSort={() => {}}>
                          {t("pages.dashboard.admitTablePatient")}
                        </SortableTableHead>
                        <SortableTableHead className="w-[7rem]" active={false} sortDir={"asc"} onSort={() => {}}>
                          {t("pages.dashboard.admitTableMrn")}
                        </SortableTableHead>
                        <SortableTableHead active={false} sortDir={"asc"} onSort={() => {}}>
                          {t("pages.dashboard.admitTableClinician")}
                        </SortableTableHead>
                        <SortableTableHead className="w-[10rem]" active={false} sortDir={"asc"} onSort={() => {}}>
                          {t("pages.dashboard.admitTableBed")}
                        </SortableTableHead>
                        <SortableTableHead className="w-[10rem]" active={false} sortDir={"asc"} onSort={() => {}}>
                          {t("pages.dashboard.admitTableAdmitted")}
                        </SortableTableHead>
                        <SortableTableHead className="w-[9rem]" active={false} sortDir={"asc"} onSort={() => {}}>
                          {t("pages.dashboard.admitTableStatus")}
                        </SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admissions.map((a) => {
                        const p = patientMap.get(a.patientId);
                        const clinician = userMap.get(a.clinicianId);
                        return (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium truncate max-w-0">
                              {p ? `${p.firstName} ${p.lastName}` : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                              {p?.mrn ?? "—"}
                            </TableCell>
                            <TableCell className="truncate max-w-0 whitespace-nowrap">
                              {clinician?.fullName ?? "—"}
                            </TableCell>
                            <TableCell className="truncate max-w-0 whitespace-nowrap">{a.bedName}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {formatInOrgTimeZone(a.admittedAt, "d MMM yyyy", orgTz, { locale: dateLocale })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-medium border ${ADMITTED_PATIENT_STATUS_BADGE_CLASS}`}
                              >
                                {t("appointmentStatus.admitted")}
                              </Badge>
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
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <h3 className="font-semibold">{t("pages.dashboard.overdueVisitsTitle")}</h3>
              <p className="text-xs text-muted-foreground">
                {overdueLoading
                  ? t("pages.dashboard.loading")
                  : t("pages.dashboard.openVisitsCount", { count: activeEncounters.length })}
              </p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("pages.dashboard.dateRangeStart")}</Label>
                <Input type="date" value={overdueStart} onChange={(e) => setOverdueStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("pages.dashboard.dateRangeEnd")}</Label>
                <Input type="date" value={overdueEnd} onChange={(e) => setOverdueEnd(e.target.value)} />
              </div>
            </div>

            {overdueLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : activeEncounters.length === 0 ? (
              <div className="text-center py-8">
                <Stethoscope className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t("pages.dashboard.noOverdueInRange")}</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        active={overdueSortKey === "patient"}
                        sortDir={overdueSortDir}
                        onSort={() => toggleOverdueSort("patient")}
                      >
                        {t("pages.dashboard.overdueColPatient")}
                      </SortableTableHead>
                      <SortableTableHead
                        active={overdueSortKey === "appointmentDate"}
                        sortDir={overdueSortDir}
                        onSort={() => toggleOverdueSort("appointmentDate")}
                      >
                        {t("pages.dashboard.overdueColAppointmentDate")}
                      </SortableTableHead>
                      <SortableTableHead
                        active={overdueSortKey === "clinician"}
                        sortDir={overdueSortDir}
                        onSort={() => toggleOverdueSort("clinician")}
                      >
                        {t("pages.dashboard.overdueColClinician")}
                      </SortableTableHead>
                      <SortableTableHead
                        align="right"
                        active={overdueSortKey === "type"}
                        sortDir={overdueSortDir}
                        onSort={() => toggleOverdueSort("type")}
                      >
                        {t("pages.dashboard.overdueColType")}
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeEncounters.slice(0, 10).map((row) => (
                      <TableRow key={row.encounter.id} data-testid={`encounter-item-${row.encounter.id}`}>
                        <TableCell className="font-medium">{row.patientName || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatInOrgTimeZone(row.appointmentDate, "d MMM yyyy HH:mm", orgTz, { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="text-sm">{row.clinicianName || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="text-[10px]">
                            {row.encounter.type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions removed (per request) */}
    </div>
  );
}
