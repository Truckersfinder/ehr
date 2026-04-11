import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPostJson, apiDeleteJson } from "@/lib/api-client";
import { useBillingCurrency } from "@/lib/currency";
import { queryKeys } from "@/lib/query-keys";
import { ArrowLeft, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";
import type { BillingChargeCatalog, Encounter, EncounterVisitCharge, Patient, User } from "@shared/schema";

const CATEGORY_ORDER = ["lab_order", "medication", "imaging", "problem_list", "clinical_charge"] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  lab_order: "Lab orders",
  medication: "Medication orders",
  imaging: "Imaging orders",
  problem_list: "Problem list",
  clinical_charge: "Clinical charges",
};

function lineKindLabel(kind: string): string {
  if (kind === "visit_type") return "Visit";
  if (kind === "lab_order") return "Lab";
  if (kind === "imaging_order") return "Imaging";
  if (kind === "prescription") return "Medication";
  if (kind === "manual") return "Added";
  return kind;
}

function canManageManualCharges(role: string | undefined) {
  return role === "super_admin";
}

export default function BillingVisitChargesReviewPage() {
  const [, params] = useRoute("/billing/visit-charges/:encounterId");
  const encounterId = params?.encounterId;
  const { token, user } = useAuth();
  const orgTz = useOrgTimeZone();
  const { toast } = useToast();
  const { currencyCode } = useBillingCurrency(token);
  const canManage = canManageManualCharges(user?.role);

  const [addCategory, setAddCategory] = useState<(typeof CATEGORY_ORDER)[number]>("clinical_charge");
  const [addItemKey, setAddItemKey] = useState<string>("");
  const [addQty, setAddQty] = useState("1");

  const {
    data: encounter,
    isLoading: encLoading,
    error: encError,
  } = useQuery({
    queryKey: queryKeys.encounters.detail(encounterId ?? ""),
    queryFn: () => apiGetJson<Encounter>(`/api/encounters/${encounterId}`, token),
    enabled: !!token && !!encounterId,
  });
  const isFinalized = !!(encounter as any)?.chargesFinalizedAt;

  const { data: patient } = useQuery({
    queryKey: queryKeys.patients.detail(encounter?.patientId ?? ""),
    queryFn: () => apiGetJson<Patient>(`/api/patients/${encounter!.patientId}`, token),
    enabled: !!token && !!encounter?.patientId,
  });

  const { data: charges = [], isLoading: chargesLoading } = useQuery({
    queryKey: ["/api/encounters", encounterId, "visit-charges"],
    queryFn: () => apiGetJson<EncounterVisitCharge[]>(`/api/encounters/${encounterId}/visit-charges`, token),
    enabled: !!token && !!encounterId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: queryKeys.billingChargeCatalog.root,
    queryFn: () => apiGetJson<BillingChargeCatalog[]>("/api/billing/charge-catalog", token),
    enabled: !!token && canManage,
  });

  const { data: users = [] } = useQuery({
    queryKey: queryKeys.users.root,
    queryFn: () => apiGetJson<User[]>("/api/users", token),
    enabled: !!token,
  });

  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) {
      m.set(u.id, (u.fullName && String(u.fullName).trim()) || u.username);
    }
    return m;
  }, [users]);

  const itemsInCategory = useMemo(
    () =>
      catalog
        .filter((c) => c.category === addCategory)
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label),
        ),
    [catalog, addCategory],
  );

  useEffect(() => {
    setAddItemKey("");
  }, [addCategory]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!addItemKey) throw new Error("Select a price list item");
      const qty = Math.max(1, Math.min(999, parseInt(addQty, 10) || 1));
      return apiPostJson<{ ok: boolean }>(
        `/api/encounters/${encounterId}/visit-charges/manual`,
        {
          catalogCategory: addCategory,
          catalogItemKey: addItemKey,
          quantity: qty,
        },
        token,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId, "visit-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/todays-visits"] });
      toast({ title: "Charge added" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not add charge", description: e.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () =>
      apiPostJson<Encounter, Record<string, never>>(`/api/encounters/${encounterId}/visit-charges/finalize`, {}, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.detail(encounterId ?? "") });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/todays-visits"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.root });
      toast({ title: "Charges finalized" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not finalize", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (chargeId: string) =>
      apiDeleteJson<{ ok: boolean }>(`/api/encounters/${encounterId}/visit-charges/${chargeId}`, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId, "visit-charges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/todays-visits"] });
      toast({ title: "Charge removed" });
    },
    onError: (e: Error) =>
      toast({ title: "Could not remove", description: e.message, variant: "destructive" }),
  });

  const total = useMemo(() => charges.reduce((s, c) => s + Number(c.amount ?? 0), 0), [charges]);

  if (!encounterId) {
    return (
      <div className="p-6"><p className="text-muted-foreground">Missing encounter.</p></div>
    );
  }

  if (encLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48 mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (encError || !encounter) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-destructive">Encounter not found or you don&apos;t have access.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/billing">Back to billing</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="billing-visit-charges-review">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/billing" aria-label="Back to billing">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visit charges</h1>
          <p className="text-sm text-muted-foreground">
            {patient ? (
              <>
                {patient.firstName} {patient.lastName}
                <span className="font-mono text-xs ml-2">MRN {patient.mrn}</span>
              </>
            ) : (
              "Patient"
            )}
            {encounter.visitDate && (
              <span className="ml-2">
                · {formatInOrgTimeZone(encounter.visitDate, "MMM d, yyyy h:mm a", orgTz)}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManage ? (
            <Button
              type="button"
              onClick={() => finalizeMutation.mutate()}
              disabled={
                finalizeMutation.isPending ||
                isFinalized ||
                String(encounter.status ?? "") !== "completed"
              }
              title={
                String(encounter.status ?? "") !== "completed"
                  ? "Visit must be completed before finalizing charges"
                  : isFinalized
                    ? "Charges already finalized"
                    : "Finalize charges"
              }
              data-testid="button-finalize-charges"
            >
              {isFinalized ? "Charges Finalized" : finalizeMutation.isPending ? "Finalizing…" : "Finalize Charges"}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-sm font-semibold">Current charges</h2>
          <p className="text-xs text-muted-foreground font-normal">
            Internal orders, visit type, and price-list additions. External orders are excluded from automated lines.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {chargesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {canManage ? <TableHead className="w-10" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 6 : 5} className="text-muted-foreground text-center py-8">
                        No charges yet for this encounter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    charges.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {lineKindLabel(row.lineKind)}
                        </TableCell>
                        <TableCell className="text-sm">{row.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(row as any).orderedByUserId
                            ? userNameById.get((row as any).orderedByUserId) ?? "—"
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {currencyCode}{" "}
                          {Number(row.amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            {row.lineKind === "manual" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                aria-label="Remove added charge"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(row.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t text-sm font-medium">
            <span>Total</span>
            <span className="tabular-nums">
              {currencyCode}{" "}
              {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold">Add charge from price list</h2>
            <p className="text-xs text-muted-foreground font-normal">
              Select a category and item from the facility price list. Quantity multiplies the unit price.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={addCategory}
                  onValueChange={(v) => setAddCategory(v as (typeof CATEGORY_ORDER)[number])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ORDER.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Item</Label>
                <Select value={addItemKey} onValueChange={setAddItemKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an item…" />
                  </SelectTrigger>
                  <SelectContent>
                    {itemsInCategory.map((row) => (
                      <SelectItem key={row.id} value={row.itemKey}>
                        {row.label}{" "}
                        <span className="text-muted-foreground">
                          ({currencyCode} {Number(row.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !addItemKey}
            >
              {addMutation.isPending ? "Adding…" : "Add to visit charges"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only billing administrators can add or remove price-list charges here.
        </p>
      )}
    </div>
  );
}
