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
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Plus, Stethoscope, Search } from "lucide-react";
import { format } from "date-fns";
import type { Encounter, Patient, User } from "@shared/schema";

export default function EncountersPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({
    patientId: "", type: "outpatient" as const, chiefComplaint: "",
  });

  const { data: encounters = [], isLoading } = useQuery<Encounter[]>({
    queryKey: ["/api/encounters"],
    queryFn: async () => {
      const res = await fetch("/api/encounters", { headers: { Authorization: `Bearer ${token}` } });
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

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...data, clinicianId: user?.id, status: "in_progress",
          visitDate: new Date().toISOString(),
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      toast({ title: "Encounter created", description: "Navigate to the encounter to add notes." });
      setOpen(false);
      navigate(`/encounters/${data.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const filtered = search
    ? encounters.filter((e) => {
        const p = patientMap.get(e.patientId);
        const searchLower = search.toLowerCase();
        return (
          e.chiefComplaint?.toLowerCase().includes(searchLower) ||
          p?.firstName.toLowerCase().includes(searchLower) ||
          p?.lastName.toLowerCase().includes(searchLower) ||
          p?.mrn.toLowerCase().includes(searchLower)
        );
      })
    : encounters;

  const statusColors: Record<string, string> = {
    completed: "bg-chart-3/10 text-chart-3",
    in_progress: "bg-chart-4/10 text-chart-4",
    scheduled: "bg-accent text-accent-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="encounters-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Encounters</h1>
          <p className="text-muted-foreground text-sm mt-1">{encounters.length} total encounters</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-encounter">
              <Plus className="w-4 h-4 mr-2" /> New Encounter
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Start New Encounter</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select value={formData.patientId} onValueChange={(v) => setFormData({ ...formData, patientId: v })}>
                  <SelectTrigger data-testid="select-patient"><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.mrn})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outpatient">Outpatient</SelectItem>
                    <SelectItem value="inpatient">Inpatient</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chief Complaint</Label>
                <Textarea
                  data-testid="input-chief-complaint"
                  value={formData.chiefComplaint}
                  onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                  className="resize-none"
                  placeholder="Describe the primary reason for the visit..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="button-create-encounter" disabled={createMutation.isPending || !formData.patientId}>
                  {createMutation.isPending ? "Creating..." : "Start Encounter"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-encounters"
          placeholder="Search encounters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Stethoscope className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No encounters found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((enc) => {
            const pt = patientMap.get(enc.patientId);
            return (
              <Card
                key={enc.id}
                className="cursor-pointer hover-elevate"
                onClick={() => navigate(`/encounters/${enc.id}`)}
                data-testid={`card-encounter-${enc.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"}</p>
                        {pt && <span className="text-xs text-muted-foreground">{pt.mrn}</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{enc.chiefComplaint || "Clinical encounter"}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>{enc.visitDate ? format(new Date(enc.visitDate), "MMM d, yyyy HH:mm") : ""}</span>
                        <Badge variant="secondary" className="text-[10px]">{enc.type}</Badge>
                        {enc.icdCodes && <span>ICD: {enc.icdCodes}</span>}
                      </div>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] flex-shrink-0 ${statusColors[enc.status] || ""}`}>
                      {enc.status.replace("_", " ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
