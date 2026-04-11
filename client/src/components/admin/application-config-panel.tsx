import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiDeleteJson, apiGetJson, apiPatchJson, apiPostJson, apiPutJson } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import {
  ADMIN_TABLE_COLUMN_REGISTRY,
  defaultCapabilitiesForRole,
  tableKeysForCapabilities,
  type TableColumnLayoutRow,
} from "@shared/role-capabilities-registry";
import type { UiActivityContext, UiActivityLayoutRow } from "@shared/application-ui";
import { ADMIN_ACTIVITIES_ORDER, isActivityApplicableForRole } from "@shared/application-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { ROLE_OPTIONS, USER_ROLE_LABELS } from "@/lib/user-role-labels";
import type { User } from "@shared/schema";
import { ChevronDown, ChevronUp, Navigation, Table, Trash2 } from "lucide-react";

const CONFIGURABLE_ROLES = ROLE_OPTIONS.map((r) => r.value).filter((r) => r !== "security") as User["role"][];

type AppConfigResponse = {
  layoutRows: UiActivityLayoutRow[];
  tableKeys: string[];
  tableKeysByRole?: Record<string, string[]>;
  capabilitiesByRole?: Record<string, string[]>;
  activityCatalog: {
    toolbar: { id: string; defaultLabel: string; titleKey?: string }[];
    patient_chart_review: { id: string; defaultLabel: string }[];
    patient_chart_visit_doc: { id: string; defaultLabel: string }[];
    /** Present on fresh API responses; omitted in older cached payloads — use `ADMIN_ACTIVITIES_ORDER` fallback. */
    admin_activities?: { id: string; defaultLabel: string }[];
  };
};

function roleLabel(r: string) {
  return (USER_ROLE_LABELS as Record<string, string>)[r] ?? r;
}

/** Effective capability ids for a role (server + DB overrides, or registry defaults if API omits data). */
function effectiveCapabilityIdsForRole(
  capsByRole: Record<string, string[]> | undefined,
  role: User["role"],
): string[] {
  const list = capsByRole?.[role];
  if (list != null) return list;
  return Array.from(defaultCapabilitiesForRole(role));
}

