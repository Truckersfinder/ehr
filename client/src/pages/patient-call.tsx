import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PatientSearchCombobox } from "@/components/patient-search-combobox";
import type { Patient } from "@shared/schema";

export default function PatientCallPage() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  return (
    <div className="p-4 md:p-6 w-full max-w-6xl mx-auto space-y-4" data-testid="patient-call-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Patient Call</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search by patient name or MRN, then open the patient workspace to document calls in Review.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <p className="font-medium">Find patient</p>
          <PatientSearchCombobox
            token={token ?? null}
            value={selectedPatient}
            onChange={(p) => {
              setSelectedPatient(p);
              if (!p) return;
              // Reuse non-visit chart entry so the workspace opens in Review-only mode.
              navigate(`/patients/${p.id}?fromSearch=1`);
            }}
            triggerTestId="patient-call-patient-search"
          />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select a patient to open their chart workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

