import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { appointmentStatusBadgeClass, formatAppointmentStatusLabel } from "@/lib/appointment-status";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "lucide-react";
import { MutedIconBox } from "@/components/muted-icon-box";
import { format, parse, startOfDay, endOfDay, subDays } from "date-fns";
import type { Appointment, Encounter } from "@shared/schema";

type OverdueVisitRow = {
  encounter: Encounter;
  patientName: string;
  clinicianName: string;
  appointmentDate: string | null;
};

function StatCard({ title, value, icon: Icon, description }: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold tracking-tight" data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <MutedIconBox icon={Icon} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [overdueStart, setOverdueStart] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [overdueEnd, setOverdueEnd] = useState(() => format(subDays(new Date(), 3), "yyyy-MM-dd"));

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => apiGetJson<Record<string, number>>("/api/dashboard/stats", token),
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: queryKeys.appointments.root,
    queryFn: () => apiGetJson<Appointment[]>("/api/appointments", token),
  });

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

  const todayAppts = appointments.filter((a) => {
    const d = new Date(a.scheduledDate);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const activeEncounters = overdueEncounters;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-welcome">
          Department Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {format(new Date(), "EEEE, MMMM d, yyyy")} — Here's your daily overview
        </p>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total Patients" value={stats?.totalPatients || 0} icon={UserRound} />
          <StatCard title="Today's Appointments" value={stats?.todayAppointments || 0} icon={CalendarClock} />
          <StatCard title="Active Encounters" value={stats?.activeEncounters || 0} icon={HeartPulse} />
          <StatCard title="Pending Lab Orders" value={stats?.pendingLabOrders || 0} icon={TestTube} />
          <StatCard title="Pending Invoices" value={stats?.pendingInvoices || 0} icon={Wallet} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <h3 className="font-semibold">Today's Schedule</h3>
              <p className="text-xs text-muted-foreground">{todayAppts.length} appointments</p>
            </div>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {todayAppts.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No appointments scheduled for today</p>
              </div>
            ) : (
              todayAppts.slice(0, 5).map((apt) => (
                <div key={apt.id} className="flex items-center gap-3 p-3 rounded-md bg-accent/30" data-testid={`appointment-item-${apt.id}`}>
                  <div className="text-center min-w-[50px]">
                    <p className="text-sm font-semibold">{format(new Date(apt.scheduledDate), "HH:mm")}</p>
                    <p className="text-[10px] text-muted-foreground">{apt.duration}min</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{apt.reason || "General visit"}</p>
                    <p className="text-xs text-muted-foreground">Patient ID: {apt.patientId.slice(0, 8)}...</p>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${appointmentStatusBadgeClass(apt.status)}`}>
                    {formatAppointmentStatusLabel(apt.status)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <h3 className="font-semibold">Overdue open visits</h3>
              <p className="text-xs text-muted-foreground">
                {overdueLoading ? "Loading…" : `${activeEncounters.length} open visit(s)`}
              </p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input type="date" value={overdueStart} onChange={(e) => setOverdueStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input type="date" value={overdueEnd} onChange={(e) => setOverdueEnd(e.target.value)} />
              </div>
            </div>

            {overdueLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : activeEncounters.length === 0 ? (
              <div className="text-center py-8">
                <Stethoscope className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No overdue open visits in this range</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Patient name</TableHead>
                      <TableHead>Appointment date</TableHead>
                      <TableHead>Clinician</TableHead>
                      <TableHead className="text-right">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeEncounters.slice(0, 10).map((row) => (
                      <TableRow key={row.encounter.id} data-testid={`encounter-item-${row.encounter.id}`}>
                        <TableCell className="font-medium">{row.patientName || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {row.appointmentDate ? format(new Date(row.appointmentDate), "MMM d, yyyy HH:mm") : "—"}
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
