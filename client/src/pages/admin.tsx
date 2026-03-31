import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Building2, Users, UserPlus, KeyRound } from "lucide-react";
import { format } from "date-fns";
import type { User, Facility, AuditLog } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { apiPatchJson, apiPostJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const ROLE_OPTIONS: { value: User["role"]; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "facility_admin", label: "Facility Admin" },
  { value: "clinician", label: "Clinician" },
  { value: "nurse", label: "Nurse" },
  { value: "lab_tech", label: "Lab Tech" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "finance", label: "Finance" },
  { value: "reception", label: "Receptionist" },
  { value: "security", label: "Security" },
];

/** Only Security can create accounts or reset passwords; Super Admin and Facility Admin have read-only user management on this page. */
function canManageUserAccounts(role: string | undefined) {
  return role === "security";
}

export default function AdminPage() {
  const { user, token } = useAuth();
  const manageAccounts = canManageUserAccounts(user?.role);
  const { toast } = useToast();

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

  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);

  const activeUsers = useMemo(() => {
    return users
      .filter((u) => u.isActive)
      .sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username, undefined, { sensitivity: "base" }));
  }, [users]);

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    facility_admin: "Facility Admin",
    clinician: "Clinician",
    nurse: "Nurse",
    lab_tech: "Lab Tech",
    pharmacist: "Pharmacist",
    finance: "Finance",
    reception: "Receptionist",
  };

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
    facility_admin: "bg-chart-5/10 text-chart-5",
    clinician: "bg-primary/10 text-primary",
    nurse: "bg-chart-3/10 text-chart-3",
    lab_tech: "bg-chart-2/10 text-chart-2",
    pharmacist: "bg-chart-4/10 text-chart-4",
    finance: "bg-chart-1/10 text-chart-1",
    reception: "bg-muted text-muted-foreground",
    security: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" data-testid="admin-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground text-sm mt-1">System management and audit logs</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Active users</p>
              <p className="text-xl font-bold">{activeUsers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Facilities</p>
              <p className="text-xl font-bold">{facilities.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Audit Entries</p>
              <p className="text-xl font-bold">{auditLogs.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Users ({activeUsers.length} active)
          </TabsTrigger>
          <TabsTrigger value="facilities" data-testid="tab-facilities">
            <Building2 className="w-3.5 h-3.5 mr-1.5" /> Facilities ({facilities.length})
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            <Shield className="w-3.5 h-3.5 mr-1.5" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Active users</h2>
              <p className="text-sm text-muted-foreground">
                Staff accounts that can sign in. Inactive accounts are hidden here.
                {!manageAccounts ? " Only Security can create accounts or reset passwords." : ""}
              </p>
            </div>
            {manageAccounts ? (
              <Button type="button" onClick={() => setCreateUserOpen(true)} data-testid="button-open-create-user">
                <UserPlus className="w-4 h-4 mr-2" />
                Create User
              </Button>
            ) : null}
          </div>

          <Card className="border-2 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : activeUsers.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground" data-testid="users-table-empty">
                  {manageAccounts
                    ? "No active users yet. Create a user to get started."
                    : "No active users to display."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="users-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[10rem]">Name</TableHead>
                        <TableHead className="min-w-[8rem]">Username</TableHead>
                        <TableHead className="min-w-[9rem]">Role</TableHead>
                        <TableHead className="min-w-[12rem]">Email</TableHead>
                        <TableHead className="min-w-[9rem]">Phone</TableHead>
                        <TableHead className="min-w-[10rem]">Facility</TableHead>
                        <TableHead className="min-w-[9rem] whitespace-nowrap">Created</TableHead>
                        {manageAccounts ? (
                          <TableHead className="min-w-[10rem] text-right">Actions</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeUsers.map((u) => {
                        const fac = u.facilityId ? facilityById.get(u.facilityId) : undefined;
                        return (
                          <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                            <TableCell className="font-medium">{u.fullName}</TableCell>
                            <TableCell className="text-muted-foreground font-mono text-xs">@{u.username}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={`text-[10px] ${roleColors[u.role]}`}>
                                {roleLabels[u.role] || u.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[14rem] truncate" title={u.email ?? ""}>
                              {u.email ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">{u.phone ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {fac ? `${fac.name} (${fac.code})` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                              {u.createdAt ? format(new Date(u.createdAt), "yyyy-MM-dd HH:mm") : "—"}
                            </TableCell>
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