export function ApplicationConfigPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [tableRole, setTableRole] = useState<User["role"]>("super_admin");
  const [tableKey, setTableKey] = useState<string>("admin_users");
  const [activityRole, setActivityRole] = useState<User["role"]>("super_admin");
  const [activityContext, setActivityContext] = useState<UiActivityContext>("toolbar");
  const [newCustomLabel, setNewCustomLabel] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/application-config"],
    queryFn: () => apiGetJson<AppConfigResponse>("/api/admin/application-config", token!),
    enabled: !!token,
    /** Global default is `staleTime: Infinity`; refetch here so catalog shape updates (e.g. `admin_activities`) aren’t stuck behind cache. */
    staleTime: 0,
  });

  const allowedTableKeys = useMemo(() => {
    const byRole = data?.tableKeysByRole?.[tableRole];
    if (byRole !== undefined) return byRole;
    return tableKeysForCapabilities(effectiveCapabilityIdsForRole(data?.capabilitiesByRole, tableRole));
  }, [data?.tableKeysByRole, data?.capabilitiesByRole, tableRole]);

  const tableApplicable = allowedTableKeys.length > 0 && allowedTableKeys.includes(tableKey);

  const activityCaps = useMemo(
    () => new Set<string>(effectiveCapabilityIdsForRole(data?.capabilitiesByRole, activityRole)),
    [data?.capabilitiesByRole, activityRole],
  );

  useEffect(() => {
    if (allowedTableKeys.length === 0) return;
    if (!allowedTableKeys.includes(tableKey)) {
      setTableKey(allowedTableKeys[0]!);
    }
  }, [allowedTableKeys, tableKey]);

  const { data: columnData } = useQuery({
    queryKey: ["/api/admin/ui-table-columns", tableKey, tableRole],
    queryFn: () =>
      apiGetJson<{
        tableKey: string;
        role: string;
        registry: { label: string; columns: { id: string; defaultLabel: string }[] };
        overrides: {
          role: string;
          tableKey: string;
          columnId: string;
          hidden: boolean;
          label: string | null;
          sortOrder: number | null;
        }[];
        layout: TableColumnLayoutRow[];
      }>(
        `/api/admin/ui-table-columns?tableKey=${encodeURIComponent(tableKey)}&role=${encodeURIComponent(tableRole)}`,
        token!,
      ),
    enabled: !!token && !!tableKey && allowedTableKeys.includes(tableKey),
  });

  /** When the current table is not in this role’s list, the query is disabled but the cache may still hold the last fetch — do not show that stale layout. */
  const layout = tableApplicable ? (columnData?.layout ?? []) : [];

  const colOverrides = useMemo(() => {
    const m = new Map<string, { hidden: boolean; label: string | null }>();
    for (const o of columnData?.overrides ?? []) {
      if (o.role === tableRole && o.tableKey === tableKey) {
        m.set(o.columnId, { hidden: o.hidden, label: o.label });
      }
    }
    return m;
  }, [columnData?.overrides, tableRole, tableKey]);

  const patchCol = useMutation({
    mutationFn: (body: {
      role: string;
      tableKey: string;
      columnId: string;
      hidden?: boolean;
      label?: string | null;
      sortOrder?: number | null;
    }) => apiPatchJson<{ ok: boolean }, typeof body>("/api/admin/ui-table-columns", body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/ui-table-columns"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ui-table-columns/effective"] });
    },
    onError: (e: Error) => toast({ title: "Could not update column", description: e.message, variant: "destructive" }),
  });

  const putOrder = useMutation({
    mutationFn: (body: { role: string; tableKey: string; orderedColumnIds: string[] }) =>
      apiPutJson<{ ok: boolean }, typeof body>("/api/admin/ui-table-columns/order", body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/ui-table-columns"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ui-table-columns/effective"] });
    },
    onError: (e: Error) => toast({ title: "Could not reorder", description: e.message, variant: "destructive" }),
  });

  const createCustom = useMutation({
    mutationFn: (body: { role: string; tableKey: string; label: string }) =>
      apiPostJson<{ ok: boolean; columnId: string }, typeof body>("/api/admin/ui-table-columns/custom", body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/ui-table-columns"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ui-table-columns/effective"] });
      setNewCustomLabel("");
      toast({ title: "Column added" });
    },
    onError: (e: Error) => toast({ title: "Could not add column", description: e.message, variant: "destructive" }),
  });

  const deleteCustom = useMutation({
    mutationFn: ({ role, tableKey, columnId }: { role: string; tableKey: string; columnId: string }) => {
      const q = new URLSearchParams({ role, tableKey, columnId });
      return apiDeleteJson<{ ok: boolean }>(`/api/admin/ui-table-columns?${q.toString()}`, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/ui-table-columns"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ui-table-columns/effective"] });
      toast({ title: "Custom column removed" });
    },
    onError: (e: Error) => toast({ title: "Could not remove column", description: e.message, variant: "destructive" }),
  });

  const patchActivity = useMutation({
    mutationFn: (body: {
      role: User["role"];
      context: UiActivityContext;
      activityId: string;
      labelOverride?: string | null;
      sortOrder: number;
      hidden: boolean;
      readOnly: boolean;
    }) => apiPatchJson<{ ok: boolean }, typeof body>("/api/admin/ui-activity-layout", body, token),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/application-config"] });
      const previous = queryClient.getQueryData<AppConfigResponse>(["/api/admin/application-config"]);
      queryClient.setQueryData<AppConfigResponse>(["/api/admin/application-config"], (old) => {
        if (!old) return old;
        const idx = old.layoutRows.findIndex(
          (r) =>
            r.role === variables.role &&
            r.context === variables.context &&
            r.activityId === variables.activityId,
        );
        const next: UiActivityLayoutRow = {
          role: variables.role,
          context: variables.context,
          activityId: variables.activityId,
          labelOverride: variables.labelOverride === undefined ? null : variables.labelOverride,
          sortOrder: variables.sortOrder,
          hidden: variables.hidden,
          readOnly: variables.readOnly,
        };
        const layoutRows =
          idx >= 0 ? old.layoutRows.map((r, j) => (j === idx ? { ...r, ...next } : r)) : [...old.layoutRows, next];
        return { ...old, layoutRows };
      });
      return { previous };
    },
    onError: (e: Error, _v, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/admin/application-config"], context.previous);
      }
      toast({ title: "Could not update activity", description: e.message, variant: "destructive" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/application-config"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/role-capabilities"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const catalogForContext = useMemo(() => {
    if (!data?.activityCatalog) return [];
    switch (activityContext) {
      case "toolbar":
        return data.activityCatalog.toolbar.map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));
      case "patient_chart_review":
        return data.activityCatalog.patient_chart_review.map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));
      case "patient_chart_visit_doc":
        return data.activityCatalog.patient_chart_visit_doc.map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));
      case "admin_activities": {
        const fromApi = data.activityCatalog.admin_activities;
        const rows =
          fromApi != null && fromApi.length > 0 ? fromApi : ADMIN_ACTIVITIES_ORDER;
        return rows.map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));
      }
      default:
        return [];
    }
  }, [data?.activityCatalog, activityContext]);

  const layoutForRoleContext = useMemo(() => {
    const m = new Map<string, UiActivityLayoutRow>();
    for (const r of data?.layoutRows ?? []) {
      if (r.role === activityRole && r.context === activityContext) {
        m.set(r.activityId, r);
      }
    }
    return m;
  }, [data?.layoutRows, activityRole, activityContext]);

  /** Catalog entries sorted by stored `sortOrder` (same relative order as the live app). */
  const orderedActivitiesForContext = useMemo(() => {
    const indexById = new Map(catalogForContext.map((d, i) => [d.id, i]));
    return [...catalogForContext].sort((a, b) => {
      const ia = indexById.get(a.id)!;
      const ib = indexById.get(b.id)!;
      const sa = layoutForRoleContext.get(a.id)?.sortOrder ?? ia * 10;
      const sb = layoutForRoleContext.get(b.id)?.sortOrder ?? ib * 10;
      if (sa !== sb) return sa - sb;
      return ia - ib;
    });
  }, [catalogForContext, layoutForRoleContext]);

  const moveActivity = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= orderedActivitiesForContext.length) return;
    const defA = orderedActivitiesForContext[index]!;
    const defB = orderedActivitiesForContext[j]!;
    const rowA = layoutForRoleContext.get(defA.id);
    const rowB = layoutForRoleContext.get(defB.id);
    const body = (def: (typeof catalogForContext)[number], row: UiActivityLayoutRow | undefined, sortOrder: number) => ({
      role: activityRole,
      context: activityContext,
      activityId: def.id,
      sortOrder,
      hidden: row?.hidden ?? false,
      labelOverride: row?.labelOverride?.trim() ? row.labelOverride.trim() : null,
      readOnly: row?.readOnly ?? false,
    });
    void (async () => {
      await patchActivity.mutateAsync(body(defA, rowA, j * 10));
      await patchActivity.mutateAsync(body(defB, rowB, index * 10));
    })();
  };

  const moveColumn = (index: number, dir: -1 | 1) => {
    const ids = layout.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[index], next[j]] = [next[j]!, next[index]!];
    putOrder.mutate({ role: tableRole, tableKey, orderedColumnIds: next });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          <SectionTitleWithHint
            hint="Customize which tables and columns each staff role sees. Choose a role, then pick a table that role can access (based on capabilities). Rename headers, hide columns, add custom placeholder columns, and drag order with the arrows. Custom columns appear in the table with a placeholder until the app binds data to them."
          >
            Application configuration
          </SectionTitleWithHint>
        </h2>
      </div>

      <Tabs defaultValue="tables">
        <SidebarTabsNavLayout
          sidebar={
            <TabsList className={SIDEBAR_TABS_LIST_CLASS} aria-label="Application configuration sections">
              <TabsTrigger value="tables" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="app-config-tab-tables">
                <Table className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Tables
              </TabsTrigger>
              <TabsTrigger value="activities" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="app-config-tab-activities">
                <Navigation className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Activities &amp; navigation
              </TabsTrigger>
            </TabsList>
          }
        >
        <TabsContent value="tables" className="mt-0 space-y-4 focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <SectionTitleWithHint hint="Select a role, then a table that role has access to. Reorder with arrows; add custom columns for display-only headers (placeholders in rows until wired to data).">
                  Table columns by role
                </SectionTitleWithHint>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={tableRole} onValueChange={(v) => setTableRole(v as User["role"])}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONFIGURABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabel(r)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Table</Label>
                      <Select value={tableKey} onValueChange={setTableKey}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedTableKeys.map((k) => (
                            <SelectItem key={k} value={k}>
                              {ADMIN_TABLE_COLUMN_REGISTRY[k]?.label ?? k}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {allowedTableKeys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This role has no table views assigned yet. Adjust capabilities in Role management, then return
                      here.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between rounded-md border border-dashed p-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <Label className="text-xs">Add custom column</Label>
                          <Input
                            placeholder="Header label (e.g. Notes)"
                            value={newCustomLabel}
                            onChange={(e) => setNewCustomLabel(e.target.value)}
                            className="max-w-md"
                            disabled={!tableApplicable}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!tableApplicable || !newCustomLabel.trim() || createCustom.isPending}
                          onClick={() =>
                            createCustom.mutate({
                              role: tableRole,
                              tableKey,
                              label: newCustomLabel.trim(),
                            })
                          }
                        >
                          Create column
                        </Button>
                      </div>

                      {layout.map((col, index) => {
                        const ov = colOverrides.get(col.id);
                        const hidden = col.hidden;
                        return (
                          <div
                            key={col.id}
                            className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="flex flex-col gap-3 sm:gap-0 pt-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  aria-label="Move up"
                                  disabled={!tableApplicable || index === 0 || putOrder.isPending}
                                  onClick={() => moveColumn(index, -1)}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  aria-label="Move down"
                                  disabled={!tableApplicable || index >= layout.length - 1 || putOrder.isPending}
                                  onClick={() => moveColumn(index, 1)}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="space-y-1 min-w-0">
                                <p className="text-sm font-medium">{col.label}</p>
                                <p className="text-xs text-muted-foreground font-mono break-all">
                                  {col.id}
                                  {col.isCustom ? " · custom" : ""}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <label
                                className="flex items-center gap-2 text-sm"
                                title={
                                  !tableApplicable
                                    ? "This table is not available for this role's capabilities. The checkbox is the saved Hide flag only—you can still change it."
                                    : undefined
                                }
                              >
                                <Checkbox
                                  checked={hidden}
                                  disabled={patchCol.isPending}
                                  onCheckedChange={(c) => {
                                    if (c === "indeterminate") return;
                                    patchCol.mutate({
                                      role: tableRole,
                                      tableKey,
                                      columnId: col.id,
                                      hidden: c === true,
                                      label: ov?.label ?? null,
                                    });
                                  }}
                                />
                                Hide
                              </label>
                              <div className="flex items-center gap-2">
                                <Label className="text-xs whitespace-nowrap">Header</Label>
                                <Input
                                  className="h-8 w-40"
                                  placeholder={col.defaultLabel}
                                  defaultValue={ov?.label ?? ""}
                                  disabled={!tableApplicable}
                                  key={`${tableRole}-${tableKey}-${col.id}-${hidden}`}
                                  onBlur={(e) => {
                                    if (!tableApplicable) return;
                                    const v = e.target.value.trim();
                                    patchCol.mutate({
                                      role: tableRole,
                                      tableKey,
                                      columnId: col.id,
                                      hidden,
                                      label: v || null,
                                    });
                                  }}
                                />
                              </div>
                              {col.isCustom ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  aria-label="Remove custom column"
                                  disabled={!tableApplicable || deleteCustom.isPending}
                                  onClick={() =>
                                    deleteCustom.mutate({ role: tableRole, tableKey, columnId: col.id })
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="mt-0 space-y-4 focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <SectionTitleWithHint
                  hint={
                    "Hide, rename, or reorder items. Toolbar lists primary module links (Dashboard, Billing, …) and " +
                    "the secondary row (Schedule, …) together. Hide updates the same access rules as Role management → " +
                    "Role-based capabilities, and changes there update these checkboxes. Use Read-only to lock a row. " +
                    "Reorder with the arrows. Updates apply after refresh or re-login."
                  }
                >
                  Activities &amp; navigation
                </SectionTitleWithHint>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Staff role</Label>
                  <Select value={activityRole} onValueChange={(v) => setActivityRole(v as User["role"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFIGURABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {roleLabel(r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Area</Label>
                  <Select
                    value={activityContext}
                    onValueChange={(v) => setActivityContext(v as UiActivityContext)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toolbar">Toolbar</SelectItem>
                      <SelectItem value="patient_chart_review">Patient chart — Review</SelectItem>
                      <SelectItem value="patient_chart_visit_doc">Patient chart — Visit documentation</SelectItem>
                      <SelectItem value="admin_activities">Activities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                {orderedActivitiesForContext.map((def, index) => {
                  const row = layoutForRoleContext.get(def.id);
                  const roleApplicable = isActivityApplicableForRole(
                    activityRole,
                    activityContext,
                    def.id,
                    activityCaps,
                  );
                  /** DB flag only (not “hidden in app because of capabilities”). */
                  const storedHidden = row?.hidden === true;
                  const storedReadOnly = row?.readOnly === true;
                  /** True in the live app when the item is hidden (DB flag or missing capability). */
                  const effectivelyHiddenInApp = !roleApplicable || storedHidden;
                  const catalogIdx = catalogForContext.findIndex((d) => d.id === def.id);
                  const sortOrder = row?.sortOrder ?? catalogIdx * 10;
                  const label = row?.labelOverride ?? "";
                  /** Only read-only flag locks editing — Systems admin can always change Hide unless the row is locked. */
                  const rowLocked = storedReadOnly;
                  const hideFieldId = `activity-hide-${activityRole}-${activityContext}-${def.id}`;
                  const readOnlyFieldId = `activity-readonly-${activityRole}-${activityContext}-${def.id}`;
                  const neighborLocked =
                    index > 0
                      ? (layoutForRoleContext.get(orderedActivitiesForContext[index - 1]!.id)?.readOnly ?? false)
                      : false;
                  const neighborLockedDown =
                    index < orderedActivitiesForContext.length - 1
                      ? (layoutForRoleContext.get(orderedActivitiesForContext[index + 1]!.id)?.readOnly ?? false)
                      : false;
                  const moveUpDisabled =
                    rowLocked || neighborLocked || index === 0 || patchActivity.isPending;
                  const moveDownDisabled =
                    rowLocked ||
                    neighborLockedDown ||
                    index >= orderedActivitiesForContext.length - 1 ||
                    patchActivity.isPending;
                  return (
                    <div
                      key={def.id}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end sm:justify-between"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="flex flex-col gap-0 sm:gap-0 pt-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-label="Move up"
                            disabled={moveUpDisabled}
                            onClick={() => moveActivity(index, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-label="Move down"
                            disabled={moveDownDisabled}
                            onClick={() => moveActivity(index, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-medium">{def.defaultLabel}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{def.id}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div
                          className="flex items-center gap-2 pb-2"
                          title={
                            storedReadOnly
                              ? "Clear Read-only to edit Hide, order, and Label."
                              : !roleApplicable
                                ? "This item is not in this role’s default navigation (capability or role rules). The checkbox is the saved Hide flag only—uncheck to clear it. Grant capabilities under Role management if this role should see the item."
                                : undefined
                          }
                        >
                          <Checkbox
                            id={hideFieldId}
                            className="cursor-pointer"
                            checked={storedHidden}
                            disabled={rowLocked}
                            onCheckedChange={(c) => {
                              if (rowLocked) return;
                              if (c === "indeterminate") return;
                              patchActivity.mutate({
                                role: activityRole,
                                context: activityContext,
                                activityId: def.id,
                                sortOrder,
                                hidden: c === true,
                                labelOverride: label || null,
                                readOnly: storedReadOnly,
                              });
                            }}
                          />
                          <Label htmlFor={hideFieldId} className="text-sm font-normal cursor-pointer">
                            Hide
                          </Label>
                          {!roleApplicable && effectivelyHiddenInApp && !storedHidden ? (
                            <span className="text-xs text-muted-foreground whitespace-nowrap" title="Hidden in the app until this role has the usual capability or routing for this item.">
                              (not in default UI)
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="flex items-center gap-2 pb-2"
                          title="When checked, Hide, order, Label, and Reset are locked. Saved per role in the database."
                        >
                          <Checkbox
                            id={readOnlyFieldId}
                            className="cursor-pointer"
                            checked={storedReadOnly}
                            onCheckedChange={(c) => {
                              if (c === "indeterminate") return;
                              const nextReadOnly = c === true;
                              patchActivity.mutate({
                                role: activityRole,
                                context: activityContext,
                                activityId: def.id,
                                sortOrder,
                                hidden: storedHidden,
                                labelOverride: label || null,
                                readOnly: nextReadOnly,
                              });
                            }}
                          />
                          <Label htmlFor={readOnlyFieldId} className="text-sm font-normal cursor-pointer">
                            Read-only
                          </Label>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Label</Label>
                          <Input
                            className="h-8 w-44"
                            placeholder={def.defaultLabel}
                            defaultValue={label}
                            disabled={rowLocked}
                            key={`${activityRole}-${activityContext}-${def.id}-lbl-${rowLocked}`}
                            onBlur={(e) => {
                              if (rowLocked) return;
                              const v = e.target.value.trim();
                              patchActivity.mutate({
                                role: activityRole,
                                context: activityContext,
                                activityId: def.id,
                                sortOrder,
                                hidden: storedHidden,
                                labelOverride: v || null,
                                readOnly: storedReadOnly,
                              });
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="mb-0.5"
                          disabled={rowLocked}
                          onClick={() => {
                            if (rowLocked) return;
                            patchActivity.mutate({
                              role: activityRole,
                              context: activityContext,
                              activityId: def.id,
                              sortOrder: catalogIdx * 10,
                              hidden: false,
                              labelOverride: null,
                              readOnly: false,
                            });
                          }}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </SidebarTabsNavLayout>
      </Tabs>
    </div>
  );
}
