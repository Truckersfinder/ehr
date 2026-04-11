import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Syringe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DOSE_OPTIONS, DURATION_OPTIONS, FREQUENCY_OPTIONS } from "@/lib/medication-order-options";
import { COMMON_MEDICATIONS_AFRICA } from "@/lib/common-medications-africa";
import { frequencyToIntervalMinutes } from "@/lib/medication-frequency";
import type { MedicationAdministration, Prescription } from "@shared/schema";
import type { User as UserType } from "@shared/schema";

const ROUTE_OPTIONS: { id: "oral" | "injection" | "iv"; label: string }[] = [
  { id: "oral", label: "Oral" },
  { id: "injection", label: "Injection" },
  { id: "iv", label: "Intravenous (IV)" },
];

type Props = {
  admissionId: string;
  patientId: string;
};

export function AdmissionMedicationTab({ admissionId, patientId }: Props) {
  const { token, user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<"history" | "administration">("administration");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState<{ rx: Prescription } | null>(null);

  const [newRx, setNewRx] = useState({
    medicationName: "",
    dosage: "",
    frequency: "once daily",
    duration: "",
    instructions: "",
    orderType: "administered" as "administered" | "prescription",
    route: "",
    rate: "",
  });

  const [adminForm, setAdminForm] = useState({ doseGiven: "", notes: "" });

  const { data: meds = [], isLoading } = useQuery<Prescription[]>({
    queryKey: ["/api/admissions", admissionId, "medications"],
    queryFn: () => apiGetJson<Prescription[]>(`/api/admissions/${admissionId}/medications`, token),
    enabled: !!token && !!admissionId,
  });

  const { data: patientMeds = [] } = useQuery<Prescription[]>({
    queryKey: ["/api/prescriptions", "patient", patientId],
    queryFn: () => apiGetJson<Prescription[]>(`/api/prescriptions?patientId=${patientId}`, token),
    enabled: !!token && !!patientId,
  });

  const { data: administrations = [] } = useQuery<MedicationAdministration[]>({
    queryKey: ["/api/admissions", admissionId, "medication-administrations"],
    queryFn: () =>
      apiGetJson<MedicationAdministration[]>(`/api/admissions/${admissionId}/medication-administrations`, token),
    enabled: !!token && !!admissionId,
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiGetJson<Omit<UserType, "password">[]>("/api/users", token),
    enabled: !!token,
  });
  const userNameById = useMemo(
    () => new Map(users.map((u) => [u.id, u.fullName || u.username || "Unknown user"])),
    [users],
  );


  const addMedicationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admissions/${admissionId}/medications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId,
          prescribedBy: user?.id,
          orderType: newRx.orderType,
          medicationName: newRx.medicationName.trim(),
          dosage: newRx.dosage.trim(),
          frequency: newRx.frequency.trim(),
          instructions: newRx.instructions.trim() || null,
          status: "active",
          route: newRx.orderType === "administered" ? newRx.route : null,
          rate: newRx.orderType === "administered" && newRx.route === "iv" ? newRx.rate.trim() || null : null,
          duration: newRx.orderType === "prescription" ? (newRx.duration.trim() || null) : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not create medication order");
      }
      return res.json() as Promise<Prescription>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions", admissionId, "medications"] });
      toast({ title: "Medication order created" });
      setNewOrderOpen(false);
      setNewRx({
        medicationName: "",
        dosage: "",
        frequency: "once daily",
        duration: "",
        instructions: "",
        orderType: "administered",
        route: "",
        rate: "",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const administerMutation = useMutation({
    mutationFn: async (rx: Prescription) => {
      const res = await fetch(`/api/admissions/${admissionId}/medication-administrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          admissionId,
          prescriptionId: rx.id,
          patientId,
          administeredBy: user?.id,
          administeredAt: new Date().toISOString(),
          doseGiven: adminForm.doseGiven.trim() || null,
          notes: adminForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not record administration");
      }
      return res.json() as Promise<MedicationAdministration>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions", admissionId, "medication-administrations"] });
      toast({ title: "Administration recorded" });
      setAdminOpen(null);
      setAdminForm({ doseGiven: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const discontinueMutation = useMutation({
    mutationFn: async ({ rxId, reason }: { rxId: string; reason: string }) => {
      const res = await fetch(`/api/prescriptions/${rxId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: "cancelled",
          instructions: reason.trim() ? `Discontinued reason: ${reason.trim()}` : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not discontinue medication");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions", admissionId, "medications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prescriptions", "patient", patientId] });
      toast({ title: "Medication discontinued" });
      setTab("history");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activeMeds = useMemo(
    () => meds.filter((m) => m.status !== "cancelled"),
    [meds],
  );

  const administeredMeds = useMemo(
    () => activeMeds.filter((m) => (m as any).orderType === "administered"),
    [activeMeds],
  );

  const medNameById = useMemo(() => new Map(activeMeds.map((rx) => [rx.id, rx.medicationName])), [activeMeds]);

  const historyMeds = useMemo(() => {
    const list = [...patientMeds];
    list.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    return list;
  }, [patientMeds]);

  const [nowTick, setNowTick] = useState(() => Date.now());
  const dueToastRef = useRef(new Set<string>());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const nextDueByRxId = useMemo(() => {
    const map = new Map<string, { nextDueAt: number; intervalMin: number }>();
    for (const rx of administeredMeds) {
      const intervalMin = frequencyToIntervalMinutes(rx.frequency);
      if (!intervalMin) continue;
      const last = administrations
        .filter((a) => a.prescriptionId === rx.id)
        .sort((a, b) => new Date(b.administeredAt ?? 0).getTime() - new Date(a.administeredAt ?? 0).getTime())[0];
      if (!last?.administeredAt) continue;
      const lastMs = new Date(last.administeredAt).getTime();
      const nextDueAt = lastMs + intervalMin * 60_000;
      map.set(rx.id, { nextDueAt, intervalMin });
    }
    return map;
  }, [administrations, administeredMeds]);

  useEffect(() => {
    for (const [rxId, v] of Array.from(nextDueByRxId.entries())) {
      if (v.nextDueAt <= nowTick && !dueToastRef.current.has(rxId)) {
        dueToastRef.current.add(rxId);
        toast({ title: "Medication dose due", description: "A medication dose is now due for administration." });
      }
    }
  }, [nextDueByRxId, nowTick, toast]);

  return (
    <div className="space-y-4" data-testid="admission-medication-tab">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Medications</span>
        <Button size="sm" onClick={() => setNewOrderOpen(true)} data-testid="button-admission-new-med-order">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New order
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="history">Medication History</TabsTrigger>
          <TabsTrigger value="administration">Medication Administration</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-3 space-y-3">
          {historyMeds.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">No medications yet.</CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {historyMeds.map((rx) => (
                <Card key={rx.id} data-testid={`med-history-${rx.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className={`flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm ${rx.status === "cancelled" ? "line-through opacity-60" : ""}`}>
                      <span className="font-medium shrink-0">{rx.medicationName}</span>
                      <span className="shrink-0">{rx.dosage}</span>
                      <span className="text-muted-foreground shrink-0">{rx.frequency}</span>
                      {rx.duration ? <span className="text-muted-foreground shrink-0">· {rx.duration}</span> : null}
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {rx.status === "cancelled" ? "discontinued" : rx.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                      Ordered {rx.createdAt ? format(new Date(rx.createdAt), "MMM d, yyyy · HH:mm") : "—"}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="administration" className="mt-3 space-y-3">
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
            </Card>
          ) : administeredMeds.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">No medications to administer right now.</CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {administeredMeds.map((rx) => {
                const due = nextDueByRxId.get(rx.id);
                const msLeft = due ? due.nextDueAt - nowTick : null;
                const isOverdue = msLeft != null && msLeft <= 0;
                const dueAtLabel = due ? format(new Date(due.nextDueAt), "h:mm a") : null;
                return (
                  <Card key={rx.id} data-testid={`med-admin-${rx.id}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                        <span className="font-medium shrink-0">{rx.medicationName}</span>
                        <span className="shrink-0">{rx.dosage}</span>
                        <span className="text-muted-foreground shrink-0">{rx.frequency}</span>
                        {due ? (
                          <Badge variant={isOverdue ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                            {isOverdue ? `Due (was due at ${dueAtLabel})` : `Next dose at ${dueAtLabel}`}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] shrink-0">Not started</Badge>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-auto h-8 px-2.5 text-xs shrink-0"
                          onClick={() => {
                            setAdminOpen({ rx });
                            setAdminForm({ doseGiven: rx.dosage ?? "", notes: "" });
                          }}
                          data-testid={`button-administer-${rx.id}`}
                        >
                          <Syringe className="w-3.5 h-3.5 mr-1.5" /> Administer
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 px-2.5 text-xs shrink-0"
                          disabled={discontinueMutation.isPending}
                          onClick={() => {
                            const reason = window.prompt(`Reason to discontinue ${rx.medicationName}?`, "") ?? "";
                            if (!reason.trim()) return;
                            discontinueMutation.mutate({ rxId: rx.id, reason });
                          }}
                        >
                          Discontinue
                        </Button>
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                        Ordered {rx.createdAt ? format(new Date(rx.createdAt), "MMM d, yyyy · HH:mm") : "—"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Administration log</p>
            {administrations.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">No administrations recorded yet.</CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {administrations.slice(0, 25).map((a) => (
                  <Card key={a.id}>
                    <CardContent className="py-2.5 px-4">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium">
                          {medNameById.get(a.prescriptionId) ?? "Medication"} {a.doseGiven || ""}
                        </span>
                        <span className="text-muted-foreground">
                          · {a.administeredAt ? format(new Date(a.administeredAt), "MMM d, yyyy · HH:mm") : "—"}
                          {" · "}By {a.administeredBy ? (userNameById.get(a.administeredBy) ?? a.administeredBy) : "Unknown user"}
                        </span>
                      </div>
                      {a.notes ? <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.notes}</p> : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New admission medication order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Order type</Label>
              <Select value={newRx.orderType} onValueChange={(v) => setNewRx((s) => ({ ...s, orderType: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administered">Administer inpatient</SelectItem>
                  <SelectItem value="prescription">Discharge prescription</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newRx.orderType === "administered" ? (
              <div className="space-y-2">
                <Label>Route *</Label>
                <Select value={newRx.route} onValueChange={(v) => setNewRx((s) => ({ ...s, route: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTE_OPTIONS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Medication name *</Label>
              <Select
                value={
                  COMMON_MEDICATIONS_AFRICA.includes(newRx.medicationName)
                    ? newRx.medicationName
                    : newRx.medicationName
                      ? "other"
                      : ""
                }
                onValueChange={(v) => setNewRx((s) => ({ ...s, medicationName: v === "other" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select medication" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_MEDICATIONS_AFRICA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {!COMMON_MEDICATIONS_AFRICA.includes(newRx.medicationName) && (
                <Input
                  value={newRx.medicationName}
                  onChange={(e) => setNewRx((s) => ({ ...s, medicationName: e.target.value }))}
                  placeholder="Type medication name"
                />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dosage *</Label>
                <Select
                  value={DOSE_OPTIONS.includes(newRx.dosage as any) ? newRx.dosage : "Other"}
                  onValueChange={(v) => setNewRx((s) => ({ ...s, dosage: v === "Other" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                    <SelectItem value="Other">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {!newRx.dosage || !DOSE_OPTIONS.includes(newRx.dosage as any) ? (
                  <Input
                    value={newRx.dosage}
                    onChange={(e) => setNewRx((s) => ({ ...s, dosage: e.target.value }))}
                    placeholder="e.g. 1g IV"
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Frequency *</Label>
                <Select
                  value={FREQUENCY_OPTIONS.includes(newRx.frequency as any) ? newRx.frequency : "Other"}
                  onValueChange={(v) => setNewRx((s) => ({ ...s, frequency: v === "Other" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                    <SelectItem value="Other">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {!newRx.frequency || !FREQUENCY_OPTIONS.includes(newRx.frequency as any) ? (
                  <Input
                    value={newRx.frequency}
                    onChange={(e) => setNewRx((s) => ({ ...s, frequency: e.target.value }))}
                    placeholder="e.g. every 8 hours"
                  />
                ) : null}
              </div>
            </div>

            {newRx.orderType === "prescription" ? (
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select
                  value={DURATION_OPTIONS.includes(newRx.duration as any) ? newRx.duration : newRx.duration ? "Other" : "none"}
                  onValueChange={(v) => setNewRx((s) => ({ ...s, duration: v === "none" ? "" : v === "Other" ? s.duration : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                    <SelectItem value="Other">Other…</SelectItem>
                  </SelectContent>
                </Select>
                {newRx.duration && !DURATION_OPTIONS.includes(newRx.duration as any) ? (
                  <Input
                    value={newRx.duration}
                    onChange={(e) => setNewRx((s) => ({ ...s, duration: e.target.value }))}
                    placeholder="e.g. 5 days"
                  />
                ) : null}
              </div>
            ) : null}

            {newRx.orderType === "administered" && newRx.route === "iv" ? (
              <div className="space-y-2">
                <Label>Rate *</Label>
                <Input
                  value={newRx.rate}
                  onChange={(e) => setNewRx((s) => ({ ...s, rate: e.target.value }))}
                  placeholder="e.g. 100 mL/hr"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={newRx.instructions}
                onChange={(e) => setNewRx((s) => ({ ...s, instructions: e.target.value }))}
                rows={3}
                className="resize-none"
                placeholder="e.g. Hold if systolic BP < 90…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setNewOrderOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => addMedicationMutation.mutate()}
                disabled={
                  !newRx.medicationName.trim() ||
                  !newRx.dosage.trim() ||
                  !newRx.frequency.trim() ||
                  (newRx.orderType === "administered" && !newRx.route) ||
                  (newRx.orderType === "administered" && newRx.route === "iv" && !newRx.rate.trim()) ||
                  addMedicationMutation.isPending
                }
              >
                {addMedicationMutation.isPending ? "Saving…" : "Create order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adminOpen} onOpenChange={(open) => (!open ? setAdminOpen(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record administration</DialogTitle>
          </DialogHeader>
          {adminOpen ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{adminOpen.rx.medicationName}</p>
                <p className="text-xs text-muted-foreground">{adminOpen.rx.frequency}</p>
              </div>
              <div className="space-y-2">
                <Label>Dose given</Label>
                <Input value={adminForm.doseGiven} onChange={(e) => setAdminForm((s) => ({ ...s, doseGiven: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={adminForm.notes}
                  onChange={(e) => setAdminForm((s) => ({ ...s, notes: e.target.value }))}
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setAdminOpen(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => administerMutation.mutate(adminOpen.rx)}
                  disabled={administerMutation.isPending}
                >
                  {administerMutation.isPending ? "Saving…" : "Record"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

