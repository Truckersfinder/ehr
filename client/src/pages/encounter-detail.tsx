import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, CheckCircle, Thermometer, Heart as HeartIcon,
  Activity, Wind, Droplets, Weight,
} from "lucide-react";
import { MutedIconBox } from "@/components/muted-icon-box";
import { format } from "date-fns";
import type { Encounter, Patient, Vitals } from "@shared/schema";

export default function EncounterDetailPage() {
  const [, params] = useRoute("/encounters/:id");
  const [, navigate] = useLocation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const id = params?.id;

  const { data: encounter, isLoading } = useQuery<Encounter>({
    queryKey: ["/api/encounters", id],
    queryFn: async () => {
      const res = await fetch(`/api/encounters/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients", encounter?.patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${encounter!.patientId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!encounter?.patientId,
  });

  const { data: vitalsList = [] } = useQuery<Vitals[]>({
    queryKey: ["/api/vitals", id],
    queryFn: async () => {
      const res = await fetch(`/api/vitals/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const [soap, setSoap] = useState({
    subjective: "", objective: "", assessment: "", plan: "", icdCodes: "",
  });
  const [vitalsForm, setVitalsForm] = useState({
    temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "",
    heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "",
  });
  const [initialized, setInitialized] = useState(false);

  if (encounter && !initialized) {
    setSoap({
      subjective: encounter.subjective || "",
      objective: encounter.objective || "",
      assessment: encounter.assessment || "",
      plan: encounter.plan || "",
      icdCodes: encounter.icdCodes || "",
    });
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/encounters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", id] });
      toast({ title: "Notes saved", description: "Clinical notes have been updated." });
    },
    onError: () => toast({ title: "Error", description: "Failed to save notes", variant: "destructive" }),
  });

  const vitalsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          encounterId: id,
          patientId: encounter?.patientId,
          ...data,
          recordedBy: user?.id,
          bloodPressureSystolic: data.bloodPressureSystolic ? parseInt(data.bloodPressureSystolic) : null,
          bloodPressureDiastolic: data.bloodPressureDiastolic ? parseInt(data.bloodPressureDiastolic) : null,
          heartRate: data.heartRate ? parseInt(data.heartRate) : null,
          respiratoryRate: data.respiratoryRate ? parseInt(data.respiratoryRate) : null,
          oxygenSaturation: data.oxygenSaturation ? parseInt(data.oxygenSaturation) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vitals", id] });
      toast({ title: "Vitals recorded" });
      setVitalsForm({ temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "", heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "" });
    },
    onError: () => toast({ title: "Error", description: "Failed to record vitals", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/encounters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...soap, status: "completed" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters"] });
      toast({ title: "Encounter completed" });
      navigate("/encounters");
    },
    onError: () => toast({ title: "Error", description: "Failed to complete encounter", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-48 w-full" /></div>;
  }

  if (!encounter) {
    return <div className="p-6"><p className="text-muted-foreground">Encounter not found.</p></div>;
  }

  const latestVitals = vitalsList[0];
  const isEditable = encounter.status === "in_progress" || encounter.status === "scheduled";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="encounter-detail-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => navigate("/encounters")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {patient ? `${patient.firstName} ${patient.lastName}` : "Loading..."}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">{encounter.type}</Badge>
              <Badge variant="secondary" className="text-[10px]">{encounter.status.replace("_", " ")}</Badge>
              <span className="text-xs text-muted-foreground">
                {encounter.visitDate ? format(new Date(encounter.visitDate), "MMM d, yyyy HH:mm") : ""}
              </span>
            </div>
          </div>
        </div>
        {isEditable && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => updateMutation.mutate(soap)} disabled={updateMutation.isPending} data-testid="button-save-notes">
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Notes"}
            </Button>
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} data-testid="button-complete">
              <CheckCircle className="w-4 h-4 mr-2" />
              Complete
            </Button>
          </div>
        )}
      </div>

      {encounter.chiefComplaint && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">Chief Complaint</p>
            <p className="text-sm">{encounter.chiefComplaint}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="soap">
        <SidebarTabsNavLayout
          sidebar={
            <TabsList className={SIDEBAR_TABS_LIST_CLASS}>
              <TabsTrigger value="soap" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-soap">
                SOAP Notes
              </TabsTrigger>
              <TabsTrigger value="vitals" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-vitals">
                Vitals
              </TabsTrigger>
            </TabsList>
          }
        >
        <TabsContent value="soap" className="mt-0 space-y-4 focus-visible:outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><h4 className="text-sm font-medium">Subjective</h4></CardHeader>
              <CardContent>
                <Textarea
                  data-testid="input-subjective"
                  value={soap.subjective}
                  onChange={(e) => setSoap({ ...soap, subjective: e.target.value })}
                  placeholder="Patient's reported symptoms, history..."
                  className="resize-none min-h-[120px]"
                  disabled={!isEditable}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><h4 className="text-sm font-medium">Objective</h4></CardHeader>
              <CardContent>
                <Textarea
                  data-testid="input-objective"
                  value={soap.objective}
                  onChange={(e) => setSoap({ ...soap, objective: e.target.value })}
                  placeholder="Physical examination findings..."
                  className="resize-none min-h-[120px]"
                  disabled={!isEditable}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><h4 className="text-sm font-medium">Assessment</h4></CardHeader>
              <CardContent>
                <Textarea
                  data-testid="input-assessment"
                  value={soap.assessment}
                  onChange={(e) => setSoap({ ...soap, assessment: e.target.value })}
                  placeholder="Clinical diagnosis and reasoning..."
                  className="resize-none min-h-[120px]"
                  disabled={!isEditable}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><h4 className="text-sm font-medium">Plan</h4></CardHeader>
              <CardContent>
                <Textarea
                  data-testid="input-plan"
                  value={soap.plan}
                  onChange={(e) => setSoap({ ...soap, plan: e.target.value })}
                  placeholder="Treatment plan, orders, follow-up..."
                  className="resize-none min-h-[120px]"
                  disabled={!isEditable}
                />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-4">
              <Label className="text-sm">ICD-10 Codes</Label>
              <Input
                data-testid="input-icd-codes"
                value={soap.icdCodes}
                onChange={(e) => setSoap({ ...soap, icdCodes: e.target.value })}
                placeholder="e.g., G44.2, I10"
                className="mt-2"
                disabled={!isEditable}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vitals" className="mt-0 space-y-4 focus-visible:outline-none">
          {latestVitals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: Thermometer, label: "Temp", value: latestVitals.temperature ? `${latestVitals.temperature}°C` : "-" },
                { icon: HeartIcon, label: "BP", value: latestVitals.bloodPressureSystolic ? `${latestVitals.bloodPressureSystolic}/${latestVitals.bloodPressureDiastolic}` : "-" },
                { icon: Activity, label: "HR", value: latestVitals.heartRate ? `${latestVitals.heartRate} bpm` : "-" },
                { icon: Wind, label: "RR", value: latestVitals.respiratoryRate ? `${latestVitals.respiratoryRate}/min` : "-" },
                { icon: Droplets, label: "SpO2", value: latestVitals.oxygenSaturation ? `${latestVitals.oxygenSaturation}%` : "-" },
                { icon: Weight, label: "Weight", value: latestVitals.weight ? `${latestVitals.weight} kg` : "-" },
              ].map((v) => (
                <Card key={v.label}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <MutedIconBox icon={v.icon} />
                    <div>
                      <p className="text-xs text-muted-foreground">{v.label}</p>
                      <p className="font-semibold text-sm">{v.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {isEditable && (
            <Card>
              <CardHeader className="pb-2"><h4 className="text-sm font-medium">Record New Vitals</h4></CardHeader>
              <CardContent>
                <form onSubmit={(e) => { e.preventDefault(); vitalsMutation.mutate(vitalsForm); }} className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Temp (°C)</Label>
                      <Input type="number" step="0.1" value={vitalsForm.temperature} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">BP Systolic</Label>
                      <Input type="number" value={vitalsForm.bloodPressureSystolic} onChange={(e) => setVitalsForm({ ...vitalsForm, bloodPressureSystolic: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">BP Diastolic</Label>
                      <Input type="number" value={vitalsForm.bloodPressureDiastolic} onChange={(e) => setVitalsForm({ ...vitalsForm, bloodPressureDiastolic: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Heart Rate</Label>
                      <Input type="number" value={vitalsForm.heartRate} onChange={(e) => setVitalsForm({ ...vitalsForm, heartRate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Resp Rate</Label>
                      <Input type="number" value={vitalsForm.respiratoryRate} onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">SpO2 (%)</Label>
                      <Input type="number" value={vitalsForm.oxygenSaturation} onChange={(e) => setVitalsForm({ ...vitalsForm, oxygenSaturation: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Weight (kg)</Label>
                      <Input type="number" step="0.1" value={vitalsForm.weight} onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Height (cm)</Label>
                      <Input type="number" step="0.1" value={vitalsForm.height} onChange={(e) => setVitalsForm({ ...vitalsForm, height: e.target.value })} />
                    </div>
                  </div>
                  <Button type="submit" disabled={vitalsMutation.isPending} data-testid="button-record-vitals">
                    {vitalsMutation.isPending ? "Recording..." : "Record Vitals"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        </SidebarTabsNavLayout>
      </Tabs>
    </div>
  );
}
