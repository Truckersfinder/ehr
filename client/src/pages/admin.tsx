import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield, Building2, Users, FileText } from "lucide-react";
import { format } from "date-fns";
import type { User, Facility, AuditLog } from "@shared/schema";

export default function AdminPage() {
  const token = localStorage.getItem("ehr_token");

  const { data: users = [], isLoading: usersLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: ["/api/facilities"],
    queryFn: async () => {
      const res = await fetch("/api/facilities", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: auditLogs = [] } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
    queryFn: async () => {
      const res = await fetch("/api/audit-logs", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    facility_admin: "Facility Admin",
    clinician: "Clinician",
    nurse: "Nurse",
    lab_tech: "Lab Tech",
    pharmacist: "Pharmacist",
    finance: "Finance",
    reception: "Reception",
  };

  const roleColors: Record<string, string> = {
    super_admin: "bg-destructive/10 text-destructive",
    facility_admin: "bg-chart-5/10 text-chart-5",
    clinician: "bg-primary/10 text-primary",
    nurse: "bg-chart-3/10 text-chart-3",
    lab_tech: "bg-chart-2/10 text-chart-2",
    pharmacist: "bg-chart-4/10 text-chart-4",
    finance: "bg-chart-1/10 text-chart-1",
    reception: "bg-muted text-muted-foreground",
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="admin-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground text-sm mt-1">System management and audit logs</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Users</p>
                <p className="text-xl font-bold">{users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-3/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-chart-3" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Facilities</p>
                <p className="text-xl font-bold">{facilities.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-4/10 flex items-center justify-center"><FileText className="w-5 h-5 text-chart-4" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Audit Entries</p>
                <p className="text-xl font-bold">{auditLogs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="facilities" data-testid="tab-facilities">
            <Building2 className="w-3.5 h-3.5 mr-1.5" /> Facilities ({facilities.length})
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <Shield className="w-3.5 h-3.5 mr-1.5" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3 mt-4">
          {usersLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
          ) : users.map((u) => (
            <Card key={u.id} data-testid={`card-user-${u.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{u.fullName}</p>
                      <Badge variant="secondary" className={`text-[10px] ${roleColors[u.role]}`}>
                        {roleLabels[u.role] || u.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">@{u.username} {u.email ? `- ${u.email}` : ""}</p>
                  </div>
                  <Badge variant={u.isActive ? "secondary" : "destructive"} className="text-[10px]">
                    {u.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="facilities" className="space-y-3 mt-4">
          {facilities.map((f) => (
            <Card key={f.id} data-testid={`card-facility-${f.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{f.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Code: {f.code}</p>
                    {f.address && <p className="text-xs text-muted-foreground">{f.address}</p>}
                    {f.phone && <p className="text-xs text-muted-foreground">{f.phone}</p>}
                  </div>
                  <Badge variant={f.isActive ? "secondary" : "destructive"} className="text-[10px]">
                    {f.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <div className="space-y-0">
                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No audit logs yet</div>
                  ) : auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 p-3 border-b last:border-b-0" data-testid={`audit-log-${log.id}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{log.action}</Badge>
                          <span className="text-xs text-muted-foreground">{log.resource}</span>
                        </div>
                        {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d HH:mm") : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
