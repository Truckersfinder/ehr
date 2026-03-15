import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Search, Plus, Users, Phone, Mail, MapPin, Heart, AlertTriangle, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import type { Patient, User as UserType } from "@shared/schema";

export default function PatientsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const token = localStorage.getItem("ehr_token");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", dateOfBirth: "", gender: "male" as const,
    nationalId: "", phone: "", email: "", address: "", city: "",
    country: "KE", bloodGroup: "", allergies: "",
    nextOfKinName: "", nextOfKinPhone: "", nextOfKinRelation: "",
    primaryProviderId: "",
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const clinicians = users.filter((u) => u.role === "clinician");

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients", search ? `?search=${search}` : ""],
    queryFn: async () => {
      const url = search ? `/api/patients?search=${encodeURIComponent(search)}` : "/api/patients";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const mrn = `MRN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
        ...data,
        mrn,
        isActive: true,
        primaryProviderId: data.primaryProviderId || undefined,
      }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Patient registered", description: "New patient record has been created." });
      setOpen(false);
      setFormData({ firstName: "", lastName: "", dateOfBirth: "", gender: "male", nationalId: "", phone: "", email: "", address: "", city: "", country: "KE", bloodGroup: "", allergies: "", nextOfKinName: "", nextOfKinPhone: "", nextOfKinRelation: "", primaryProviderId: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const getAge = (dob: string) => {
    const d = new Date(dob);
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="patients-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients</h1>
          <p className="text-muted-foreground text-sm mt-1">{patients.length} registered patients</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-register-patient">
              <Plus className="w-4 h-4 mr-2" />
              Register Patient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Register New Patient</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input data-testid="input-first-name" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input data-testid="input-last-name" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date of Birth *</Label>
                  <Input data-testid="input-dob" type="date" value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Gender *</Label>
                  <Select value={formData.gender} onValueChange={(v: any) => setFormData({ ...formData, gender: v })}>
                    <SelectTrigger data-testid="select-gender"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>National ID</Label>
                  <Input data-testid="input-national-id" value={formData.nationalId} onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Blood Group</Label>
                  <Select value={formData.bloodGroup} onValueChange={(v) => setFormData({ ...formData, bloodGroup: v })}>
                    <SelectTrigger data-testid="select-blood-group"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input data-testid="input-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input data-testid="input-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Allergies</Label>
                <Textarea data-testid="input-allergies" value={formData.allergies} onChange={(e) => setFormData({ ...formData, allergies: e.target.value })} placeholder="List known allergies..." className="resize-none" />
              </div>
              <div className="space-y-2">
                <Label>Primary provider</Label>
                <Select value={formData.primaryProviderId} onValueChange={(v) => setFormData({ ...formData, primaryProviderId: v })}>
                  <SelectTrigger data-testid="select-primary-provider"><SelectValue placeholder="Select clinician" /></SelectTrigger>
                  <SelectContent>
                    {clinicians.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Assigned at registration; shown on patient view.</p>
              </div>
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Next of Kin</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={formData.nextOfKinName} onChange={(e) => setFormData({ ...formData, nextOfKinName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={formData.nextOfKinPhone} onChange={(e) => setFormData({ ...formData, nextOfKinPhone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Relation</Label>
                    <Input value={formData.nextOfKinRelation} onChange={(e) => setFormData({ ...formData, nextOfKinRelation: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="button-submit-patient" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Registering..." : "Register Patient"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-patients"
          placeholder="Search by name, MRN, ID, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-32" /></CardContent></Card>
          ))}
        </div>
      ) : patients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No patients found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {search ? "Try a different search term" : "Register your first patient to get started"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover-elevate"
              onClick={() => navigate(`/patients/${patient.id}`)}
              data-testid={`card-patient-${patient.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold">{patient.firstName} {patient.lastName}</p>
                    <p className="text-xs text-muted-foreground">{patient.mrn}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase() : ""}
                  </Badge>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3 h-3 flex-shrink-0" />
                    <span>{format(new Date(patient.dateOfBirth), "MMM d, yyyy")} ({getAge(patient.dateOfBirth)} yrs)</span>
                  </div>
                  {patient.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 flex-shrink-0" />
                      <span>{patient.phone}</span>
                    </div>
                  )}
                  {patient.bloodGroup && (
                    <div className="flex items-center gap-2">
                      <Heart className="w-3 h-3 flex-shrink-0" />
                      <span>Blood Group: {patient.bloodGroup}</span>
                    </div>
                  )}
                  {patient.allergies && (
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3 h-3 text-destructive flex-shrink-0" />
                      <span className="text-destructive truncate">{patient.allergies}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

