import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useTableSort } from "@/hooks/use-table-sort";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, Building2, Users, UserPlus, KeyRound, FileText, Pencil } from "lucide-react";
import { OrganizationConfigPanel } from "@/components/admin/organization-config-panel";
import { RoleManagementPanel } from "@/components/admin/role-management-panel";
import { ApplicationConfigPanel } from "@/components/admin/application-config-panel";
import { format } from "date-fns";
import type { User, Facility, AuditLog, Bed, ClinicalForm } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { apiPatchJson, apiPostJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { cn } from "@/lib/utils";
import { ROLE_OPTIONS } from "@/lib/user-role-labels";
import { getClinicalTemplateKind } from "@/lib/clinical-form-template-kind";
import { ADMIN_TABLE_COLUMN_REGISTRY } from "@shared/role-capabilities-registry";
import { adminSubTabsFromActivityUi, type AdminSubTabKey } from "@shared/application-ui";

const USER_TABLE_SORTABLE_IDS = new Set([
  "name",
  "username",
  "role",
  "email",
  "phone",
  "facility",
  "created",
]);

type BedListRow = Bed & { inUse?: boolean; activePatientName?: string | null };
type BedSortKey = "name" | "details" | "status" | "activePatient" | "created";
type FormSortKey = "title" | "fields" | "created";
type UserRoleNavFilter = "all" | User["role"];

function bedRowStatusDisplay(b: BedListRow, t: TFunction): { label: string; className: string } {
  if (b.inUse) return { label: t("pages.admin.bedStatusInUse"), className: "bg-primary/15 text-primary border-primary/20" };
  switch (b.status) {
    case "on_hold":
      return { label: t("pages.admin.bedStatusOnHold"), className: "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/30" };
    case "removed":
      return { label: t("pages.admin.bedStatusRemoved"), className: "bg-muted text-muted-foreground border-transparent" };
    case "open":
    default:
      return { label: t("pages.admin.bedStatusOpen"), className: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/25" };
  }
}

/** Only Systems administrator (security role) can create accounts or reset passwords; Clinic / Facility admins have read-only user management on this page. */
function canManageUserAccounts(role: string | undefined) {
  return role === "security";
}

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const manageAccounts = canManageUserAccounts(user?.role);
  const canManageForms = user?.role === "security";
  const { toast } = useToast();
  const [pickTemplateKindOpen, setPickTemplateKindOpen] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newRole, setNewRole] = useState<User["role"]>("reception");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newFacilityId, setNewFacilityId] = useState<string>("");
  const [newIsActive, setNewIsActive] = useState(true);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [passwordResetUser, setPasswordResetUser] = useState<Omit<User, "password"> | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [createBedOpen, setCreateBedOpen] = useState(false);
  const [newBedName, setNewBedName] = useState("");
  const [newBedNotes, setNewBedNotes] = useState("");
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [holdBedOpen, setHoldBedOpen] = useState(false);
  const [holdBedReason, setHoldBedReason] = useState("");
  const [removeBedOpen, setRemoveBedOpen] = useState(false);
  const [removeBedReason, setRemoveBedReason] = useState("");
  const [restoreBedOpen, setRestoreBedOpen] = useState(false);
  const [restoreBedNote, setRestoreBedNote] = useState("");
  const [userRoleNavFilter, setUserRoleNavFilter] = useState<UserRoleNavFilter>("all");

  const { data: users = [], isLoading: usersLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: queryKeys.users.root,
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

  const { data: clinicalForms = [], isLoading: clinicalFormsLoading } = useQuery<ClinicalForm[]>({
    queryKey: ["/api/admin/forms"],
    queryFn: async () => {
      const res = await fetch("/api/admin/forms", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token && canManageForms,
  });

  /** Bed/room setup: clinic admins and systems administrators. */
  const canManageBeds = user?.role === "super_admin" || user?.role === "security";

  const isSystemsAdministrator = user?.role === "security";

  /** Clinic Administrator — show Facilities / Bed management / Audit as sidebar subsections under Administrative. */
  const isClinicOrFacilityAdmin = user?.role === "super_admin";
  /** Hide the duplicate horizontal sub-tab row; sidebar lists Administrative subsections (Systems Administrator gets Forms & Consent too). */
  const useAdministrativeSidebarSubnav = isClinicOrFacilityAdmin || isSystemsAdministrator;

  const adminSection = useMemo((): "organization" | "users" | "roles" | "administrative" | "application_config" => {
    const p = new URLSearchParams(search);
    const s = p.get("section");
    if (s === "application_config") {
      if (!isSystemsAdministrator) return "administrative";
      return "application_config";
    }
    if (s === "organization" || s === "users" || s === "roles" || s === "administrative") {
      if (!isSystemsAdministrator && (s === "organization" || s === "roles")) return "administrative";
      return s;
    }
    const legacy = p.get("tab");
    if (legacy === "users") return "users";
    if (legacy === "facilities" || legacy === "beds" || legacy === "forms" || legacy === "audit") return "administrative";
    return isSystemsAdministrator ? "organization" : "administrative";
  }, [search, isSystemsAdministrator]);

  /** Systems admin: left sidebar only for Administrative. Application configuration is full-width (toolbar); no duplicate stacked nav next to the panel. */
  const showAdminSidebar =
    !isSystemsAdministrator || adminSection === "administrative";

  /** Sub-sections under Administrative (Facilities, Audit, …) — from capabilities + Application configuration. */
  const visibleAdminSubtabs = useMemo(() => {
    const caps = user?.capabilities?.length ? new Set(user.capabilities) : new Set<string>();
    return adminSubTabsFromActivityUi(user?.role ?? "reception", caps, user?.activityUi?.adminActivities);
  }, [user?.role, user?.capabilities, user?.activityUi?.adminActivities]);

  const adminSubTab = useMemo((): AdminSubTabKey => {
    const p = new URLSearchParams(search);
    let t = (p.get("adminTab") ?? p.get("tab") ?? "facilities") as AdminSubTabKey;
    const isValid = (x: string): x is AdminSubTabKey =>
      x === "facilities" || x === "beds" || x === "forms" || x === "audit";
    if (!isValid(t)) t = "facilities";
    if (t === "beds" && !canManageBeds) t = "facilities";
    if (t === "forms" && !canManageForms) t = "facilities";
    if (visibleAdminSubtabs.length > 0 && !visibleAdminSubtabs.includes(t)) {
      t = visibleAdminSubtabs[0]!;
    }
    return t;
  }, [search, canManageBeds, canManageForms, visibleAdminSubtabs]);

  const setAdminSection = (
    next: "organization" | "users" | "roles" | "administrative" | "application_config",
    sub?: AdminSubTabKey,
  ) => {
    const p = new URLSearchParams();
    p.set("section", next);
    if (next === "administrative") {
      p.set("adminTab", sub ?? adminSubTab);
    }
    setLocation(`/admin?${p.toString()}`);
  };

  useEffect(() => {
    if (adminSection !== "administrative" || visibleAdminSubtabs.length === 0) return;
    const p = new URLSearchParams(search);
    const cur = p.get("adminTab") ?? p.get("tab");
    if (cur && !visibleAdminSubtabs.includes(cur as AdminSubTabKey)) {
      const q = new URLSearchParams(search);
      q.set("section", "administrative");
      q.set("adminTab", visibleAdminSubtabs[0]!);
      setLocation(`/admin?${q.toString()}`);
    }
  }, [adminSection, search, visibleAdminSubtabs, setLocation]);

  const { data: beds = [], isLoading: bedsLoading } = useQuery<BedListRow[]>({
    queryKey: ["/api/beds"],
    queryFn: async () => {
      const res = await fetch("/api/beds", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((row) => {
        const r = row as Record<string, unknown>;
        const n = r.notes;
        const notes =
          typeof n === "string"
            ? n
            : n != null && String(n).trim() !== ""
              ? String(n)
              : null;
        return { ...(row as object), notes } as BedListRow;
      });
    },
    enabled: !!token && canManageBeds,
  });

  const selectedBed = useMemo(() => beds.find((b) => b.id === selectedBedId) ?? null, [beds, selectedBedId]);

  const { sortKey: bedSortKey, sortDir: bedSortDir, toggleSort: toggleBedSort } =
    useTableSort<BedSortKey>("name", "asc");

  const displayBeds = useMemo(() => {
    const list = [...beds];
    const mult = bedSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (bedSortKey) {
        case "name":
          cmp = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
          break;
        case "details":
          cmp = String(a.notes ?? "").trim().localeCompare(String(b.notes ?? "").trim());
          break;
        case "status":
          cmp = bedRowStatusDisplay(a, t).label.localeCompare(bedRowStatusDisplay(b, t).label);
          break;
        case "activePatient":
          cmp = (a.activePatientName ?? "").localeCompare(b.activePatientName ?? "");
          break;
        case "created":
          cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return list;
  }, [beds, bedSortKey, bedSortDir, t, i18n.language]);

  const canHoldSelected =
    !!selectedBed && selectedBed.status === "open" && !selectedBed.inUse;
  const canRemoveSelected =
    !!selectedBed && selectedBed.status !== "removed" && !selectedBed.inUse;
  const canRestoreSelected =
    !!selectedBed && selectedBed.status === "on_hold" && !selectedBed.inUse;

  const resetCreateBedForm = () => {
    setNewBedName("");
    setNewBedNotes("");
  };

  const createBedMutation = useMutation({
    mutationFn: async ({ name, notes }: { name: string; notes: string }) => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Bed / room name is required");
      return apiPostJson<BedListRow, { name: string; notes: string; facilityId?: string }>(
        "/api/beds",
        { name: trimmedName, notes, ...(user?.facilityId ? { facilityId: user.facilityId } : {}) },
        token
      );
    },
    onSuccess: () => {
      resetCreateBedForm();
      setCreateBedOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/beds"] });
      toast({ title: "Bed created" });
    },
    onError: (e: Error) => toast({ title: "Could not create bed", description: e.message, variant: "destructive" }),
  });

  const holdBedMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiPostJson<BedListRow, { reason: string }>(`/api/beds/${id}/hold`, { reason }, token),
    onSuccess: () => {
      setHoldBedOpen(false);
      setHoldBedReason("");
      void queryClient.invalidateQueries({ queryKey: ["/api/beds"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/beds/available"] });
      toast({ title: "Bed placed on hold" });
    },
    onError: (e: Error) => toast({ title: "Could not hold bed", description: e.message, variant: "destructive" }),
  });

  const removeBedMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      apiPostJson<BedListRow, { reason: string }>(`/api/beds/${id}/remove`, { reason }, token),
    onSuccess: () => {
      setRemoveBedOpen(false);
      setRemoveBedReason("");
      setSelectedBedId(null);
      void queryClient.invalidateQueries({ queryKey: ["/api/beds"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/beds/available"] });
      toast({ title: "Bed deleted" });
    },
    onError: (e: Error) => toast({ title: "Could not delete bed", description: e.message, variant: "destructive" }),
  });

  const restoreBedMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) =>
      apiPostJson<BedListRow, { reason?: string }>(`/api/beds/${id}/restore`, { ...(note?.trim() ? { reason: note.trim() } : {}) }, token),
    onSuccess: () => {
      setRestoreBedOpen(false);
      setRestoreBedNote("");
      void queryClient.invalidateQueries({ queryKey: ["/api/beds"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/beds/available"] });
      toast({ title: "Bed restored to open" });
    },
    onError: (e: Error) => toast({ title: "Could not restore bed", description: e.message, variant: "destructive" }),
  });

  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);

  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);

  const userRolesInUse = useMemo(() => {
    const present = new Set(activeUsers.map((u) => u.role));
    return ROLE_OPTIONS.filter((o) => present.has(o.value));
  }, [activeUsers]);

  const activeUserCountByRole = useMemo(() => {
    const m = new Map<User["role"], number>();
    for (const u of activeUsers) {
      m.set(u.role, (m.get(u.role) ?? 0) + 1);
    }
    return m;
  }, [activeUsers]);

  useEffect(() => {
    if (userRoleNavFilter === "all") return;
    if (!activeUsers.some((u) => u.role === userRoleNavFilter)) {
      setUserRoleNavFilter("all");
    }
  }, [activeUsers, userRoleNavFilter]);

  const usersForRoleTable = useMemo(() => {
    if (userRoleNavFilter === "all") return activeUsers;
    return activeUsers.filter((u) => u.role === userRoleNavFilter);
  }, [activeUsers, userRoleNavFilter]);

  const { data: effectiveUserColumnsRes } = useQuery({
    queryKey: ["/api/ui-table-columns/effective", "admin_users", user?.role],
    queryFn: async () => {
      const res = await fetch(`/api/ui-table-columns/effective?tableKey=admin_users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ columns: { id: string; label: string }[] }>;
    },
    enabled: !!token && !!user,
  });

  const userTableColumns = useMemo(() => {
    const eff = effectiveUserColumnsRes?.columns;
    if (eff?.length) return eff;
    return ADMIN_TABLE_COLUMN_REGISTRY.admin_users.columns.map((c) => ({ id: c.id, label: c.defaultLabel }));
  }, [effectiveUserColumnsRes]);

  const { sortKey: userSortKey, sortDir: userSortDir, toggleSort: toggleUserSort, setSortKey: setUserSortKey } =
    useTableSort<string>("name", "asc");

  const visibleUserSortKeys = useMemo(() => new Set(userTableColumns.map((c) => c.id)), [userTableColumns]);

  useEffect(() => {
    if (visibleUserSortKeys.size === 0) return;
    if (!visibleUserSortKeys.has(userSortKey)) {
      const first = userTableColumns[0]?.id;
      if (first) setUserSortKey(first);
    }
  }, [visibleUserSortKeys, userSortKey, userTableColumns, setUserSortKey]);

  const displayUsers = useMemo(() => {
    const list = [...usersForRoleTable];
    const mult = userSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const facLabel = (id: string | null | undefined) => {
        const f = id ? facilityById.get(id) : undefined;
        return f ? `${f.name} (${f.code})` : "—";
      };
      let cmp = 0;
      switch (userSortKey) {
        case "name":
          cmp = (a.fullName || a.username).localeCompare(b.fullName || b.username, undefined, {
            sensitivity: "base",
          });
          break;
        case "username":
          cmp = a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
          break;
        case "role":
          cmp = t(`roles.${a.role}`).localeCompare(t(`roles.${b.role}`));
          break;
        case "email":
          cmp = (a.email ?? "").localeCompare(b.email ?? "");
          break;
        case "phone":
          cmp = (a.phone ?? "").localeCompare(b.phone ?? "");
          break;
        case "facility":
          cmp = facLabel(a.facilityId).localeCompare(facLabel(b.facilityId));
          break;
        case "created":
          cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
          break;
        default:
          cmp = (a.fullName ?? a.username).localeCompare(b.fullName ?? b.username, undefined, {
            sensitivity: "base",
          });
      }
      return cmp * mult;
    });
    return list;
  }, [usersForRoleTable, facilityById, userSortKey, userSortDir, t, i18n.language]);

  const resetCreateUserForm = () => {
    setNewUsername("");
    setNewPassword("");
    setNewFirstName("");
    setNewLastName("");
    setNewRole("reception");
    setNewEmail("");
    setNewPhone("");
    setNewFacilityId("");
    setNewIsActive(true);
  };

  const createUserMutation = useMutation({
    mutationFn: async () => {
      return apiPostJson<Omit<User, "password">, Record<string, unknown>>(
        "/api/users",
        {
          username: newUsername.trim(),
          password: newPassword,
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          role: newRole,
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          facilityId: newFacilityId || undefined,
          isActive: newIsActive,
        },
        token
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.root });
      void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setCreateUserOpen(false);
      resetCreateUserForm();
      toast({ title: "User created", description: "They can sign in with the username and password you set." });
    },
    onError: (e: Error) => {
      toast({ title: "Could not create user", description: e.message, variant: "destructive" });
    },
  });

  const { sortKey: formSortKey, sortDir: formSortDir, toggleSort: toggleFormSort } =
    useTableSort<FormSortKey>("created", "desc");

  const displayClinicalForms = useMemo(() => {
    const list = [...clinicalForms];
    const mult = formSortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (formSortKey) {
        case "title":
          cmp = (a.title ?? "").localeCompare(b.title ?? "", undefined, { sensitivity: "base" });
          break;
        case "fields":
          cmp = (Array.isArray(a.fields) ? a.fields.length : 0) - (Array.isArray(b.fields) ? b.fields.length : 0);
          break;
        case "created":
        default:
          cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      }
      return cmp * mult;
    });
    return list;
  }, [clinicalForms, formSortKey, formSortDir]);

  const displayFormTemplates = useMemo(
    () => displayClinicalForms.filter((f) => getClinicalTemplateKind(f) === "form"),
    [displayClinicalForms],
  );
  const displayConsentTemplates = useMemo(
    () => displayClinicalForms.filter((f) => getClinicalTemplateKind(f) === "consent"),
    [displayClinicalForms],
  );

  const toggleTemplateActiveMutation = useMutation({
    mutationFn: async (args: { id: string; isActive: boolean }) => {
      return apiPatchJson<ClinicalForm, { isActive: boolean }>(
        `/api/admin/forms/${encodeURIComponent(args.id)}/status`,
        { isActive: args.isActive },
        token,
      );
    },
    onSuccess: (_updated, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/forms"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/clinical-form-templates"] });
      toast({ title: vars.isActive ? "Activated" : "Deactivated", description: "Template status updated." });
    },
    onError: (e: Error) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!passwordResetUser) throw new Error("No user selected");
      if (resetPassword !== resetPasswordConfirm) {
        throw new Error("Passwords do not match");
      }
      return apiPatchJson<{ ok: boolean }, { password: string }>(
        `/api/users/${passwordResetUser.id}/password`,
        { password: resetPassword },
        token
      );
    },
    onSuccess: () => {
      setPasswordResetUser(null);
      setResetPassword("");
      setResetPasswordConfirm("");
      void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({
        title: "Password reset",
        description: "The user can sign in with the new password.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not reset password", description: e.message, variant: "destructive" });
    },
  });

  const roleColors: Record<string, string> = {
    super_admin: "bg-destructive/10 text-destructive",
    clinician: "bg-primary/10 text-primary",
    nurse: "bg-chart-3/10 text-chart-3",
    lab_tech: "bg-chart-2/10 text-chart-2",
    reception: "bg-muted text-muted-foreground",
    security: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="admin-page">
      {!isSystemsAdministrator ? (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("pages.admin.title")}</h1>
            <p className="text-muted-foreground text-sm mt-1">{t("pages.admin.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("pages.admin.statActiveUsers")}</p>
                  <p className="text-xl font-bold">{activeUsers.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("pages.admin.statFacilities")}</p>
                  <p className="text-xl font-bold">{facilities.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("pages.admin.statAuditEntries")}</p>
                  <p className="text-xl font-bold">{auditLogs.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Tabs
        value={adminSection}
        onValueChange={(v) =>
          setAdminSection(
            v as "organization" | "users" | "roles" | "administrative" | "application_config",
            adminSubTab,
          )
        }
      >
        <SidebarTabsNavLayout
          sidebar={
            showAdminSidebar ? (
            <div className="flex w-full flex-col gap-2">
              <TabsList className={SIDEBAR_TABS_LIST_CLASS}>
                {/** Systems administrators use the header toolbar for Organization / Users / Roles / Application configuration; sidebar only lists Administrative. */}
                {!isSystemsAdministrator ? (
                  <TabsTrigger value="users" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-users">
                    <Users className="w-3.5 h-3.5 shrink-0" /> {t("pages.admin.tabUsers", { count: activeUsers.length })}
                  </TabsTrigger>
                ) : null}
                {useAdministrativeSidebarSubnav ? (
                  <div
                    className={cn(
                      "flex w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background/50",
                      adminSection === "administrative" && "ring-1 ring-border/80",
                    )}
                    role="group"
                    aria-label={t("pages.admin.ariaAdministrative")}
                  >
                    <TabsTrigger
                      value="administrative"
                      className={cn(
                        SIDEBAR_TABS_TRIGGER_CLASS,
                        "rounded-none border-0 shadow-none",
                        adminSection === "administrative" && "data-[state=active]:rounded-b-none",
                      )}
                      data-testid="tab-administrative"
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0" /> {t("pages.admin.tabAdministrative")}
                    </TabsTrigger>
                    {adminSection === "administrative" ? (
                      <div
                        className="flex flex-col gap-0.5 border-t border-border/60 bg-muted/30 px-2 py-1.5 pl-3"
                        role="group"
                        aria-label={t("pages.admin.ariaAdministrativeSubsections")}
                      >
                        <div className="border-l-2 border-primary/35 pl-2.5 flex flex-col gap-0.5">
                          {visibleAdminSubtabs.includes("facilities") ? (
                            <button
                              type="button"
                              onClick={() => setAdminSection("administrative", "facilities")}
                              className={cn(
                                "rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                adminSubTab === "facilities"
                                  ? "bg-accent font-medium text-accent-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                              )}
                              data-testid="subnav-admin-facilities"
                            >
                              Facilities ({facilities.length})
                            </button>
                          ) : null}
                          {visibleAdminSubtabs.includes("beds") && canManageBeds ? (
                            <button
                              type="button"
                              onClick={() => setAdminSection("administrative", "beds")}
                              className={cn(
                                "rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                adminSubTab === "beds"
                                  ? "bg-accent font-medium text-accent-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                              )}
                              data-testid="subnav-admin-beds"
                            >
                              {t("pages.admin.subnavBeds", { count: beds.length })}
                            </button>
                          ) : null}
                          {visibleAdminSubtabs.includes("forms") && canManageForms ? (
                            <button
                              type="button"
                              onClick={() => setAdminSection("administrative", "forms")}
                              className={cn(
                                "rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                adminSubTab === "forms"
                                  ? "bg-accent font-medium text-accent-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                              )}
                              data-testid="subnav-admin-forms"
                            >
                              {t("pages.admin.subnavForms", { count: clinicalForms.length })}
                            </button>
                          ) : null}
                          {visibleAdminSubtabs.includes("audit") ? (
                            <button
                              type="button"
                              onClick={() => setAdminSection("administrative", "audit")}
                              className={cn(
                                "rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                adminSubTab === "audit"
                                  ? "bg-accent font-medium text-accent-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                              )}
                              data-testid="subnav-admin-audit"
                            >
                              {t("pages.admin.subnavAudit")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <TabsTrigger value="administrative" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-administrative">
                    <Building2 className="w-3.5 h-3.5 shrink-0" /> {t("pages.admin.tabAdministrative")}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
            ) : null
          }
        >
        {isSystemsAdministrator ? (
          <TabsContent value="organization" className="mt-0 space-y-4 focus-visible:outline-none">
            <OrganizationConfigPanel token={token} />
          </TabsContent>
        ) : null}

        {isSystemsAdministrator ? (
          <TabsContent value="roles" className="mt-0 space-y-4 focus-visible:outline-none">
            <RoleManagementPanel token={token} />
          </TabsContent>
        ) : null}

        {isSystemsAdministrator ? (
          <TabsContent value="application_config" className="mt-0 space-y-4 focus-visible:outline-none">
            <ApplicationConfigPanel token={token} />
          </TabsContent>
        ) : null}

        <TabsContent value="users" className="mt-0 space-y-4 focus-visible:outline-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                <SectionTitleWithHint
                  hint={
                    t("pages.admin.activeUsersHint") +
                    (!manageAccounts ? " " + t("pages.admin.activeUsersHintSecurityOnly") : "")
                  }
                >
                  {t("pages.admin.activeUsersTitle")}
                </SectionTitleWithHint>
              </h2>
            </div>
            {manageAccounts ? (
              <Button type="button" onClick={() => setCreateUserOpen(true)} data-testid="button-open-create-user">
                <UserPlus className="w-4 h-4 mr-2" />
                {t("pages.admin.createUser")}
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <aside className="w-full shrink-0 lg:w-56" aria-label={t("pages.admin.filterByRoleAria")}>
              <div className="flex flex-col overflow-hidden rounded-md border border-border/60 bg-background/50">
                <div className="border-b border-border/60 bg-muted/30 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("pages.admin.userRoles")}</p>
                </div>
                <nav className="flex flex-col gap-0.5 p-2" data-testid="users-role-nav">
                  <button
                    type="button"
                    onClick={() => setUserRoleNavFilter("all")}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      userRoleNavFilter === "all"
                        ? "bg-accent font-medium text-accent-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                    data-testid="users-role-nav-all"
                  >
                    {t("pages.admin.allUsers", { count: activeUsers.length })}
                  </button>
                  {userRolesInUse.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setUserRoleNavFilter(opt.value)}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        userRoleNavFilter === opt.value
                          ? "bg-accent font-medium text-accent-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                      )}
                      data-testid={`users-role-nav-${opt.value}`}
                    >
                      {t(`roles.${opt.value}`)} ({activeUserCountByRole.get(opt.value) ?? 0})
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            <Card className="min-w-0 flex-1 border-2 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : activeUsers.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground" data-testid="users-table-empty">
                  {manageAccounts ? t("pages.admin.usersEmptyCanCreate") : t("pages.admin.usersEmptyReadOnly")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="users-table">
                    <TableHeader>
                      <TableRow>
                        {userTableColumns.map((col) =>
                          USER_TABLE_SORTABLE_IDS.has(col.id) ? (
                            <SortableTableHead
                              key={col.id}
                              className={cn(
                                col.id === "name" && "min-w-[10rem]",
                                col.id === "username" && "min-w-[8rem]",
                                col.id === "role" && "min-w-[9rem]",
                                col.id === "email" && "min-w-[12rem]",
                                col.id === "phone" && "min-w-[9rem]",
                                col.id === "facility" && "min-w-[10rem]",
                                col.id === "created" && "min-w-[9rem] whitespace-nowrap",
                              )}
                              active={userSortKey === col.id}
                              sortDir={userSortDir}
                              onSort={() => toggleUserSort(col.id)}
                            >
                              {col.label}
                            </SortableTableHead>
                          ) : (
                            <TableHead
                              key={col.id}
                              className={cn(
                                !["name", "username", "role", "email", "phone", "facility", "created"].includes(col.id) &&
                                  "min-w-[8rem]",
                              )}
                            >
                              {col.label}
                            </TableHead>
                          ),
                        )}
                        {manageAccounts ? (
                          <TableHead className="min-w-[10rem] text-right">{t("pages.admin.actions")}</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayUsers.map((u) => {
                        const fac = u.facilityId ? facilityById.get(u.facilityId) : undefined;
                        return (
                          <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                            {userTableColumns.map((col) => {
                              switch (col.id) {
                                case "name":
                                  return (
                                    <TableCell key={col.id} className="font-medium">
                                      {u.fullName}
                                    </TableCell>
                                  );
                                case "username":
                                  return (
                                    <TableCell key={col.id} className="text-muted-foreground font-mono text-xs">
                                      @{u.username}
                                    </TableCell>
                                  );
                                case "role":
                                  return (
                                    <TableCell key={col.id}>
                                      <Badge variant="secondary" className={`text-[10px] ${roleColors[u.role]}`}>
                                        {t(`roles.${u.role}`)}
                                      </Badge>
                                    </TableCell>
                                  );
                                case "email":
                                  return (
                                    <TableCell
                                      key={col.id}
                                      className="text-sm max-w-[14rem] truncate"
                                      title={u.email ?? ""}
                                    >
                                      {u.email ?? "—"}
                                    </TableCell>
                                  );
                                case "phone":
                                  return <TableCell key={col.id}>{u.phone ?? "—"}</TableCell>;
                                case "facility":
                                  return (
                                    <TableCell key={col.id} className="text-sm text-muted-foreground">
                                      {fac ? `${fac.name} (${fac.code})` : "—"}
                                    </TableCell>
                                  );
                                case "created":
                                  return (
                                    <TableCell key={col.id} className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                                      {u.createdAt ? format(new Date(u.createdAt), "yyyy-MM-dd HH:mm") : "—"}
                                    </TableCell>
                                  );
                                default:
                                  return (
                                    <TableCell key={col.id} className="text-muted-foreground">
                                      —
                                    </TableCell>
                                  );
                              }
                            })}
                            {manageAccounts ? (
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5"
                                  onClick={() => {
                                    setPasswordResetUser(u);
                                    setResetPassword("");
                                    setResetPasswordConfirm("");
                                  }}
                                  data-testid={`button-reset-password-${u.id}`}
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  Reset password
                                </Button>
                              </TableCell>
                            ) : null}
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

          <Dialog
            open={createUserOpen}
            onOpenChange={(open) => {
              setCreateUserOpen(open);
              if (!open) resetCreateUserForm();
            }}
          >
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-create-user">
              <DialogHeader>
                <DialogTitle>Create user account</DialogTitle>
                <DialogDescription>
                  Add a login for staff. Assign a role to control what they can access. Password must be at least 8 characters.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="create-user-username">Username *</Label>
                    <Input
                      id="create-user-username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      autoComplete="off"
                      data-testid="input-create-user-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-user-password">Password *</Label>
                    <Input
                      id="create-user-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      data-testid="input-create-user-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-user-firstname">First name *</Label>
                    <Input
                      id="create-user-firstname"
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      autoComplete="given-name"
                      data-testid="input-create-user-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-user-lastname">Last name *</Label>
                    <Input
                      id="create-user-lastname"
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      autoComplete="family-name"
                      data-testid="input-create-user-lastname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role *</Label>
                    <Select value={newRole} onValueChange={(v) => setNewRole(v as User["role"])}>
                      <SelectTrigger id="create-user-role" data-testid="select-create-user-role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Facility</Label>
                    <Select value={newFacilityId || "__none__"} onValueChange={(v) => setNewFacilityId(v === "__none__" ? "" : v)}>
                      <SelectTrigger data-testid="select-create-user-facility">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {facilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} ({f.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-user-email">Email</Label>
                    <Input
                      id="create-user-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      data-testid="input-create-user-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-user-phone">Phone</Label>
                    <Input
                      id="create-user-phone"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      data-testid="input-create-user-phone"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-user-active"
                    checked={newIsActive}
                    onCheckedChange={(c) => setNewIsActive(c === true)}
                    data-testid="checkbox-create-user-active"
                  />
                  <Label htmlFor="create-user-active" className="text-sm font-normal cursor-pointer">
                    Account active (can sign in)
                  </Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateUserOpen(false)}
                    data-testid="button-create-user-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      createUserMutation.isPending ||
                      !newUsername.trim() ||
                      newPassword.length < 8 ||
                      !newFirstName.trim() ||
                      !newLastName.trim()
                    }
                    onClick={() => createUserMutation.mutate()}
                    data-testid="button-create-user-submit"
                  >
                    {createUserMutation.isPending ? "Creating…" : "Create user"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={!!passwordResetUser}
            onOpenChange={(open) => {
              if (!open) {
                setPasswordResetUser(null);
                setResetPassword("");
                setResetPasswordConfirm("");
              }
            }}
          >
            <DialogContent className="max-w-md" data-testid="dialog-reset-password">
              <DialogHeader>
                <DialogTitle>Reset password</DialogTitle>
                <DialogDescription>
                  Set a new password for{" "}
                  <strong>{passwordResetUser ? `${passwordResetUser.fullName} (@${passwordResetUser.username})` : ""}</strong>.
                  They will use it the next time they sign in.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div className="space-y-2">
                  <Label htmlFor="reset-pw-new">New password *</Label>
                  <Input
                    id="reset-pw-new"
                    type="password"
                    autoComplete="new-password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    data-testid="input-reset-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-pw-confirm">Confirm password *</Label>
                  <Input
                    id="reset-pw-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={resetPasswordConfirm}
                    onChange={(e) => setResetPasswordConfirm(e.target.value)}
                    data-testid="input-reset-password-confirm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPasswordResetUser(null)}
                    data-testid="button-reset-password-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      resetPasswordMutation.isPending ||
                      resetPassword.length < 8 ||
                      resetPasswordConfirm.length < 8 ||
                      resetPassword !== resetPasswordConfirm
                    }
                    onClick={() => resetPasswordMutation.mutate()}
                    data-testid="button-reset-password-submit"
                  >
                    {resetPasswordMutation.isPending ? "Saving…" : "Update password"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="administrative" className="mt-0 space-y-4 focus-visible:outline-none">
          <Tabs
            value={adminSubTab}
            onValueChange={(v) => setAdminSection("administrative", v as AdminSubTabKey)}
          >
            {!useAdministrativeSidebarSubnav ? (
              <TabsList className="mb-4 flex flex-wrap gap-1 h-auto p-1 bg-muted/40">
                {visibleAdminSubtabs.includes("facilities") ? (
                  <TabsTrigger value="facilities" className="text-xs sm:text-sm" data-testid="subtab-facilities">
                    Facilities ({facilities.length})
                  </TabsTrigger>
                ) : null}
                {visibleAdminSubtabs.includes("beds") && canManageBeds ? (
                  <TabsTrigger value="beds" className="text-xs sm:text-sm" data-testid="subtab-beds">
                    Bed management ({beds.length})
                  </TabsTrigger>
                ) : null}
                {visibleAdminSubtabs.includes("forms") && canManageForms ? (
                  <TabsTrigger value="forms" className="text-xs sm:text-sm" data-testid="subtab-forms">
                    Forms & Consent ({clinicalForms.length})
                  </TabsTrigger>
                ) : null}
                {visibleAdminSubtabs.includes("audit") ? (
                  <TabsTrigger value="audit" className="text-xs sm:text-sm" data-testid="subtab-audit">
                    Audit log
                  </TabsTrigger>
                ) : null}
              </TabsList>
            ) : null}

        <TabsContent value="facilities" className="mt-0 space-y-3 focus-visible:outline-none">
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

          <TabsContent value="beds" className="mt-0 space-y-3 focus-visible:outline-none">
            <Card className="border-2 shadow-sm overflow-hidden" data-testid="bed-management-card">
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1 min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight">
                      <SectionTitleWithHint hint={t("pages.admin.bedManagementHint")}>
                        {t("pages.admin.bedManagementTitle")}
                      </SectionTitleWithHint>
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canHoldSelected || holdBedMutation.isPending}
                      onClick={() => {
                        setHoldBedReason("");
                        setHoldBedOpen(true);
                      }}
                      data-testid="button-bed-hold"
                    >
                      {t("pages.admin.hold")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!canRemoveSelected || removeBedMutation.isPending}
                      onClick={() => {
                        setRemoveBedReason("");
                        setRemoveBedOpen(true);
                      }}
                      data-testid="button-bed-remove"
                    >
                      {t("pages.admin.removeBed")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canRestoreSelected || restoreBedMutation.isPending}
                      onClick={() => {
                        setRestoreBedNote("");
                        setRestoreBedOpen(true);
                      }}
                      data-testid="button-bed-restore"
                    >
                      {t("pages.admin.restoreToOpen")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        resetCreateBedForm();
                        setCreateBedOpen(true);
                      }}
                      data-testid="button-open-create-bed"
                    >
                      {t("pages.admin.createBed")}
                    </Button>
                  </div>
                </div>

                <Dialog
                  open={createBedOpen}
                  onOpenChange={(open) => {
                    setCreateBedOpen(open);
                    if (!open) resetCreateBedForm();
                  }}
                >
                  <DialogContent className="sm:max-w-md" data-testid="dialog-create-bed">
                    <DialogHeader>
                      <DialogTitle>Create bed</DialogTitle>
                      <DialogDescription>
                        Enter the bed or room name and any details staff should know (location, equipment, notes).
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="create-bed-name">Bed / room name *</Label>
                        <Input
                          id="create-bed-name"
                          value={newBedName}
                          onChange={(e) => setNewBedName(e.target.value)}
                          placeholder='e.g. "Ward A — Bed 3"'
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="create-bed-notes">Details (optional)</Label>
                        <Textarea
                          id="create-bed-notes"
                          value={newBedNotes}
                          onChange={(e) => setNewBedNotes(e.target.value)}
                          placeholder="Ward, floor, bed type, equipment, or other documentation…"
                          rows={4}
                          className="resize-y min-h-[100px]"
                        />
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setCreateBedOpen(false);
                          resetCreateBedForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          createBedMutation.mutate({ name: newBedName, notes: newBedNotes })
                        }
                        disabled={!newBedName.trim() || createBedMutation.isPending}
                        data-testid="button-create-bed-submit"
                      >
                        {createBedMutation.isPending ? "Creating…" : "Create bed"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={holdBedOpen}
                  onOpenChange={(open) => {
                    setHoldBedOpen(open);
                    if (!open) setHoldBedReason("");
                  }}
                >
                  <DialogContent className="sm:max-w-md" data-testid="dialog-bed-hold">
                    <DialogHeader>
                      <DialogTitle>Place bed on hold</DialogTitle>
                      <DialogDescription>
                        This bed will not appear for overnight walk-ins until it is restored to open. Document why it is being
                        held.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-1">
                      <Label htmlFor="hold-bed-reason">Reason *</Label>
                      <Textarea
                        id="hold-bed-reason"
                        value={holdBedReason}
                        onChange={(e) => setHoldBedReason(e.target.value)}
                        placeholder="e.g. Equipment maintenance, room renovation…"
                        rows={4}
                        className="resize-y min-h-[100px]"
                      />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button type="button" variant="secondary" onClick={() => setHoldBedOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        disabled={!holdBedReason.trim() || !selectedBedId || holdBedMutation.isPending}
                        onClick={() => {
                          if (!selectedBedId) return;
                          holdBedMutation.mutate({ id: selectedBedId, reason: holdBedReason.trim() });
                        }}
                        data-testid="button-bed-hold-confirm"
                      >
                        {holdBedMutation.isPending ? "Saving…" : "Confirm hold"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={removeBedOpen}
                  onOpenChange={(open) => {
                    setRemoveBedOpen(open);
                    if (!open) setRemoveBedReason("");
                  }}
                >
                  <DialogContent className="sm:max-w-md" data-testid="dialog-bed-remove">
                    <DialogHeader>
                      <DialogTitle>Delete bed</DialogTitle>
                      <DialogDescription>
                        The bed will be deleted from active use and will not appear for walk-ins. This requires a reason for the
                        audit log.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-1">
                      <Label htmlFor="remove-bed-reason">Reason *</Label>
                      <Textarea
                        id="remove-bed-reason"
                        value={removeBedReason}
                        onChange={(e) => setRemoveBedReason(e.target.value)}
                        placeholder="e.g. Ward closed, bed decommissioned…"
                        rows={4}
                        className="resize-y min-h-[100px]"
                      />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button type="button" variant="secondary" onClick={() => setRemoveBedOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={!removeBedReason.trim() || !selectedBedId || removeBedMutation.isPending}
                        onClick={() => {
                          if (!selectedBedId) return;
                          removeBedMutation.mutate({ id: selectedBedId, reason: removeBedReason.trim() });
                        }}
                        data-testid="button-bed-remove-confirm"
                      >
                        {removeBedMutation.isPending ? "Deleting…" : "Confirm delete"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={restoreBedOpen}
                  onOpenChange={(open) => {
                    setRestoreBedOpen(open);
                    if (!open) setRestoreBedNote("");
                  }}
                >
                  <DialogContent className="sm:max-w-md" data-testid="dialog-bed-restore">
                    <DialogHeader>
                      <DialogTitle>Restore bed to open</DialogTitle>
                      <DialogDescription>
                        The bed will be available again for overnight walk-ins (if not occupied by a current admission).
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-1">
                      <Label htmlFor="restore-bed-note">Audit note (optional)</Label>
                      <Textarea
                        id="restore-bed-note"
                        value={restoreBedNote}
                        onChange={(e) => setRestoreBedNote(e.target.value)}
                        placeholder="Optional note recorded in the audit log…"
                        rows={3}
                        className="resize-y min-h-[80px]"
                      />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button type="button" variant="secondary" onClick={() => setRestoreBedOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        disabled={!selectedBedId || restoreBedMutation.isPending}
                        onClick={() => {
                          if (!selectedBedId) return;
                          restoreBedMutation.mutate({ id: selectedBedId, note: restoreBedNote.trim() || undefined });
                        }}
                        data-testid="button-bed-restore-confirm"
                      >
                        {restoreBedMutation.isPending ? t("pages.admin.restoring") : t("pages.admin.restoreToOpen")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {bedsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : beds.length === 0 ? (
                  <EmptyState title={t("pages.admin.emptyBedsTitle")} description={t("pages.admin.emptyBedsDescription")} />
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table data-testid="beds-table">
                      <TableHeader>
                        <TableRow>
                          <SortableTableHead
                            className="min-w-[11rem]"
                            active={bedSortKey === "name"}
                            sortDir={bedSortDir}
                            onSort={() => toggleBedSort("name")}
                          >
                            {t("pages.admin.bedColName")}
                          </SortableTableHead>
                          <SortableTableHead
                            className="min-w-[9rem]"
                            active={bedSortKey === "details"}
                            sortDir={bedSortDir}
                            onSort={() => toggleBedSort("details")}
                          >
                            {t("pages.admin.bedColDetails")}
                          </SortableTableHead>
                          <SortableTableHead
                            className="min-w-[8rem]"
                            active={bedSortKey === "status"}
                            sortDir={bedSortDir}
                            onSort={() => toggleBedSort("status")}
                          >
                            {t("pages.admin.bedColStatus")}
                          </SortableTableHead>
                          <SortableTableHead
                            className="min-w-[12rem]"
                            active={bedSortKey === "activePatient"}
                            sortDir={bedSortDir}
                            onSort={() => toggleBedSort("activePatient")}
                          >
                            {t("pages.admin.bedColActivePatient")}
                          </SortableTableHead>
                          <SortableTableHead
                            className="w-[10rem]"
                            active={bedSortKey === "created"}
                            sortDir={bedSortDir}
                            onSort={() => toggleBedSort("created")}
                          >
                            {t("pages.admin.bedColCreated")}
                          </SortableTableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {displayBeds.map((b) => {
                          const st = bedRowStatusDisplay(b, t);
                          const isSelected = selectedBedId === b.id;
                          return (
                            <TableRow
                              key={b.id}
                              data-state={isSelected ? "selected" : undefined}
                              className={cn(
                                "cursor-pointer transition-colors",
                                isSelected && "bg-muted/60",
                                !isSelected && "hover:bg-muted/40",
                              )}
                              onClick={() => setSelectedBedId((prev) => (prev === b.id ? null : b.id))}
                            >
                              <TableCell className="font-medium">{b.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[18rem]">
                                {b.notes != null && String(b.notes).trim() ? (
                                  <span className="line-clamp-2" title={String(b.notes).trim()}>
                                    {String(b.notes).trim()}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>
                                {b.status === "on_hold" && b.statusReason?.trim() ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex cursor-help">
                                        <Badge
                                          variant="outline"
                                          className={cn("text-[10px] font-medium border", st.className)}
                                        >
                                          {st.label}
                                        </Badge>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-sm text-left">
                                      <p className="whitespace-pre-wrap text-sm">{b.statusReason.trim()}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Badge variant="outline" className={cn("text-[10px] font-medium border", st.className)}>
                                    {st.label}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[18rem]">
                                {b.activePatientName?.trim() ? (
                                  <span className="line-clamp-2 font-medium text-foreground" title={b.activePatientName}>
                                    {b.activePatientName}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                                {b.createdAt ? format(new Date(b.createdAt), "MMM d, yyyy") : "—"}
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
          </TabsContent>

          <TabsContent value="forms" className="mt-0 space-y-4 focus-visible:outline-none">
            <Card>
              <CardContent className="p-5 space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold">
                      <SectionTitleWithHint hint={t("pages.admin.formsConsentHint")}>
                        {t("pages.admin.formsConsentTitle")}
                      </SectionTitleWithHint>
                    </h3>
                  </div>
                  <Button
                    type="button"
                    className={cn(buttonVariants())}
                    data-testid="button-create-form"
                    onClick={() => setPickTemplateKindOpen(true)}
                  >
                    <FileText className="w-4 h-4" />
                    {t("pages.admin.create")}
                  </Button>
                </div>

                <Dialog open={pickTemplateKindOpen} onOpenChange={setPickTemplateKindOpen}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>{t("pages.admin.pickKindTitle")}</DialogTitle>
                      <DialogDescription>{t("pages.admin.pickKindDescription")}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setPickTemplateKindOpen(false);
                          setLocation("/admin/forms/new?kind=form");
                        }}
                      >
                        {t("pages.admin.pickKindForm")}
                      </Button>
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setPickTemplateKindOpen(false);
                          setLocation("/admin/forms/new?kind=consent");
                        }}
                      >
                        {t("pages.admin.pickKindConsent")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {clinicalFormsLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : clinicalForms.length === 0 ? (
                  <EmptyState title={t("pages.admin.emptyFormsTitle")} description={t("pages.admin.emptyFormsDescription")} />
                ) : (
                  <div className="space-y-8">
                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">{t("pages.admin.formsListHeading")}</h4>
                      {displayFormTemplates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("pages.admin.noFormTemplatesYet")}</p>
                      ) : (
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <SortableTableHead
                                  active={formSortKey === "title"}
                                  sortDir={formSortDir}
                                  onSort={() => toggleFormSort("title")}
                                >
                                  {t("pages.admin.tableTitle")}
                                </SortableTableHead>
                                <SortableTableHead
                                  className="w-[8rem]"
                                  active={formSortKey === "fields"}
                                  sortDir={formSortDir}
                                  onSort={() => toggleFormSort("fields")}
                                >
                                  {t("pages.admin.tableFields")}
                                </SortableTableHead>
                                <SortableTableHead
                                  className="w-[11rem]"
                                  active={formSortKey === "created"}
                                  sortDir={formSortDir}
                                  onSort={() => toggleFormSort("created")}
                                >
                                  {t("pages.admin.tableCreated")}
                                </SortableTableHead>
                                <TableHead className="w-[7rem] text-right">{t("pages.admin.actions")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayFormTemplates.map((f) => (
                                <TableRow key={f.id}>
                                  <TableCell className="font-medium max-w-[min(28rem,50vw)]">
                                    <div className="truncate" title={f.title}>
                                      {f.title}
                                    </div>
                                    {f.description ? (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5" title={f.description}>
                                        {f.description}
                                      </p>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground tabular-nums">
                                    {Array.isArray(f.fields) ? f.fields.length : 0}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                    {f.createdAt ? format(new Date(f.createdAt), "MMM d, yyyy") : "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {manageAccounts ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <Link href={`/admin/forms/${f.id}/edit`}>
                                          <a
                                            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8")}
                                            onClick={(e) => e.stopPropagation()}
                                            data-testid={`link-edit-form-${f.id}`}
                                          >
                                            <Pencil className="h-3.5 w-3.5 mr-1" />
                                            Edit
                                          </a>
                                        </Link>
                                        {(f as any).isActive !== false ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTemplateActiveMutation.mutate({ id: f.id, isActive: false });
                                            }}
                                            disabled={toggleTemplateActiveMutation.isPending}
                                            data-testid={`button-deactivate-form-${f.id}`}
                                          >
                                            Deactivate
                                          </Button>
                                        ) : (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTemplateActiveMutation.mutate({ id: f.id, isActive: true });
                                            }}
                                            disabled={toggleTemplateActiveMutation.isPending}
                                            data-testid={`button-activate-form-${f.id}`}
                                          >
                                            Activate
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </section>

                    <section className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground">{t("pages.admin.consentsListHeading")}</h4>
                      {displayConsentTemplates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("pages.admin.noConsentTemplatesYet")}</p>
                      ) : (
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <SortableTableHead
                                  active={formSortKey === "title"}
                                  sortDir={formSortDir}
                                  onSort={() => toggleFormSort("title")}
                                >
                                  {t("pages.admin.tableTitle")}
                                </SortableTableHead>
                                <SortableTableHead
                                  className="w-[8rem]"
                                  active={formSortKey === "fields"}
                                  sortDir={formSortDir}
                                  onSort={() => toggleFormSort("fields")}
                                >
                                  {t("pages.admin.tableFields")}
                                </SortableTableHead>
                                <SortableTableHead
                                  className="w-[11rem]"
                                  active={formSortKey === "created"}
                                  sortDir={formSortDir}
                                  onSort={() => toggleFormSort("created")}
                                >
                                  {t("pages.admin.tableCreated")}
                                </SortableTableHead>
                                <TableHead className="w-[7rem] text-right">{t("pages.admin.actions")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayConsentTemplates.map((f) => (
                                <TableRow key={f.id}>
                                  <TableCell className="font-medium max-w-[min(28rem,50vw)]">
                                    <div className="truncate" title={f.title}>
                                      {f.title}
                                    </div>
                                    {f.description ? (
                                      <p className="text-xs text-muted-foreground truncate mt-0.5" title={f.description}>
                                        {f.description}
                                      </p>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground tabular-nums">
                                    {Array.isArray(f.fields) ? f.fields.length : 0}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                    {f.createdAt ? format(new Date(f.createdAt), "MMM d, yyyy") : "—"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {manageAccounts ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <Link href={`/admin/forms/${f.id}/edit`}>
                                          <a
                                            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8")}
                                            onClick={(e) => e.stopPropagation()}
                                            data-testid={`link-edit-consent-${f.id}`}
                                          >
                                            <Pencil className="h-3.5 w-3.5 mr-1" />
                                            Edit
                                          </a>
                                        </Link>
                                        {(f as any).isActive !== false ? (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTemplateActiveMutation.mutate({ id: f.id, isActive: false });
                                            }}
                                            disabled={toggleTemplateActiveMutation.isPending}
                                            data-testid={`button-deactivate-consent-${f.id}`}
                                          >
                                            Deactivate
                                          </Button>
                                        ) : (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleTemplateActiveMutation.mutate({ id: f.id, isActive: true });
                                            }}
                                            disabled={toggleTemplateActiveMutation.isPending}
                                            data-testid={`button-activate-consent-${f.id}`}
                                          >
                                            Activate
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        <TabsContent value="audit" className="mt-0 focus-visible:outline-none">
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
        </TabsContent>
        </SidebarTabsNavLayout>
      </Tabs>
    </div>
  );
}
