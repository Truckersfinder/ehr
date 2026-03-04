import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Calendar, Stethoscope, FlaskConical, Receipt,
  TrendingUp, Clock, AlertTriangle, Activity,
} from "lucide-react";
import { format } from "date-fns";
import type { Appointment, Encounter } from "@shared/schema";

function StatCard({ title, value, icon: Icon, description, color }: {
  title: string; value: number | string; icon: any; description?: string; color: string;
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
          <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const token = localStorage.getItem("ehr_token");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: async () => {
      const res = await fetch("/api/appointments", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: encounters = [] } = useQuery<Encounter[]>({
    queryKey: ["/api/encounters"],
    queryFn: async () => {
      const res = await fetch("/api/encounters", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const todayAppts = appointments.filter((a) => {
    const d = new Date(a.scheduledDate);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });

  const activeEncounters = encounters.filter((e) => e.status === "in_progress");

  const statusColors: Record<string, string> = {
    scheduled: "bg-accent text-accent-foreground",
    confirmed: "bg-primary/10 text-primary",
    checked_in: "bg-chart-4/10 text-chart-4",
    in_progress: "bg-chart-3/10 text-chart-3",
    completed: "bg-chart-3/10 text-chart-3",
    cancelled: "bg-destructive/10 text-destructive",
    no_show: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-welcome">
          Welcome back, {user?.fullName?.split(" ")[0]}
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
          <StatCard title="Total Patients" value={stats?.totalPatients || 0} icon={Users} color="bg-primary/10 text-primary" />
          <StatCard title="Today's Appointments" value={stats?.todayAppointments || 0} icon={Calendar} color="bg-chart-3/10 text-chart-3" />
          <StatCard title="Active Encounters" value={stats?.activeEncounters || 0} icon={Stethoscope} color="bg-chart-4/10 text-chart-4" />
          <StatCard title="Pending Lab Orders" value={stats?.pendingLabOrders || 0} icon={FlaskConical} color="bg-chart-2/10 text-chart-2" />
          <StatCard title="Pending Invoices" value={stats?.pendingInvoices || 0} icon={Receipt} color="bg-chart-5/10 text-chart-5" />
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
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[apt.status] || ""}`}>
                    {apt.status.replace("_", " ")}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <div>
              <h3 className="font-semibold">Active Encounters</h3>
              <p className="text-xs text-muted-foreground">{activeEncounters.length} in progress</p>
            </div>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {activeEncounters.length === 0 ? (
              <div className="text-center py-8">
                <Stethoscope className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No active encounters right now</p>
              </div>
            ) : (
              activeEncounters.slice(0, 5).map((enc) => (
                <div key={enc.id} className="flex items-center gap-3 p-3 rounded-md bg-accent/30" data-testid={`encounter-item-${enc.id}`}>
                  <div className="w-2 h-2 rounded-full bg-chart-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{enc.chiefComplaint || "Clinical encounter"}</p>
                    <p className="text-xs text-muted-foreground">
                      {enc.type} - {enc.visitDate ? format(new Date(enc.visitDate), "HH:mm") : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{enc.type}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h3 className="font-semibold">Quick Actions</h3>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Register Patient", icon: Users, href: "/patients", color: "bg-primary/10 text-primary" },
              { label: "New Encounter", icon: Stethoscope, href: "/encounters", color: "bg-chart-3/10 text-chart-3" },
              { label: "Schedule Visit", icon: Calendar, href: "/appointments", color: "bg-chart-4/10 text-chart-4" },
              { label: "Lab Orders", icon: FlaskConical, href: "/laboratory", color: "bg-chart-2/10 text-chart-2" },
            ].map((action) => (
              <a
                key={action.label}
                href={action.href}
                className="flex flex-col items-center gap-2 p-4 rounded-md bg-accent/30 hover-elevate cursor-pointer transition-colors"
                data-testid={`link-quick-${action.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className={`w-10 h-10 rounded-md flex items-center justify-center ${action.color}`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-center">{action.label}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
