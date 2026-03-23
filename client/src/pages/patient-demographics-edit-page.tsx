import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { PatientDemographicsForm } from "@/components/patient-demographics-form";
import { PatientChartReviewNavLinks } from "@/components/patient-chart-review-nav-links";
import type { Patient } from "@shared/schema";
import { normalizePatientRow } from "@/lib/patient-photo";

/**
 * Full-page patient demographics editor (Review → Demographics). Not a modal.
 */
export default function PatientDemographicsEditPage() {
  const [, params] = useRoute("/patients/:id/demographics");
  const patientId = params?.id;
  const { token } = useAuth();

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients", patientId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      return normalizePatientRow(await res.json());
    },
    enabled: !!patientId && !!token,
  });

  if (!patientId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Invalid patient.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-1 overflow-hidden" data-testid="patient-demographics-edit-page">
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        {/* Match patient-detail.tsx: Review nav + main column share one row with no extra outer margins */}
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <nav
            className="w-52 flex-shrink-0 border border-border rounded-lg bg-muted/30 flex flex-col overflow-y-auto py-4"
            aria-label="Review"
          >
            <div className="px-3 space-y-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Review</p>
                <PatientChartReviewNavLinks patientId={patientId} active="demographics" />
              </div>
            </div>
          </nav>

          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <Button variant="ghost" size="sm" asChild className="shrink-0 -ml-2">
                    <Link href={`/patients/${patientId}?tab=overview`}>
                      <a className="inline-flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" />
                        Back to chart
                      </a>
                    </Link>
                  </Button>
                </div>
                <div className="space-y-1 mb-8">
                  <h1 className="text-2xl font-bold tracking-tight">Demographics</h1>
                  <p className="text-sm text-muted-foreground">
                    Edit patient information. MRN is assigned by the system and cannot be changed here.
                  </p>
                  {patient && (
                    <p className="text-xs text-muted-foreground font-mono">
                      MRN {patient.mrn}
                    </p>
                  )}
                </div>

                {isLoading || !patient ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full max-w-md" />
                    <Skeleton className="h-10 w-full max-w-md" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : (
                  <PatientDemographicsForm patientId={patientId} patient={patient} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
