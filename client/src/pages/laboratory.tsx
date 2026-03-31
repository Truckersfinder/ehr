import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPatchJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Building2, Upload } from "lucide-react";
import { format } from "date-fns";
import { DocumentFileUpload } from "@/components/document-file-upload";
import { labOrderStatusBadgeClass } from "@/lib/lab-order-status";
import type { LabOrder, Patient } from "@shared/schema";

type SortDir = "asc" | "desc";
type LabSortKey = "createdAt" | "testName" | "patient" | "mrn" | "testCode" | "priority" | "status";

function labOrderCreatedAtIso(v: LabOrder["createdAt"]): string {
  if (v == null) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

function priorityLabel(p: unknown): string {
  const v = String(p || "").toLowerCase();
  if (v === "stat") return "STAT";
  if (v === "urgent") return "Urgent";
  return "Routine";
}

export default function LaboratoryPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const patientIdFromUrl = useMemo(() => new URLSearchParams(search).get("patientId"), [search]);

  const { user, token } = useAuth();
  const { toast } = useToast();
  const [resultOpen, setResultOpen] = useState<string | null>(null);
  const [uploadResultOpen, setUploadResultOpen] = useState<string | null>(null);
  const [resultData, setResultData] = useState({ result: "", resultValue: "", referenceRange: "", isCritical: false, documentUrl: "" });

  const { data: orders = [], isLoading } = useQuery<LabOrder[]>({
    queryKey: queryKeys.labOrders.root,
    queryFn: () => apiGetJson<LabOrder[]>("/api/lab-orders", token),
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.root,
    queryFn: () => apiGetJson<Patient[]>("/api/patients", token),
  });

  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const ordersForView = useMemo(() => {
    if (!patientIdFromUrl) return orders;
    return orders.filter((o) => o.patientId === patientIdFromUrl);
  }, [orders, patientIdFromUrl]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiPatchJson<Record<string, unknown>>(`/api/lab-orders/${id}`, data, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labOrders.root });
      toast({ title: "Lab order updated" });
      setResultOpen(null);
      setUploadResultOpen(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getInternalExternal = (o: LabOrder & { internalExternal?: string; internal_external?: string }) => {
    const v =
      (o as { internalExternal?: string; internal_external?: string }).internalExternal ??
      (o as { internalExternal?: string; internal_external?: string }).internal_external ??
      "internal";
    return String(v).toLowerCase() === "external" ? "external" : "internal";
  };
  const isInternal = (o: LabOrder & { internalExternal?: string | null; internal_external?: string | null }) =>
    getInternalExternal(o as LabOrder & { internalExternal?: string; internal_external?: string }) !== "external";
  const internalOrders = ordersForView.filter(isInternal);
  const externalOrders = ordersForView.filter(
    (o) => getInternalExternal(o as LabOrder & { internalExternal?: string; internal_external?: string }) === "external"
  );

  const isResulted = (o: LabOrder) => o.status === "resulted" || o.status === "completed";
  const internalPending = internalOrders.filter((o) => !isResulted(o) && o.status !== "cancelled");
  const externalPending = externalOrders.filter((o) => !isResulted(o) && o.status !== "cancelled");

  const filterPatient = patientIdFromUrl ? patientMap.get(patientIdFromUrl) : null;

  const [internalSortKey, setInternalSortKey] = useState<LabSortKey>("createdAt");
  const [internalSortDir, setInternalSortDir] = useState<SortDir>("desc");
  const [externalSortKey, setExternalSortKey] = useState<LabSortKey>("createdAt");
  const [externalSortDir, setExternalSortDir] = useState<SortDir>("desc");

  const sortOrders = (list: LabOrder[], key: LabSortKey, dir: SortDir) => {
    const mult = dir === "asc" ? 1 : -1;
    const sorted = [...list];
    sorted.sort((a, b) => {
      const aPt = patientMap.get(a.patientId);
      const bPt = patientMap.get(b.patientId);
      const aPatient = aPt ? `${aPt.firstName} ${aPt.lastName}`.trim().toLowerCase() : "";
      const bPatient = bPt ? `${bPt.firstName} ${bPt.lastName}`.trim().toLowerCase() : "";
      const aMrn = (aPt?.mrn ?? "").toLowerCase();
      const bMrn = (bPt?.mrn ?? "").toLowerCase();
      const aCreated = new Date(labOrderCreatedAtIso(a.createdAt) || 0).getTime();
      const bCreated = new Date(labOrderCreatedAtIso(b.createdAt) || 0).getTime();
      const aTest = (a.testName ?? "").toLowerCase();
      const bTest = (b.testName ?? "").toLowerCase();
      const aCode = (a.testCode ?? "").toLowerCase();
      const bCode = (b.testCode ?? "").toLowerCase();
      const aPrio = priorityLabel(a.priority).toLowerCase();
      const bPrio = priorityLabel(b.priority).toLowerCase();
      const aStatus = String(a.status ?? "").toLowerCase();
      const bStatus = String(b.status ?? "").toLowerCase();

      switch (key) {
        case "patient":
          return aPatient.localeCompare(bPatient) * mult;
        case "mrn":
          return aMrn.localeCompare(bMrn) * mult;
        case "testName":
          return aTest.localeCompare(bTest) * mult;
        case "testCode":
          return aCode.localeCompare(bCode) * mult;
        case "priority":
          return aPrio.localeCompare(bPrio) * mult;
        case "status":
          return aStatus.localeCompare(bStatus) * mult;
        case "createdAt":
        default:
          return (aCreated - bCreated) * mult;
      }
    });
    return sorted;
  };

  const internalSorted = useMemo(
    () => sortOrders(internalPending, internalSortKey, internalSortDir),
    // patientMap changes whenever patients changes; use patients as dependency via patientMap's source
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internalPending, internalSortKey, internalSortDir, patients],
  );
  const externalSorted = useMemo(
    () => sortOrders(externalPending, externalSortKey, externalSortDir),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalPending, externalSortKey, externalSortDir, patients],
  );

  const toggleSort = (
    key: LabSortKey,
    which: "internal" | "external",
  ) => {
    if (which === "internal") {
      if (internalSortKey === key) {
        setInternalSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setInternalSortKey(key);
        setInternalSortDir(key === "createdAt" ? "desc" : "asc");
      }
      return;
    }
    if (externalSortKey === key) {
      setExternalSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setExternalSortKey(key);
      setExternalSortDir(key === "createdAt" ? "desc" : "asc");
    }
  };

  const sortHead = (
    which: "internal" | "external",
    key: LabSortKey,
    label: string,
    className = "",
  ) => {
    const activeKey = which === "internal" ? internalSortKey : externalSortKey;
    const activeDir = which === "internal" ? internalSortDir : externalSortDir;
    const arrow = activeKey === key ? (activeDir === "asc" ? " ▲" : " ▼") : "";
    return (
      <button
        type="button"
        onClick={() => toggleSort(key, which)}
        className={`w-full text-left text-xs font-semibold uppercase tracking-wide hover:underline ${className}`}
      >
        {label}{arrow}
      </button>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="laboratory-page">
      {patientIdFromUrl && (
        <div
          className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
          data-testid="laboratory-patient-filter-banner"
        >
          <span>
            Showing lab orders for{" "}
            <strong>
              {filterPatient ? `${filterPatient.firstName} ${filterPatient.lastName}` : "selected patient"}
            </strong>
            {filterPatient && <span className="text-muted-foreground font-mono text-xs ml-1">({filterPatient.mrn})</span>}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => navigate("/laboratory")}>
            Show all patients
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laboratory</h1>
          <p className="text-muted-foreground text-sm mt-1">Internal labs (collect & result) and external labs (upload results)</p>
        </div>
      </div>

      <Tabs defaultValue="internal" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="internal" className="gap-2">
            <Building2 className="w-4 h-4" /> Internal labs ({internalPending.length} pending)
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-2">
            <Upload className="w-4 h-4" /> External labs ({externalPending.length} pending)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="space-y-6 mt-4">
          <p className="text-sm text-muted-foreground">Collected and resulted by internal staff. Once resulted, labs leave this list and appear in the patient&apos;s Results section.</p>
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : internalPending.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No pending internal lab orders</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[10rem]">{sortHead("internal", "testName", "Test")}</TableHead>
                      <TableHead className="min-w-[12rem]">{sortHead("internal", "patient", "Patient")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("internal", "mrn", "MRN")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("internal", "testCode", "Code")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("internal", "priority", "Priority")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("internal", "status", "Status")}</TableHead>
                      <TableHead className="w-[10rem]">{sortHead("internal", "createdAt", "Ordered")}</TableHead>
                      <TableHead className="w-[13rem] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {internalSorted.map((order) => {
                      const pt = patientMap.get(order.patientId);
                      const patientName = pt ? `${pt.firstName} ${pt.lastName}` : "Unknown";
                      const orderedAt = labOrderCreatedAtIso(order.createdAt);
                      return (
                        <TableRow key={order.id} data-testid={`row-internal-lab-${order.id}`}>
                          <TableCell className="font-medium">{order.testName}</TableCell>
                          <TableCell className="min-w-0">
                            <span className="truncate block" title={patientName}>{patientName}</span>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{pt?.mrn ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{order.testCode || "—"}</TableCell>
                          <TableCell>
                            {priorityLabel(order.priority) === "STAT" && <Badge variant="destructive" className="text-[10px]">STAT</Badge>}
                            {priorityLabel(order.priority) === "Urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                            {priorityLabel(order.priority) === "Routine" && <Badge variant="secondary" className="text-[10px]">Routine</Badge>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-[10px] ${labOrderStatusBadgeClass(order.status)}`}>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {orderedAt ? format(new Date(orderedAt), "yyyy-MM-dd HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {order.status === "ordered" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => updateMutation.mutate({ id: order.id, data: { status: "collected" } })}
                              >
                                Mark Collected
                              </Button>
                            )}
                            {order.status === "collected" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => updateMutation.mutate({ id: order.id, data: { status: "processing" } })}
                              >
                                Start Processing
                              </Button>
                            )}
                            {order.status === "processing" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setResultOpen(order.id);
                                  setResultData({ result: "", resultValue: "", referenceRange: "", isCritical: false, documentUrl: "" });
                                }}
                              >
                                Enter Results
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="external" className="space-y-6 mt-4">
          <p className="text-sm text-muted-foreground">External lab orders. Upload results to mark complete; once resulted, they leave this list and appear in the patient&apos;s Results section on their chart.</p>
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : externalPending.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No pending external lab orders</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[10rem]">{sortHead("external", "testName", "Test")}</TableHead>
                      <TableHead className="min-w-[12rem]">{sortHead("external", "patient", "Patient")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("external", "mrn", "MRN")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("external", "testCode", "Code")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("external", "priority", "Priority")}</TableHead>
                      <TableHead className="w-[7rem]">{sortHead("external", "status", "Status")}</TableHead>
                      <TableHead className="w-[10rem]">{sortHead("external", "createdAt", "Ordered")}</TableHead>
                      <TableHead className="w-[13rem] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {externalSorted.map((order) => {
                      const pt = patientMap.get(order.patientId);
                      const patientName = pt ? `${pt.firstName} ${pt.lastName}` : "Unknown";
                      const orderedAt = labOrderCreatedAtIso(order.createdAt);
                      return (
                        <TableRow key={order.id} data-testid={`row-external-lab-${order.id}`}>
                          <TableCell className="font-medium">{order.testName}</TableCell>
                          <TableCell className="min-w-0">
                            <span className="truncate block" title={patientName}>{patientName}</span>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{pt?.mrn ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{order.testCode || "—"}</TableCell>
                          <TableCell>
                            {priorityLabel(order.priority) === "STAT" && <Badge variant="destructive" className="text-[10px]">STAT</Badge>}
                            {priorityLabel(order.priority) === "Urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                            {priorityLabel(order.priority) === "Routine" && <Badge variant="secondary" className="text-[10px]">Routine</Badge>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`text-[10px] ${labOrderStatusBadgeClass(order.status)}`}>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                            {orderedAt ? format(new Date(orderedAt), "yyyy-MM-dd HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setUploadResultOpen(order.id);
                                setResultData({ result: "", resultValue: "", referenceRange: "", isCritical: false, documentUrl: "" });
                              }}
                            >
                              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload result
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!resultOpen} onOpenChange={(open) => { if (!open) setResultOpen(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter Lab Results</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!resultOpen) return;
              updateMutation.mutate({
                id: resultOpen,
                data: {
                  result: resultData.result,
                  resultValue: resultData.resultValue || undefined,
                  referenceRange: resultData.referenceRange || undefined,
                  isCritical: resultData.isCritical,
                  status: "resulted",
                  completedAt: new Date().toISOString(),
                },
              });
            }}
          >
            <div className="space-y-2">
              <Label>Result Summary</Label>
              <Textarea value={resultData.result} onChange={(e) => setResultData({ ...resultData, result: e.target.value })} className="resize-none" />
            </div>
            <div className="space-y-2">
              <Label>Result Values</Label>
              <Input value={resultData.resultValue} onChange={(e) => setResultData({ ...resultData, resultValue: e.target.value })} placeholder="e.g., WBC: 7.2, RBC: 4.8" />
            </div>
            <div className="space-y-2">
              <Label>Reference Range</Label>
              <Input value={resultData.referenceRange} onChange={(e) => setResultData({ ...resultData, referenceRange: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="critical" checked={resultData.isCritical} onChange={(e) => setResultData({ ...resultData, isCritical: e.target.checked })} />
              <Label htmlFor="critical" className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Critical Value
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setResultOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>Submit Results</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!uploadResultOpen} onOpenChange={() => setUploadResultOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload external lab result</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!uploadResultOpen) return;
              updateMutation.mutate({
                id: uploadResultOpen,
                data: {
                  result: resultData.result,
                  resultValue: resultData.resultValue || undefined,
                  referenceRange: resultData.referenceRange || undefined,
                  isCritical: resultData.isCritical,
                  documentUrl: resultData.documentUrl || undefined,
                  status: "resulted",
                  completedAt: new Date().toISOString(),
                },
              });
            }}
          >
            <div className="space-y-2">
              <Label>Result summary</Label>
              <Textarea value={resultData.result} onChange={(e) => setResultData({ ...resultData, result: e.target.value })} className="resize-none" />
            </div>
            <div className="space-y-2">
              <Label>Result values</Label>
              <Input value={resultData.resultValue} onChange={(e) => setResultData({ ...resultData, resultValue: e.target.value })} placeholder="e.g. WBC: 7.2, RBC: 4.8" />
            </div>
            <div className="space-y-2">
              <Label>Reference range</Label>
              <Input value={resultData.referenceRange} onChange={(e) => setResultData({ ...resultData, referenceRange: e.target.value })} />
            </div>
            <DocumentFileUpload
              value={resultData.documentUrl}
              onChange={(url) => setResultData({ ...resultData, documentUrl: url ?? "" })}
            />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="critical-upload" checked={resultData.isCritical} onChange={(e) => setResultData({ ...resultData, isCritical: e.target.checked })} />
              <Label htmlFor="critical-upload" className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Critical value
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setUploadResultOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending}>Upload & mark complete</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
