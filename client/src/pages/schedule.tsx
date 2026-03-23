import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { appointmentStatusBadgeClass, formatAppointmentStatusLabel } from "@/lib/appointment-status";
import { format, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Appointment, Patient, User as UserType } from "@shared/schema";

export default function SchedulePage() {
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const today = new Date();

  useEffect(() => {
    if (user?.role === "reception") {
      navigate("/appointments");
    }
  }, [user?.role, navigate]);

  const [viewingDate, setViewingDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const viewingDayStart = startOfDay(viewingDate).toISOString();
  const viewingDayEnd = endOfDay(viewingDate).toISOString();

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments", "day", viewingDayStart, viewingDayEnd],
    queryFn: async () => {
      const res = await fetch(
        `/api/appointments?start=${encodeURIComponent(viewingDayStart)}&end=${encodeURIComponent(viewingDayEnd)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch appointments");
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

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const sortedAppointments = [...appointments].sort(
    (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  );

  const isToday =
    viewingDate.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  if (user?.role === "reception") {
    return (
      <div className="p-6 text-muted-foreground text-sm" data-testid="schedule-redirect-reception">
        Redirecting to Appointments…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="schedule-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setViewingDate((d) => subDays(d, 1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="font-medium min-w-[220px] text-center text-sm h-auto p-0 text-primary hover:text-primary hover:underline"
                aria-label="Open date picker"
              >
                {format(viewingDate, "EEEE, MMM d, yyyy")}
                {isToday && <span className="text-muted-foreground font-normal ml-1">(today)</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={viewingDate}
                onSelect={(date) => {
                  if (!date) return;
                  setViewingDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
                  setDatePickerOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setViewingDate((d) => addDays(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <span className="text-muted-foreground text-sm">{sortedAppointments.length} appointments</span>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[6rem]">Time</TableHead>
                  <TableHead>Patient name</TableHead>
                  <TableHead className="w-[7rem]">MRN</TableHead>
                  <TableHead>Clinician</TableHead>
                  <TableHead className="w-[5rem]">Duration</TableHead>
                  <TableHead className="w-[6rem]">Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="max-w-[12rem]">APT Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAppointments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No appointments on this day</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedAppointments.map((apt) => {
                    const patient = patientMap.get(apt.patientId);
                    const clinician = userMap.get(apt.clinicianId);
                    return (
                      <TableRow key={apt.id} data-testid={`schedule-row-${apt.id}`}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(new Date(apt.scheduledDate), "HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/patients/${apt.patientId}?fromSchedule=1&appointmentId=${encodeURIComponent(apt.id)}`}
                          >
                            <a className="text-primary hover:underline font-medium">
                              {patient ? `${patient.firstName} ${patient.lastName}` : "—"}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {patient?.mrn ?? "—"}
                        </TableCell>
                        <TableCell>{clinician?.fullName ?? "—"}</TableCell>
                        <TableCell>{apt.duration ?? 30} min</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] capitalize ${appointmentStatusBadgeClass(apt.status)}`}
                          >
                            {formatAppointmentStatusLabel(apt.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate" title={apt.reason ?? ""}>
                          {apt.reason ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-muted-foreground" title={apt.notes ?? ""}>
                          {apt.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
