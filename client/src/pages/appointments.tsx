import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Plus, Calendar, Clock, User } from "lucide-react";
import { format } from "date-fns";
import type { Appointment, Patient, User as UserType } from "@shared/schema";

export default function AppointmentsPage() {
  const { toast } = useToast();
  const token = localStorage.getItem("ehr_token");
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientId: "", clinicianId: "", scheduledDate: "", scheduledTime: "09:00",
    duration: 30, reason: "", notes: "",
  });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: async () => {
      const res = await fetch("/api/appointments", { headers: { Authorization: `Bearer ${token}` } });
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

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const clinicians = users.filter((u) => u.role === "clinician");
  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const dateTime = new Date(`${data.scheduledDate}T${data.scheduledTime}`);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patientId: data.patientId,
          clinicianId: data.clinicianId,
          scheduledDate: dateTime.toISOString(),
          duration: data.duration,
          reason: data.reason,
          notes: data.notes,
          status: "scheduled",
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment scheduled" });
      setOpen(false);
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment updated" });
    },
  });

  const statusColors: Record<string, string> = {
    scheduled: "bg-accent text-accent-foreground",
    confirmed: "bg-primary/10 text-primary",
    checked_in: "bg-chart-4/10 text-chart-4",
    in_progress: "bg-chart-3/10 text-chart-3",
    completed: "bg-chart-3/10 text-chart-3",
    cancelled: "bg-destructive/10 text-destructive",
    no_show: "bg-muted text-muted-foreground",
  };

  const grouped = appointments.reduce<Record<string, Appointment[]>>((acc, apt) => {
    const dateKey = format(new Date(apt.scheduledDate), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(apt);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="appointments-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground text-sm mt-1">{appointments.length} total appointments</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-appointment">
              <Plus className="w-4 h-4 mr-2" /> Schedule Appointment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Patient *</Label>
                <Select value={formData.patientId} onValueChange={(v) => setFormData({ ...formData, patientId: v })}>
                  <SelectTrigger data-testid="select-appt-patient"><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName} {p.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Clinician *</Label>
                <Select value={formData.clinicianId} onValueChange={(v) => setFormData({ ...formData, clinicianId: v })}>
                  <SelectTrigger data-testid="select-appt-clinician"><SelectValue placeholder="Select clinician" /></SelectTrigger>
                  <SelectContent>
                    {clinicians.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input data-testid="input-appt-date" type="date" value={formData.scheduledDate} onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Time *</Label>
                  <Input data-testid="input-appt-time" type="time" value={formData.scheduledTime} onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Select value={String(formData.duration)} onValueChange={(v) => setFormData({ ...formData, duration: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea data-testid="input-appt-reason" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} className="resize-none" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="button-create-appointment" disabled={createMutation.isPending || !formData.patientId || !formData.clinicianId}>
                  {createMutation.isPending ? "Scheduling..." : "Schedule"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : sortedDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No appointments</p>
          </CardContent>
        </Card>
      ) : (
        sortedDates.map((dateKey) => {
          const dayAppts = grouped[dateKey].sort(
            (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
          );
          const isToday = dateKey === format(new Date(), "yyyy-MM-dd");
          return (
            <div key={dateKey} className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {format(new Date(dateKey), "EEEE, MMMM d, yyyy")}
                {isToday && <Badge variant="secondary" className="text-[10px]">Today</Badge>}
              </h3>
              {dayAppts.map((apt) => {
                const pt = patientMap.get(apt.patientId);
                const doc = userMap.get(apt.clinicianId);
                return (
                  <Card key={apt.id} data-testid={`card-appointment-${apt.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="text-center min-w-[55px]">
                            <p className="text-sm font-bold">{format(new Date(apt.scheduledDate), "HH:mm")}</p>
                            <p className="text-[10px] text-muted-foreground">{apt.duration}min</p>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {doc ? `Dr. ${doc.fullName}` : ""} - {apt.reason || "General visit"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={`text-[10px] ${statusColors[apt.status] || ""}`}>
                            {apt.status.replace("_", " ")}
                          </Badge>
                          {apt.status === "scheduled" && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate({ id: apt.id, status: "checked_in" })}>Check In</Button>
                              <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate({ id: apt.id, status: "cancelled" })}>Cancel</Button>
                            </>
                          )}
                          {apt.status === "checked_in" && (
                            <Button size="sm" onClick={() => statusMutation.mutate({ id: apt.id, status: "completed" })}>Complete</Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
