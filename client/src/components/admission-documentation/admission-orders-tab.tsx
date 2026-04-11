import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { COMMON_IMAGING_AFRICA } from "@/lib/common-imaging-africa";
import { COMMON_LAB_TESTS_AFRICA } from "@/lib/common-lab-tests-africa";
import type { ImagingOrder, LabOrder } from "@shared/schema";

type Props = {
  admissionId: string;
  patientId: string;
};

export function AdmissionOrdersTab({ admissionId, patientId }: Props) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const orgTz = useOrgTimeZone();

  const [composer, setComposer] = useState<"lab" | "imaging" | null>(null);
  const [labForm, setLabForm] = useState({
    testName: "",
    testCode: "",
    priority: "routine",
    internalExternal: "internal" as "internal" | "external",
  });
  const [imagingForm, setImagingForm] = useState({
    title: "",
    modality: "X-Ray",
    internalExternal: "internal" as "internal" | "external",
  });

  const { data: labs = [], isLoading: labsLoading } = useQuery<LabOrder[]>({
    queryKey: ["/api/admissions", admissionId, "lab-orders"],
    queryFn: () => apiGetJson<LabOrder[]>(`/api/admissions/${admissionId}/lab-orders`, token),
    enabled: !!token && !!admissionId,
  });

  const { data: imaging = [], isLoading: imagingLoading } = useQuery<ImagingOrder[]>({
    queryKey: ["/api/admissions", admissionId, "imaging-orders"],
    queryFn: () => apiGetJson<ImagingOrder[]>(`/api/admissions/${admissionId}/imaging-orders`, token),
    enabled: !!token && !!admissionId,
  });

  const createLabMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admissions/${admissionId}/lab-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId,
          orderedBy: user?.id,
          testName: labForm.testName.trim(),
          testCode: labForm.testCode.trim() || null,
          priority: labForm.priority,
          internalExternal: labForm.internalExternal,
          status: "ordered",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not create lab order");
      }
      return res.json() as Promise<LabOrder>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions", admissionId, "lab-orders"] });
      toast({ title: "Lab order created" });
      setComposer(null);
      setLabForm({ testName: "", testCode: "", priority: "routine", internalExternal: "internal" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createImagingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admissions/${admissionId}/imaging-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId,
          orderedBy: user?.id,
          title: imagingForm.title.trim(),
          modality: imagingForm.modality,
          internalExternal: imagingForm.internalExternal,
          status: "ordered",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not create imaging order");
      }
      return res.json() as Promise<ImagingOrder>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions", admissionId, "imaging-orders"] });
      toast({ title: "Imaging order created" });
      setComposer(null);
      setImagingForm({ title: "", modality: "X-Ray", internalExternal: "internal" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const busy = labsLoading || imagingLoading;

  return (
    <div className="space-y-4" data-testid="admission-orders-tab">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Admission orders</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setComposer("lab")} data-testid="button-admission-new-lab-order">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Lab
          </Button>
          <Button size="sm" onClick={() => setComposer("imaging")} data-testid="button-admission-new-imaging-order">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Imaging
          </Button>
        </div>
      </div>

      {busy ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : labs.length === 0 && imaging.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No admission orders yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {labs.map((o) => (
            <Card key={o.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                  <span className="font-medium shrink-0">{o.testName}</span>
                  {o.testCode ? <span className="text-muted-foreground shrink-0">{o.testCode}</span> : null}
                  <span className="text-muted-foreground shrink-0">{o.priority}</span>
                  {(o as any).internalExternal === "external" ? (
                    <span className="text-muted-foreground shrink-0">External</span>
                  ) : null}
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {o.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                  Ordered {formatInOrgTimeZone(o.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                </div>
              </CardContent>
            </Card>
          ))}

          {imaging.map((o) => (
            <Card key={o.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                  <span className="font-medium shrink-0">{o.title}</span>
                  <span className="text-muted-foreground shrink-0">{o.modality}</span>
                  {(o as any).internalExternal === "external" ? (
                    <span className="text-muted-foreground shrink-0">External</span>
                  ) : null}
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {o.status}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                  Ordered {formatInOrgTimeZone(o.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={composer === "lab"} onOpenChange={(o) => (!o ? setComposer(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New admission lab order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Test *</Label>
              <Select
                value={
                  COMMON_LAB_TESTS_AFRICA.some((t) => t.testName === labForm.testName)
                    ? labForm.testName
                    : labForm.testName
                      ? "other"
                      : ""
                }
                onValueChange={(v) => {
                  if (v === "other") {
                    setLabForm((s) => ({ ...s, testName: "", testCode: "" }));
                    return;
                  }
                  const picked = COMMON_LAB_TESTS_AFRICA.find((t) => t.testName === v);
                  setLabForm((s) => ({ ...s, testName: v, testCode: picked?.testCode ?? "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select test" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_LAB_TESTS_AFRICA.map((t) => (
                    <SelectItem key={t.testName} value={t.testName}>
                      {t.testName}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {!COMMON_LAB_TESTS_AFRICA.some((t) => t.testName === labForm.testName) ? (
                <Input value={labForm.testName} onChange={(e) => setLabForm((s) => ({ ...s, testName: e.target.value }))} placeholder="Type test name" />
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={labForm.priority} onValueChange={(v) => setLabForm((s) => ({ ...s, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Internal / external</Label>
                <Select value={labForm.internalExternal} onValueChange={(v) => setLabForm((s) => ({ ...s, internalExternal: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Code (optional)</Label>
              <Input value={labForm.testCode} onChange={(e) => setLabForm((s) => ({ ...s, testCode: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setComposer(null)}>Cancel</Button>
              <Button
                type="button"
                onClick={() => createLabMutation.mutate()}
                disabled={!labForm.testName.trim() || createLabMutation.isPending}
              >
                {createLabMutation.isPending ? "Saving…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={composer === "imaging"} onOpenChange={(o) => (!o ? setComposer(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New admission imaging order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Study *</Label>
              <Select
                value={
                  COMMON_IMAGING_AFRICA.some((t) => t.title === imagingForm.title)
                    ? imagingForm.title
                    : imagingForm.title
                      ? "other"
                      : ""
                }
                onValueChange={(v) => {
                  if (v === "other") {
                    setImagingForm((s) => ({ ...s, title: "" }));
                    return;
                  }
                  const picked = COMMON_IMAGING_AFRICA.find((t) => t.title === v);
                  setImagingForm((s) => ({ ...s, title: v, modality: picked?.modality ?? s.modality }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select study" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_IMAGING_AFRICA.map((t) => (
                    <SelectItem key={t.title} value={t.title}>
                      {t.title}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {!COMMON_IMAGING_AFRICA.some((t) => t.title === imagingForm.title) ? (
                <Input value={imagingForm.title} onChange={(e) => setImagingForm((s) => ({ ...s, title: e.target.value }))} placeholder="Type study name" />
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Modality</Label>
                <Select value={imagingForm.modality} onValueChange={(v) => setImagingForm((s) => ({ ...s, modality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="X-Ray">X-Ray</SelectItem>
                    <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                    <SelectItem value="CT">CT</SelectItem>
                    <SelectItem value="MRI">MRI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Internal / external</Label>
                <Select value={imagingForm.internalExternal} onValueChange={(v) => setImagingForm((s) => ({ ...s, internalExternal: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setComposer(null)}>Cancel</Button>
              <Button
                type="button"
                onClick={() => createImagingMutation.mutate()}
                disabled={!imagingForm.title.trim() || createImagingMutation.isPending}
              >
                {createImagingMutation.isPending ? "Saving…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

