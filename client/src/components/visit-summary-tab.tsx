import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Printer, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type {
  Appointment,
  Encounter,
  EncounterVisitCharge,
  ImagingOrder,
  ImagingResult,
  LabOrder,
  Patient,
  PatientAllergy,
  PatientNote,
  Prescription,
  Vitals,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type VisitSummaryPayload = {
  encounter: Encounter;
  patient: Patient;
  appointment: Appointment | null;
  labOrders: LabOrder[];
  imagingOrders: ImagingOrder[];
  prescriptions: Prescription[];
  vitals: Vitals[];
  notes: PatientNote[];
  imagingResults: ImagingResult[];
  allergiesDocumentedThisVisit: PatientAllergy[];
  visitCharges?: EncounterVisitCharge[];
  billingCurrency?: string;
};

function visitChargeLineKindLabel(kind: string): string {
  if (kind === "visit_type") return "Visit";
  if (kind === "lab_order") return "Lab";
  if (kind === "imaging_order") return "Imaging";
  if (kind === "prescription") return "Medication";
  if (kind === "manual") return "Added";
  return kind;
}

type Props = {
  encounterId: string;
  authToken: string | null;
  prescriberNameById: Map<string, string>;
  /** Billing / front desk review: hide edits to patient instructions */
  readOnly?: boolean;
};

export function VisitSummaryTab({ encounterId, authToken, prescriberNameById, readOnly = false }: Props) {
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [instructions, setInstructions] = useState("");

  const { data, isLoading, error } = useQuery<VisitSummaryPayload>({
    queryKey: ["/api/encounters", encounterId, "visit-summary"],
    queryFn: async () => {
      const res = await fetch(`/api/encounters/${encounterId}/visit-summary`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load visit summary");
      }
      return res.json();
    },
    enabled: !!encounterId && !!authToken,
  });

  useEffect(() => {
    if (data?.encounter?.patientInstructions != null) {
      setInstructions(data.encounter.patientInstructions);
    } else {
      setInstructions("");
    }
  }, [data?.encounter?.patientInstructions, encounterId]);

  const saveInstructionsMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/encounters/${encounterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ patientInstructions: text || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId, "visit-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", encounterId] });
      toast({ title: "Patient instructions saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading visit summary…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-muted-foreground py-8">
        {(error as Error)?.message || "Visit summary is not available."}
      </p>
    );
  }

  const {
    encounter,
    patient,
    appointment,
    labOrders,
    imagingOrders,
    prescriptions,
    vitals,
    notes,
    imagingResults,
    allergiesDocumentedThisVisit = [],
    visitCharges = [],
    billingCurrency = "KES",
  } = data;

  const visitChargeTotal = visitCharges.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Visit Summary</h2>
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "View-only review of this visit. Patient instructions cannot be edited from this link."
              : "Read-only snapshot of this schedule visit. Edit patient instructions below."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handlePrint} className="gap-2" data-testid="visit-summary-print">
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div ref={printRef} className="visit-summary-print-root space-y-4 print:space-y-3 print:text-black">
        <div className="hidden print:block print:mb-4">
          <h1 className="text-xl font-bold">Visit Summary</h1>
          <p className="text-sm text-muted-foreground">
            {patient.firstName} {patient.lastName} · MRN {patient.mrn}
          </p>
          <p className="text-xs text-muted-foreground">
            Printed {format(new Date(), "MMM d, yyyy HH:mm")}
          </p>
        </div>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Patient demographics</h3>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Name:</span> {patient.firstName} {patient.lastName}
            </p>
            <p>
              <span className="text-muted-foreground">MRN:</span> {patient.mrn}
            </p>
            <p>
              <span className="text-muted-foreground">DOB:</span>{" "}
              {patient.dateOfBirth ? format(new Date(patient.dateOfBirth), "MMM d, yyyy") : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Gender:</span> {patient.gender ?? "—"}
            </p>
            {patient.phone && (
              <p>
                <span className="text-muted-foreground">Phone:</span> {patient.phone}
              </p>
            )}
            {patient.address && (
              <p>
                <span className="text-muted-foreground">Address:</span> {patient.address}
                {patient.city ? `, ${patient.city}` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Visit details</h3>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              <span className="text-muted-foreground">Visit date:</span>{" "}
              {encounter.visitDate ? format(new Date(encounter.visitDate), "MMM d, yyyy HH:mm") : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Type:</span> {encounter.type}
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span> {encounter.status?.replace("_", " ")}
            </p>
            {appointment && (
              <>
                <p>
                  <span className="text-muted-foreground">Scheduled:</span>{" "}
                  {appointment.scheduledDate ? format(new Date(appointment.scheduledDate), "MMM d, yyyy HH:mm") : "—"}
                </p>
                {appointment.reason && (
                  <p>
                    <span className="text-muted-foreground">Reason:</span> {appointment.reason}
                  </p>
                )}
              </>
            )}
            {encounter.chiefComplaint && (
              <p>
                <span className="text-muted-foreground">Chief complaint:</span> {encounter.chiefComplaint}
              </p>
            )}
            {(encounter.subjective || encounter.objective || encounter.assessment || encounter.plan) && (
              <div className="space-y-1 pt-2 border-t">
                {encounter.subjective && (
                  <p>
                    <span className="font-medium">Subjective:</span> {encounter.subjective}
                  </p>
                )}
                {encounter.objective && (
                  <p>
                    <span className="font-medium">Objective:</span> {encounter.objective}
                  </p>
                )}
                {encounter.assessment && (
                  <p>
                    <span className="font-medium">Assessment:</span> {encounter.assessment}
                  </p>
                )}
                {encounter.plan && (
                  <p>
                    <span className="font-medium">Plan:</span> {encounter.plan}
                  </p>
                )}
              </div>
            )}
            {encounter.icdCodes && (
              <p>
                <span className="text-muted-foreground">ICD codes:</span> {encounter.icdCodes}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border" data-testid="visit-summary-charges">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Visit charges</h3>
            <p className="text-xs text-muted-foreground font-normal">
              Internal orders and visit type from the facility price list. External lab/imaging orders are excluded.
            </p>
          </CardHeader>
          <CardContent className="text-sm">
            {visitCharges.length === 0 ? (
              <p className="text-muted-foreground">No charge lines for this encounter yet.</p>
            ) : (
              <div className="space-y-2">
                <ul className="space-y-1.5">
                  {visitCharges.map((row) => (
                    <li key={row.id} className="flex justify-between gap-3 text-sm border-b border-border/40 pb-1.5 last:border-0">
                      <span className="min-w-0">
                        <span className="text-xs text-muted-foreground mr-2">{visitChargeLineKindLabel(row.lineKind)}</span>
                        <span>{row.description}</span>
                        {row.quantity > 1 && (
                          <span className="text-muted-foreground text-xs"> × {row.quantity}</span>
                        )}
                        {(row as any).orderedByUserId ? (
                          <span className="text-muted-foreground text-xs">
                            {" "}
                            · By {prescriberNameById.get((row as any).orderedByUserId) ?? (row as any).orderedByUserId}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {billingCurrency} {Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between pt-2 border-t font-medium">
                  <span>Estimated total</span>
                  <span className="tabular-nums">
                    {billingCurrency}{" "}
                    {visitChargeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Vitals (this visit)</h3>
          </CardHeader>
          <CardContent className="text-sm">
            {vitals.length === 0 ? (
              <p className="text-muted-foreground">No vitals recorded for this encounter.</p>
            ) : (
              <ul className="space-y-2">
                {vitals.map((v) => (
                  <li key={v.id} className="border-b border-border/50 pb-2 last:border-0">
                    <p className="text-xs text-muted-foreground mb-1">
                      {v.recordedAt ? format(new Date(v.recordedAt), "MMM d, yyyy HH:mm") : "—"}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {v.temperature != null && <span>Temp {v.temperature} °C</span>}
                      {(v.bloodPressureSystolic != null || v.bloodPressureDiastolic != null) && (
                        <span>
                          BP {v.bloodPressureSystolic ?? "—"}/{v.bloodPressureDiastolic ?? "—"}
                        </span>
                      )}
                      {v.heartRate != null && <span>HR {v.heartRate}</span>}
                      {v.respiratoryRate != null && <span>RR {v.respiratoryRate}</span>}
                      {v.oxygenSaturation != null && <span>SpO₂ {v.oxygenSaturation}%</span>}
                      {v.weight != null && <span>Weight {v.weight} kg</span>}
                      {v.height != null && <span>Height {v.height} cm</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Allergies documented this visit</h3>
          </CardHeader>
          <CardContent className="text-sm">
            {allergiesDocumentedThisVisit.length === 0 ? (
              <p className="text-muted-foreground">No new allergies recorded since this visit started.</p>
            ) : (
              <ul className="space-y-2">
                {allergiesDocumentedThisVisit.map((a) => (
                  <li key={a.id} className="border-b border-border/50 pb-2 last:border-0">
                    <span className={a.severity === "HIGH" ? "font-medium text-destructive" : "font-medium"}>{a.allergen}</span>
                    <span className="text-muted-foreground"> · {a.severity}</span>
                    {a.reactionType && <span className="text-muted-foreground"> · {a.reactionType}</span>}
                    {a.createdAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(a.createdAt), "MMM d, yyyy HH:mm")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Orders (this visit)</h3>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <div>
              <p className="font-medium text-xs uppercase text-muted-foreground mb-1">Laboratory</p>
              {labOrders.length === 0 ? (
                <p className="text-muted-foreground">None</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {labOrders.map((o) => (
                    <li key={o.id}>
                      {o.testName} {o.testCode ? `(${o.testCode})` : ""} — {o.status}
                      {o.priority && o.priority !== "routine" ? ` · ${o.priority}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Separator />
            <div>
              <p className="font-medium text-xs uppercase text-muted-foreground mb-1">Imaging orders</p>
              {imagingOrders.length === 0 ? (
                <p className="text-muted-foreground">None</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {imagingOrders.map((o) => (
                    <li key={o.id}>
                      {o.title} — {o.modality} — {o.status}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {imagingResults.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="font-medium text-xs uppercase text-muted-foreground mb-1">Imaging uploaded</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {imagingResults.map((img) => (
                      <li key={img.id}>
                        {img.title} ({img.modality})
                        {img.description ? ` — ${img.description}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Medications (this visit)</h3>
          </CardHeader>
          <CardContent className="text-sm">
            {prescriptions.length === 0 ? (
              <p className="text-muted-foreground">No prescriptions linked to this visit.</p>
            ) : (
              <ul className="space-y-2">
                {prescriptions.map((rx) => (
                  <li key={rx.id} className="border-b border-border/50 pb-2 last:border-0">
                    <span className="font-medium">{rx.medicationName}</span> {rx.dosage} · {rx.frequency}
                    {rx.duration ? ` · ${rx.duration}` : ""}
                    <span className="text-muted-foreground"> — {rx.status}</span>
                    {rx.instructions && <p className="text-xs mt-0.5">{rx.instructions}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Clinician & nursing notes (this visit)</h3>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            {notes.length === 0 ? (
              <p className="text-muted-foreground">No notes for this visit window.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="border rounded-md p-3 bg-muted/20 print:bg-white">
                  <p className="text-xs text-muted-foreground mb-1">
                    {n.noteKind} · {n.authorRole} ·{" "}
                    {n.signedAt
                      ? format(new Date(n.signedAt), "MMM d, yyyy HH:mm")
                      : n.createdAt
                        ? format(new Date(n.createdAt), "MMM d, yyyy HH:mm")
                        : "—"}
                    {n.authorId && ` · ${prescriberNameById.get(n.authorId) ?? n.authorId}`}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="print:shadow-none print:border border-primary/30">
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold">Patient instructions</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="print:hidden space-y-3">
              {readOnly ? (
                <div className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3 min-h-[120px]">
                  {instructions.trim() || "—"}
                </div>
              ) : (
                <>
                  <Label
                    htmlFor="patient-instructions"
                    className="text-sm font-semibold tracking-tight text-foreground block mb-1"
                  >
                    Instructions for the patient
                  </Label>
                  <Textarea
                    id="patient-instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Discharge instructions, follow-up, medications to take at home…"
                    className="min-h-[120px] resize-y"
                    data-testid="visit-summary-patient-instructions"
                  />
                  <Button
                    type="button"
                    onClick={() => saveInstructionsMutation.mutate(instructions)}
                    disabled={saveInstructionsMutation.isPending}
                    data-testid="visit-summary-save-instructions"
                  >
                    {saveInstructionsMutation.isPending ? "Saving…" : "Save instructions"}
                  </Button>
                </>
              )}
            </div>
            <div className="hidden print:block text-sm whitespace-pre-wrap border-t print:border-0 pt-3 print:pt-0">
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Patient instructions</p>
              {instructions.trim() || "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .visit-summary-print-root,
          .visit-summary-print-root * { visibility: visible; }
          .visit-summary-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            max-width: 100%;
            padding: 0.5rem 1rem 2rem;
          }
        }
      `}</style>
    </div>
  );
}
