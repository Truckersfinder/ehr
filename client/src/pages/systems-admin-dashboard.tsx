import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { USER_ROLE_LABELS } from "@/lib/user-role-labels";
import type { SystemsDashboardSnapshot } from "@shared/systems-admin-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MutedIconBox } from "@/components/muted-icon-box";
import {
  Users,
  Building2,
  FileStack,
  ShieldAlert,
  LogIn,
  Activity,
  SlidersHorizontal,
  ClipboardList,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { User } from "@shared/schema";

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    UPDATE_ROLE_CAPABILITY: "Role capability changed",
    CREATE_USER: "User account created",
    RESET_USER_PASSWORD: "Password reset",
    UPDATE_ORGANIZATION_SETTINGS: "Organization settings updated",
    UPDATE_ORGANIZATION_LOGO: "Organization logo updated",
    UPDATE_UI_TABLE_COLUMN: "Admin table columns updated",
    CREATE_CLINICAL_FORM: "Form / consent template created",
    UPDATE_CLINICAL_FORM: "Form / consent template updated",
  };
  return map[action] ?? action;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: number | string;
  description?: string;
  icon: typeof Users;
  variant?: "default" | "warn";
}) {
  return (
    <Card className={variant === "warn" ? "border-amber-500/40" : undefined}>
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
            <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          </div>
          <MutedIconBox icon={Icon} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemsAdminDashboardPage() {
  const { user, token } = useAuth();

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["/api/admin/systems-dashboard"],
    queryFn: () => apiGetJson<SystemsDashboardSnapshot>("/api/admin/systems-dashboard", token!),
    enabled: !!token && user?.role === "security",
  });

  const todayLine = useMemo(() => format(new Date(), "EEEE, MMMM d, yyyy"), []);

  if (user && user.role !== "security") {
    return <Redirect to="/" />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="systems-admin-dashboard">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 flex-1 min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <SectionTitleWithHint
                hint={`${todayLine} — Security posture, accounts, and administration at a glance.`}
              >
                Systems dashboard
              </SectionTitleWithHint>
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start"
            disabled={isLoading || isFetching}
            onClick={() => void refetch()}
            data-testid="systems-dashboard-refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 sm:pt-0">
          <Link href="/admin?section=organization">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              Organization <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
          <Link href="/admin?section=users">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              User management <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
          <Link href="/admin?section=roles">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              Role capabilities <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
          <Link href="/admin?section=administrative&adminTab=audit">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              Audit log <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
        </div>
      </div>

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {(error as Error)?.message ?? "Could not load dashboard."}
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Staff accounts (active)" value={data.users.active} description={`${data.users.total} total`} icon={Users} />
            <StatCard
              title="Deactivated accounts"
              value={data.users.deactivated}
              description="Cannot sign in"
              icon={Users}
              variant={data.users.deactivated > 0 ? "warn" : "default"}
            />
            <StatCard
              title="Stale logins (30 days)"
              value={data.staleActiveAccounts.count}
              description="Active users with no login in 30 days"
              icon={AlertTriangle}
              variant={data.staleActiveAccounts.count > 0 ? "warn" : "default"}
            />
            <StatCard title="Successful logins (7 days)" value={data.audit.loginsLast7Days} description="Audit trail" icon={LogIn} />
            <StatCard
              title="Admin / security events (24h)"
              value={data.audit.securityEventsLast24h}
              description="Role, org, users, forms"
              icon={ShieldAlert}
            />
            <StatCard title="Facilities" value={data.facilities.active} description={`${data.facilities.inactive} inactive`} icon={Building2} />
            <StatCard title="Form & consent templates" value={data.clinicalForms.active} description={`${data.clinicalForms.inactive} inactive`} icon={FileStack} />
            <StatCard
              title="Role capability overrides"
              value={data.roleCapabilityOverrideRows}
              description="Custom toggles vs defaults"
              icon={SlidersHorizontal}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <SectionTitleWithHint hint="Use this checklist to keep access appropriate and auditable. Numbers update from live data.">
                    Security awareness
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    Review <strong>role-based capabilities</strong> when onboarding new roles or locations —{" "}
                    <Link href="/admin?section=roles" className="text-primary underline-offset-4 hover:underline">
                      open Role management
                    </Link>
                    .
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    Deactivate accounts that no longer need access; inactive staff should not remain <strong>active</strong> in User management.
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    Investigate <strong>stale logins</strong> (below): users who have not authenticated in 30 days may need password resets or offboarding.
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    Organization branding and identifiers affect every facility — confirm under{" "}
                    <Link href="/admin?section=organization" className="text-primary underline-offset-4 hover:underline">
                      Organization configuration
                    </Link>
                    .
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    Use the <strong>audit log</strong> for a full history; the table on this page shows high-impact events only.
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 shrink-0" />
                  <SectionTitleWithHint hint="Jump to common administration tasks.">Quick actions</SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Link href="/admin?section=administrative&adminTab=forms">
                  <a className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-start gap-2")}>
                    <ClipboardList className="w-4 h-4" />
                    Forms &amp; consent templates
                  </a>
                </Link>
                <Link href="/admin?section=administrative&adminTab=facilities">
                  <a className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-start gap-2")}>
                    <Building2 className="w-4 h-4" />
                    Facilities
                  </a>
                </Link>
                <Link href="/admin?section=users">
                  <a className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-start gap-2")}>
                    <Users className="w-4 h-4" />
                    Create or review user accounts
                  </a>
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    <SectionTitleWithHint hint="Active users who have not signed in during the last 30 days, or who never signed in and were created more than 30 days ago.">
                      Accounts with no recent login
                    </SectionTitleWithHint>
                  </CardTitle>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/admin?section=users">Manage users</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.staleActiveAccounts.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No stale accounts — all active users have logged in within 30 days (or are new).</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Last login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.staleActiveAccounts.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.fullName}</TableCell>
                        <TableCell className="font-mono text-xs">{row.username}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-normal">
                            {USER_ROLE_LABELS[row.role as User["role"]] ?? row.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.lastLoginAt
                            ? format(new Date(row.lastLoginAt), "MMM d, yyyy HH:mm")
                            : row.createdAt
                              ? `Never — created ${format(new Date(row.createdAt), "MMM d, yyyy")}`
                              : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <SectionTitleWithHint hint="Role changes, account creation, password resets, organization settings, forms, and column layout updates.">
                  Recent high-impact audit events
                </SectionTitleWithHint>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.audit.recentSecurityEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No matching events recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audit.recentSecurityEvents.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {format(new Date(ev.createdAt), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{actionLabel(ev.action)}</TableCell>
                        <TableCell className="text-sm">{ev.actorFullName ?? ev.userId.slice(0, 8) + "…"}</TableCell>
                        <TableCell className="text-sm max-w-md truncate" title={ev.details ?? undefined}>
                          {ev.details ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
