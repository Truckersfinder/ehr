import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, User, Phone, Mail, MapPin, Heart, AlertTriangle,
  Stethoscope, FlaskConical, Pill, Receipt, CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import type { Patient, Encounter, LabOrder, Prescription, Invoice } from "@shared/schema";

export default function PatientDetailPage() {
  const [, params] = useRoute("/patients/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  const token = localStorage.getItem("ehr_token");

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients", id],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: encounters = [] } = useQuery<Encounter[]>({
    queryKey: ["/api/encounters", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/encounters?patientId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: ["/api/lab-orders", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/lab-orders?patientId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: ["/api/prescriptions", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/prescriptions?patientId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices", `?patientId=${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/invoices?patientId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Patient not found.</p>
      </div>
    );
  }

  const getAge = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));

  const statusColors: Record<string, string> = {
    completed: "bg-chart-3/10 text-chart-3",
    in_progress: "bg-chart-4/10 text-chart-4",
    scheduled: "bg-accent text-accent-foreground",
    cancelled: "bg-destructive/10 text-destructive",
    active: "bg-chart-3/10 text-chart-3",
    dispensed: "bg-primary/10 text-primary",
    ordered: "bg-chart-4/10 text-chart-4",
    processing: "bg-chart-2/10 text-chart-2",
    collected: "bg-chart-5/10 text-chart-5",
    paid: "bg-chart-3/10 text-chart-3",
    pending: "bg-chart-4/10 text-chart-4",
    partial: "bg-chart-5/10 text-chart-5",
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="patient-detail-page">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => navigate("/patients")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{patient.firstName} {patient.lastName}</h1>
          <p className="text-sm text-muted-foreground">{patient.mrn}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{patient.gender} - {getAge(patient.dateOfBirth)} years</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{format(new Date(patient.dateOfBirth), "MMM d, yyyy")}</span>
            </div>
            {patient.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{patient.phone}</span>
              </div>
            )}
            {patient.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{patient.email}</span>
              </div>
            )}
            {patient.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{patient.address}{patient.city ? `, ${patient.city}` : ""}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h4 className="text-sm font-medium">Medical Info</h4>
            {patient.bloodGroup && (
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-destructive" />
                <span className="text-sm">Blood Group: {patient.bloodGroup}</span>
              </div>
            )}
            {patient.allergies ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <span className="text-sm text-destructive">{patient.allergies}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No known allergies</p>
            )}
            {patient.nationalId && (
              <p className="text-sm text-muted-foreground">National ID: {patient.nationalId}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h4 className="text-sm font-medium">Next of Kin</h4>
            {patient.nextOfKinName ? (
              <>
                <p className="text-sm">{patient.nextOfKinName}</p>
                <p className="text-sm text-muted-foreground">{patient.nextOfKinRelation}</p>
                {patient.nextOfKinPhone && <p className="text-sm text-muted-foreground">{patient.nextOfKinPhone}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not recorded</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="encounters">
        <TabsList>
          <TabsTrigger value="encounters" data-testid="tab-encounters">
            <Stethoscope className="w-3.5 h-3.5 mr-1.5" /> Encounters ({encounters.length})
          </TabsTrigger>
          <TabsTrigger value="lab" data-testid="tab-lab">
            <FlaskConical className="w-3.5 h-3.5 mr-1.5" /> Lab ({labOrders.length})
          </TabsTrigger>
          <TabsTrigger value="prescriptions" data-testid="tab-prescriptions">
            <Pill className="w-3.5 h-3.5 mr-1.5" /> Rx ({prescriptions.length})
          </TabsTrigger>
          <TabsTrigger value="billing" data-testid="tab-billing">
            <Receipt className="w-3.5 h-3.5 mr-1.5" /> Billing ({invoices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="encounters" className="space-y-3 mt-4">
          {encounters.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No encounters recorded</CardContent></Card>
          ) : encounters.map((enc) => (
            <Card key={enc.id} className="cursor-pointer hover-elevate" onClick={() => navigate(`/encounters/${enc.id}`)} data-testid={`card-encounter-${enc.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium">{enc.chiefComplaint || "Clinical encounter"}</p>
                    <p className="text-xs text-muted-foreground">
                      {enc.visitDate ? format(new Date(enc.visitDate), "MMM d, yyyy HH:mm") : ""} - {enc.type}
                    </p>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[enc.status] || ""}`}>{enc.status.replace("_", " ")}</Badge>
                </div>
                {enc.assessment && <p className="text-sm text-muted-foreground line-clamp-2">{enc.assessment}</p>}
                {enc.icdCodes && <p className="text-xs text-muted-foreground mt-1">ICD-10: {enc.icdCodes}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="lab" className="space-y-3 mt-4">
          {labOrders.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No lab orders</CardContent></Card>
          ) : labOrders.map((order) => (
            <Card key={order.id} data-testid={`card-lab-${order.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium">{order.testName}</p>
                    <p className="text-xs text-muted-foreground">{order.testCode} - {order.priority}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.isCritical && <Badge variant="destructive" className="text-[10px]">Critical</Badge>}
                    <Badge variant="secondary" className={`text-[10px] ${statusColors[order.status] || ""}`}>{order.status}</Badge>
                  </div>
                </div>
                {order.result && <p className="text-sm mt-1">{order.result}</p>}
                {order.resultValue && <p className="text-xs text-muted-foreground">Values: {order.resultValue}</p>}
                {order.referenceRange && <p className="text-xs text-muted-foreground">Reference: {order.referenceRange}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="prescriptions" className="space-y-3 mt-4">
          {prescriptions.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No prescriptions</CardContent></Card>
          ) : prescriptions.map((rx) => (
            <Card key={rx.id} data-testid={`card-rx-${rx.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium">{rx.medicationName} {rx.dosage}</p>
                    <p className="text-xs text-muted-foreground">{rx.frequency} - {rx.duration}</p>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[rx.status] || ""}`}>{rx.status}</Badge>
                </div>
                {rx.instructions && <p className="text-sm text-muted-foreground">{rx.instructions}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="billing" className="space-y-3 mt-4">
          {invoices.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No invoices</CardContent></Card>
          ) : invoices.map((inv) => (
            <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium">Invoice</p>
                    <p className="text-xs text-muted-foreground">{inv.createdAt ? format(new Date(inv.createdAt), "MMM d, yyyy") : ""}</p>
                  </div>
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[inv.status] || ""}`}>{inv.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-muted-foreground">Total: KES {Number(inv.totalAmount).toLocaleString()}</span>
                  <span className="font-medium">Paid: KES {Number(inv.paidAmount || 0).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

