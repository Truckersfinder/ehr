import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { SystemsApiDocsPanel } from "@/components/systems-api-docs-panel";

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
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const location = window.location?.search ?? "";
  const tab = useMemo(() => {
    const qs = location.startsWith("?") ? location.slice(1) : location;
    const sp = new URLSearchParams(qs);
    return sp.get("tab") || "dashboard";
  }, [location]);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["/api/admin/systems-dashboard"],
    queryFn: () => apiGetJson<SystemsDashboardSnapshot>("/api/admin/systems-dashboard", token!),
    enabled: !!token && user?.role === "security",
  });

  const todayLine = useMemo(() => format(new Date(), "EEEE, MMMM d, yyyy"), []);

  function auditActionLabel(action: string): string {
    return t(`pages.systemsDashboard.action_${action}`, { defaultValue: action });
  }

  if (user && user.role !== "security") {
    return <Redirect to="/" />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="systems-admin-dashboard">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 flex-1 min-w-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              <SectionTitleWithHint hint={t("pages.systemsDashboard.titleHint", { date: todayLine })}>
                {t("pages.systemsDashboard.title")}
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
            {t("pages.systemsDashboard.refresh")}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2 sm:pt-0">
          <Link href="/systems-dashboard">
            <a className={cn(buttonVariants({ variant: tab === "dashboard" ? "default" : "outline", size: "sm" }), "gap-1")}>
              {t("pages.systemsDashboard.tabDashboard", { defaultValue: "Dashboard" })}
            </a>
          </Link>
          <Link href="/systems-dashboard?tab=api">
            <a className={cn(buttonVariants({ variant: tab === "api" ? "default" : "outline", size: "sm" }), "gap-1")}>
              {t("pages.systemsDashboard.tabApi", { defaultValue: "API" })}
            </a>
          </Link>
          <Link href="/admin?section=organization">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              {t("pages.systemsDashboard.linkOrganization")} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
          <Link href="/admin?section=users">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              {t("pages.systemsDashboard.linkUserManagement")} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
          <Link href="/admin?section=roles">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              {t("pages.systemsDashboard.linkRoleCapabilities")} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
          <Link href="/admin?section=administrative&adminTab=audit">
            <a className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1")}>
              {t("pages.systemsDashboard.linkAuditLog")} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Link>
        </div>
      </div>

      {isError && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 text-sm text-destructive">
            {(error as Error)?.message ?? t("pages.systemsDashboard.loadError")}
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

      {tab === "api" ? (
        <SystemsApiDocsPanel />
      ) : data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={t("pages.systemsDashboard.statStaffActive")}
              value={data.users.active}
              description={t("pages.systemsDashboard.statTotalSuffix", { count: data.users.total })}
              icon={Users}
            />
            <StatCard
              title={t("pages.systemsDashboard.statDeactivated")}
              value={data.users.deactivated}
              description={t("pages.systemsDashboard.statCannotSignIn")}
              icon={Users}
              variant={data.users.deactivated > 0 ? "warn" : "default"}
            />
            <StatCard
              title={t("pages.systemsDashboard.statStaleLogins")}
              value={data.staleActiveAccounts.count}
              description={t("pages.systemsDashboard.statStaleLoginsDesc")}
              icon={AlertTriangle}
              variant={data.staleActiveAccounts.count > 0 ? "warn" : "default"}
            />
            <StatCard
              title={t("pages.systemsDashboard.statLogins7d")}
              value={data.audit.loginsLast7Days}
              description={t("pages.systemsDashboard.statAuditTrail")}
              icon={LogIn}
            />
            <StatCard
              title={t("pages.systemsDashboard.statSecurity24h")}
              value={data.audit.securityEventsLast24h}
              description={t("pages.systemsDashboard.statSecurity24hDesc")}
              icon={ShieldAlert}
            />
            <StatCard
              title={t("pages.systemsDashboard.statFacilities")}
              value={data.facilities.active}
              description={t("pages.systemsDashboard.statInactiveSuffix", { count: data.facilities.inactive })}
              icon={Building2}
            />
            <StatCard
              title={t("pages.systemsDashboard.statFormsTemplates")}
              value={data.clinicalForms.active}
              description={t("pages.systemsDashboard.statInactiveSuffix", { count: data.clinicalForms.inactive })}
              icon={FileStack}
            />
            <StatCard
              title={t("pages.systemsDashboard.statRoleOverrides")}
              value={data.roleCapabilityOverrideRows}
              description={t("pages.systemsDashboard.statRoleOverridesDesc")}
              icon={SlidersHorizontal}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <SectionTitleWithHint hint={t("pages.systemsDashboard.securityAwarenessHint")}>
                    {t("pages.systemsDashboard.securityAwareness")}
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    {t("pages.systemsDashboard.secBullet1Before")}{" "}
                    <strong>{t("pages.systemsDashboard.secBullet1Strong")}</strong> {t("pages.systemsDashboard.secBullet1Mid")}{" "}
                    <Link href="/admin?section=roles" className="text-primary underline-offset-4 hover:underline">
                      {t("pages.systemsDashboard.secBullet1Link")}
                    </Link>
                    {t("pages.systemsDashboard.secBullet1After")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>{t("pages.systemsDashboard.secBullet2")}</span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    {t("pages.systemsDashboard.secBullet3Before")} <strong>{t("pages.systemsDashboard.secBullet3Strong")}</strong>{" "}
                    {t("pages.systemsDashboard.secBullet3After")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    {t("pages.systemsDashboard.secBullet4Before")}{" "}
                    <Link href="/admin?section=organization" className="text-primary underline-offset-4 hover:underline">
                      {t("pages.systemsDashboard.secBullet4Link")}
                    </Link>
                    {t("pages.systemsDashboard.secBullet4After")}
                  </span>
                </div>
                <div className="flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>
                    {t("pages.systemsDashboard.secBullet5Before")} <strong>{t("pages.systemsDashboard.secBullet5Strong")}</strong>{" "}
                    {t("pages.systemsDashboard.secBullet5After")}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 shrink-0" />
                  <SectionTitleWithHint hint={t("pages.systemsDashboard.quickActionsHint")}>
                    {t("pages.systemsDashboard.quickActions")}
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Link href="/admin?section=administrative&adminTab=forms">
                  <a className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-start gap-2")}>
                    <ClipboardList className="w-4 h-4" />
                    {t("pages.systemsDashboard.quickFormsConsent")}
                  </a>
                </Link>
                <Link href="/admin?section=administrative&adminTab=facilities">
                  <a className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-start gap-2")}>
                    <Building2 className="w-4 h-4" />
                    {t("pages.systemsDashboard.quickFacilities")}
                  </a>
                </Link>
                <Link href="/admin?section=users">
                  <a className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-start gap-2")}>
                    <Users className="w-4 h-4" />
                    {t("pages.systemsDashboard.quickUsers")}
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
                    <SectionTitleWithHint hint={t("pages.systemsDashboard.staleAccountsHint")}>
                      {t("pages.systemsDashboard.staleAccountsTitle")}
                    </SectionTitleWithHint>
                  </CardTitle>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/admin?section=users">{t("pages.systemsDashboard.manageUsers")}</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.staleActiveAccounts.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("pages.systemsDashboard.staleAccountsEmpty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pages.systemsDashboard.colName")}</TableHead>
                      <TableHead>{t("pages.systemsDashboard.colUsername")}</TableHead>
                      <TableHead>{t("pages.systemsDashboard.colRole")}</TableHead>
                      <TableHead>{t("pages.systemsDashboard.colLastLogin")}</TableHead>
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
                              ? t("pages.systemsDashboard.lastLoginNever", {
                                  date: format(new Date(row.createdAt), "MMM d, yyyy"),
                                })
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
                <SectionTitleWithHint hint={t("pages.systemsDashboard.recentAuditHint")}>
                  {t("pages.systemsDashboard.recentAuditTitle")}
                </SectionTitleWithHint>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.audit.recentSecurityEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("pages.systemsDashboard.recentAuditEmpty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pages.systemsDashboard.colWhen")}</TableHead>
                      <TableHead>{t("pages.systemsDashboard.colEvent")}</TableHead>
                      <TableHead>{t("pages.systemsDashboard.colActor")}</TableHead>
                      <TableHead>{t("pages.systemsDashboard.colDetails")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audit.recentSecurityEvents.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {format(new Date(ev.createdAt), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{auditActionLabel(ev.action)}</TableCell>
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
