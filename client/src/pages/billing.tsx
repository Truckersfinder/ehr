import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Receipt, CreditCard, Banknote, Smartphone } from "lucide-react";
import { format } from "date-fns";
import type { Invoice, Patient } from "@shared/schema";

export default function BillingPage() {
  const { toast } = useToast();
  const token = localStorage.getItem("ehr_token");
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices", { headers: { Authorization: `Bearer ${token}` } });
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

  const payMutation = useMutation({
    mutationFn: async ({ id, amount, method }: { id: string; amount: number; method: string }) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv) throw new Error("Invoice not found");
      const newPaid = Number(inv.paidAmount || 0) + amount;
      const newStatus = newPaid >= Number(inv.totalAmount) ? "paid" : "partial";
      const res = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paidAmount: String(newPaid), status: newStatus, paymentMethod: method }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Payment recorded" });
      setPayOpen(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to record payment", variant: "destructive" }),
  });

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending: "bg-chart-4/10 text-chart-4",
    paid: "bg-chart-3/10 text-chart-3",
    partial: "bg-chart-5/10 text-chart-5",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const pending = invoices.filter((i) => i.status === "pending" || i.status === "partial");
  const paid = invoices.filter((i) => i.status === "paid");
  const totalRevenue = invoices.reduce((sum, i) => sum + Number(i.paidAmount || 0), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + (Number(i.totalAmount) - Number(i.paidAmount || 0)), 0);

  const renderInvoice = (inv: Invoice, showPay = false) => {
    const pt = patientMap.get(inv.patientId);
    const items = typeof inv.items === "string" ? JSON.parse(inv.items) : inv.items;
    const balance = Number(inv.totalAmount) - Number(inv.paidAmount || 0);
    return (
      <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"}</p>
                <Badge variant="secondary" className={`text-[10px] ${statusColors[inv.status]}`}>{inv.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {inv.createdAt ? format(new Date(inv.createdAt), "MMM d, yyyy") : ""}
                {inv.paymentMethod && ` - ${inv.paymentMethod.toUpperCase()}`}
              </p>
              {Array.isArray(items) && (
                <div className="mt-2 space-y-0.5">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.description}</span>
                      <span>KES {Number(item.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t text-sm">
                <span>Total: KES {Number(inv.totalAmount).toLocaleString()}</span>
                <span className="font-medium">Balance: KES {balance.toLocaleString()}</span>
              </div>
            </div>
            {showPay && balance > 0 && (
              <Button size="sm" onClick={() => { setPayOpen(inv.id); setPayAmount(String(balance)); }} data-testid={`button-pay-${inv.id}`}>
                <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pay
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="billing-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm mt-1">{pending.length} pending invoices</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-3/10 flex items-center justify-center"><Banknote className="w-5 h-5 text-chart-3" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold" data-testid="stat-revenue">KES {totalRevenue.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-4/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-chart-4" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="text-xl font-bold" data-testid="stat-outstanding">KES {totalOutstanding.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Invoices</p>
                <p className="text-xl font-bold">{invoices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="paid">Paid ({paid.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          ) : pending.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No pending invoices</CardContent></Card>
          ) : pending.map((inv) => renderInvoice(inv, true))}
        </TabsContent>

        <TabsContent value="paid" className="space-y-3 mt-4">
          {paid.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No paid invoices yet</CardContent></Card>
          ) : paid.map((inv) => renderInvoice(inv))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!payOpen} onOpenChange={() => setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (payOpen) payMutation.mutate({ id: payOpen, amount: parseFloat(payAmount), method: payMethod });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (KES)</Label>
              <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={payMutation.isPending}>
                {payMutation.isPending ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
