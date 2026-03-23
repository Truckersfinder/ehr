import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Pill, Package, Clock } from "lucide-react";
import { format } from "date-fns";
import type { Prescription, Patient } from "@shared/schema";

export default function PharmacyPage() {
  const { toast } = useToast();
  const { token } = useAuth();

  const { data: prescriptions = [], isLoading } = useQuery<Prescription[]>({
    queryKey: ["/api/prescriptions"],
    queryFn: async () => {
      const res = await fetch("/api/prescriptions", { headers: { Authorization: `Bearer ${token}` } });
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

  const dispenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/prescriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "dispensed", dispensedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prescriptions"] });
      toast({ title: "Prescription dispensed" });
    },
  });

  const active = prescriptions.filter((p) => p.status === "active");
  const dispensed = prescriptions.filter((p) => p.status === "dispensed");

  const statusColors: Record<string, string> = {
    active: "bg-chart-4/10 text-chart-4",
    dispensed: "bg-chart-3/10 text-chart-3",
    cancelled: "bg-destructive/10 text-destructive",
    expired: "bg-muted text-muted-foreground",
  };

  const renderPrescription = (rx: Prescription, showDispense = false) => {
    const pt = patientMap.get(rx.patientId);
    return (
      <Card key={rx.id} data-testid={`card-prescription-${rx.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{rx.medicationName} {rx.dosage}</p>
                <Badge variant="secondary" className={`text-[10px] ${statusColors[rx.status]}`}>{rx.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"} - {rx.frequency} for {rx.duration}
              </p>
              {rx.instructions && <p className="text-xs text-muted-foreground mt-1">{rx.instructions}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                {rx.quantity && <span>Qty: {rx.quantity}</span>}
                <span>{rx.createdAt ? format(new Date(rx.createdAt), "MMM d, yyyy") : ""}</span>
              </div>
            </div>
            {showDispense && rx.status === "active" && (
              <Button size="sm" onClick={() => dispenseMutation.mutate(rx.id)} disabled={dispenseMutation.isPending} data-testid={`button-dispense-${rx.id}`}>
                <Package className="w-3.5 h-3.5 mr-1.5" /> Dispense
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="pharmacy-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pharmacy</h1>
        <p className="text-muted-foreground text-sm mt-1">{active.length} active prescriptions to dispense</p>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Active ({active.length})
          </TabsTrigger>
          <TabsTrigger value="dispensed">
            <Package className="w-3.5 h-3.5 mr-1.5" /> Dispensed ({dispensed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 mt-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : active.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Pill className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              No pending prescriptions
            </CardContent></Card>
          ) : active.map((rx) => renderPrescription(rx, true))}
        </TabsContent>

        <TabsContent value="dispensed" className="space-y-3 mt-4">
          {dispensed.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No dispensed prescriptions yet</CardContent></Card>
          ) : dispensed.map((rx) => renderPrescription(rx))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
