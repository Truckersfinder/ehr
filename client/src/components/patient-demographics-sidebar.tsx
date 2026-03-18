import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, User, Phone, Mail, MapPin, Heart, AlertTriangle,
  Stethoscope, CalendarDays, Activity,
} from "lucide-react";
import { format } from "date-fns";
import type { Patient, User as UserType, Vitals, LabOrder, PatientAllergy } from "@shared/schema";

function getAge(dob: string) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

export function PatientDemographicsSidebar({ patientId, onRequestLeave }: { patientId: string; onRequestLeave?: (path: string) => void }) {
  const [, navigate] = useLocation();
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("ehr_token") : null;

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients", patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });
  const userNameById = new Map(users.map((u) => [u.id, u.fullName || u.username || "Unknown user"]));

  const { data: primaryProvider } = useQuery<Omit<UserType, "password"> | null>({
    queryKey: ["/api/users", "provider", patient?.primaryProviderId],
    queryFn: async () => {
      if (!patient?.primaryProviderId) return null;
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const users: Omit<UserType, "password">[] = await res.json();
      return users.find((u) => u.id === patient.primaryProviderId) ?? null;
    },
    enabled: !!patient && !!patient.primaryProviderId && !!token,
  });

  const { data: latestVitals } = useQuery<Vitals | null>({
    queryKey: ["/api/patients", patientId, "latest-vitals"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/latest-vitals`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const data = await res.json();
      return data ?? null;
    },
    enabled: !!patientId && !!token,
  });

  const { data: criticalLabs = [] } = useQuery<LabOrder[]>({
    queryKey: ["/api/patients", patientId, "critical-labs"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/critical-labs`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const { data: patientAllergies = [] } = useQuery<PatientAllergy[]>({
    queryKey: ["/api/patients", patientId, "allergies"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/allergies`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!patientId && !!token,
  });

  const highSeverityAllergies = patientAllergies.filter((a) => a.severity === "HIGH");
  const hasLegacyAllergies = patient?.allergies && typeof patient.allergies === "string" && patient.allergies.trim().length > 0;
  const showInRed = highSeverityAllergies.length > 0 ? highSeverityAllergies.map((a) => a.allergen).join(", ") : hasLegacyAllergies ? patient!.allergies!.trim() : null;

  if (isLoading || !patient) {
    return (
      <div className="w-[var(--sidebar-width)] flex-shrink-0 border-r bg-muted/30 flex flex-col overflow-y-auto">
        <div className="p-4 space-y-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-[var(--sidebar-width)] flex-shrink-0 border-r bg-muted/30 flex flex-col overflow-y-auto"
      data-testid="patient-demographics-sidebar"
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => (onRequestLeave ? onRequestLeave("/schedule") : navigate("/schedule"))} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{patient.firstName} {patient.lastName}</h2>
            <p className="text-xs text-muted-foreground">{patient.mrn}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Demographics</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).toLowerCase() : ""} · {getAge(patient.dateOfBirth)} years</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{format(new Date(patient.dateOfBirth), "MMM d, yyyy")}</span>
            </div>
            {patient.nationalId && (
              <p className="text-muted-foreground">ID: {patient.nationalId}</p>
            )}
            {patient.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{patient.phone}</span>
              </div>
            )}
            {patient.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{patient.email}</span>
              </div>
            )}
            {patient.address && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{patient.address}{patient.city ? `, ${patient.city}` : ""}</span>
              </div>
            )}
            {patient.bloodGroup && (
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-destructive shrink-0" />
                <span>Blood: {patient.bloodGroup}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Allergies</h3>
          <div className="space-y-1.5 text-sm">
            {showInRed ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <span className="text-destructive">{showInRed}</span>
              </div>
            ) : patientAllergies.length > 0 ? (
              <ul className="space-y-1">
                {patientAllergies.map((a) => (
                  <li key={a.id} className={a.severity === "HIGH" ? "text-destructive font-medium" : "text-muted-foreground"}>
                    <span>{a.allergen} {a.severity && <span className="text-muted-foreground">({a.severity})</span>}</span>
                    <span className="block text-xs text-muted-foreground font-normal">
                      Documented {a.createdAt ? format(new Date(a.createdAt), "MMM d, yyyy · HH:mm") : "—"} · By {a.addedBy ? (userNameById.get(a.addedBy) ?? a.addedBy) : "Unknown user"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : hasLegacyAllergies ? (
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">{patient!.allergies}</p>
            ) : (
              <p className="text-muted-foreground text-xs">No known allergies</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Vitals</h3>
          <div className="space-y-1.5 text-sm">
            {latestVitals ? (
              <>
                <p className="text-xs text-muted-foreground mb-1.5">Last recorded {latestVitals.recordedAt ? format(new Date(latestVitals.recordedAt), "MMM d, yyyy · HH:mm") : ""}</p>
                {latestVitals.height != null && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Height: {latestVitals.height} cm</span>
                  </div>
                )}
                {latestVitals.weight != null && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Weight: {latestVitals.weight} kg</span>
                  </div>
                )}
                {(latestVitals.bloodPressureSystolic != null || latestVitals.bloodPressureDiastolic != null) && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>BP: {latestVitals.bloodPressureSystolic ?? "—"} / {latestVitals.bloodPressureDiastolic ?? "—"} mmHg</span>
                  </div>
                )}
                {latestVitals.temperature != null && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Temp: {latestVitals.temperature} °C</span>
                  </div>
                )}
                {latestVitals.heartRate != null && (
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>HR: {latestVitals.heartRate} bpm</span>
                  </div>
                )}
                {!latestVitals.height && !latestVitals.weight && latestVitals.bloodPressureSystolic == null && latestVitals.bloodPressureDiastolic == null && latestVitals.temperature == null && latestVitals.heartRate == null && (
                  <p className="text-muted-foreground text-xs">No vitals recorded</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-xs">No vitals recorded</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Relevant labs</h3>
          <p className="text-xs text-muted-foreground mb-2">Critical results since last appointment</p>
          {criticalLabs.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {criticalLabs.map((lab) => (
                <li key={lab.id} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{lab.testName}</span>
                    {lab.resultValue && <span className="text-muted-foreground"> — {lab.resultValue}</span>}
                    {lab.completedAt && (
                      <p className="text-xs text-muted-foreground">{format(new Date(lab.completedAt), "MMM d, yyyy")}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Primary provider</h3>
          {primaryProvider ? (
            <div className="flex items-center gap-2 p-2 rounded-md bg-background border text-sm">
              <Stethoscope className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">{primaryProvider.fullName}</p>
                <p className="text-xs text-muted-foreground capitalize">{primaryProvider.role}</p>
                {primaryProvider.email && <p className="text-xs text-muted-foreground truncate">{primaryProvider.email}</p>}
                {primaryProvider.phone && <p className="text-xs text-muted-foreground">{primaryProvider.phone}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not assigned at registration</p>
          )}
        </div>
      </div>
    </div>
  );
}
