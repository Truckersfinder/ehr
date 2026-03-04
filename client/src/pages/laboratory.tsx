import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, FlaskConical, AlertTriangle, Search } from "lucide-react";
import { format } from "date-fns";
import type { LabOrder, Patient } from "@shared/schema";

export default function LaboratoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const token = localStorage.getItem("ehr_token");
  const [open, setOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState<string | null>(null);
  const [resultData, setResultData] = useState({ result: "", resultValue: "", referenceRange: "", isCritical: false });
  const [formData, setFormData] = useState({ patientId: "", testName: "", testCode: "", priority: "routine" });

  const { data: orders = [], isLoading } = useQuery<LabOrder[]>({
    queryKey: ["/api/lab-orders"],
    queryFn: async () => {
      const res = await fetch("/api/lab-orders", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
    queryFn: async () => {
      const res = await fetch("/api/patients", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...data, orderedBy: user?.id, status: "ordered" }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders"] });
      toast({ title: "Lab order created" });
      setOpen(false);
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/lab-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders"] });
      toast({ title: "Lab order updated" });
      setResultOpen(null);
    },
  });

  const statusColors: Record<string, string> = {
    ordered: "bg-chart-4/10 text-chart-4",
    collected: "bg-chart-5/10 text-chart-5",
    processing: "bg-chart-2/10 text-chart-2",
    completed: "bg-chart-3/10 text-chart-3",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const pending = orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
  const completed = orders.filter((o) => o.status === "completed");

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="laboratory-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laboratory</h1>
          <p className="text-muted-foreground text-sm mt-1">{pending.length} pending orders</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-lab-order"><Plus className="w-4 h-4 mr-2" /> New Lab Order</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Lab Order</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select value={formData.patientId} onValueChange={(v) => setFormData({ ...formData, patientId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Test Name *</Label>
                  <Input value={formData.testName} onChange={(e) => setFormData({ ...formData, testName: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Test Code</Label>
                  <Input value={formData.testCode} onChange={(e) => setFormData({ ...formData, testCode: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="stat">STAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || !formData.patientId}>
                  {createMutation.isPending ? "Creating..." : "Create Order"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : pending.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No pending orders</CardContent></Card>
          ) : pending.map((order) => {
            const pt = patientMap.get(order.patientId);
            return (
              <Card key={order.id} data-testid={`card-lab-order-${order.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{order.testName}</p>
                        {order.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                        {order.priority === "stat" && <Badge variant="destructive" className="text-[10px]">STAT</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"} - {order.testCode || "N/A"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={`text-[10px] ${statusColors[order.status]}`}>{order.status}</Badge>
                      {order.status === "ordered" && (
                        <Button size="sm" variant="secondary" onClick={() => updateMutation.mutate({ id: order.id, data: { status: "collected" } })}>
                          Mark Collected
                        </Button>
                      )}
                      {order.status === "collected" && (
                        <Button size="sm" variant="secondary" onClick={() => updateMutation.mutate({ id: order.id, data: { status: "processing" } })}>
                          Start Processing
                        </Button>
                      )}
                      {order.status === "processing" && (
                        <Button size="sm" onClick={() => { setResultOpen(order.id); setResultData({ result: "", resultValue: "", referenceRange: "", isCritical: false }); }}>
                          Enter Results
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3 mt-4">
          {completed.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No completed orders</CardContent></Card>
          ) : completed.map((order) => {
            const pt = patientMap.get(order.patientId);
            return (
              <Card key={order.id} data-testid={`card-lab-result-${order.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{order.testName}</p>
                        {order.isCritical && <Badge variant="destructive" className="text-[10px]">Critical</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] bg-chart-3/10 text-chart-3">Completed</Badge>
                  </div>
                  {order.result && <p className="text-sm mt-2">{order.result}</p>}
                  {order.resultValue && <p className="text-xs text-muted-foreground mt-1">Values: {order.resultValue}</p>}
                  {order.referenceRange && <p className="text-xs text-muted-foreground">Ref: {order.referenceRange}</p>}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={!!resultOpen} onOpenChange={() => setResultOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enter Lab Results</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (resultOpen) updateMutation.mutate({ id: resultOpen, data: { ...resultData, status: "completed", completedAt: new Date().toISOString() } });
          }} className="space-y-4">
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
    </div>
  );
}
