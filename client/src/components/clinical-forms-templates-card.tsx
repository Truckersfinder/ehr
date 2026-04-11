import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPostJson } from "@/lib/api-client";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import type { ClinicalFormTemplateKind } from "@shared/schema";

export type ClinicalFormTemplateListItem = {
  id: string;
  title: string;
  description: string | null;
  fieldCount: number;
  kind: ClinicalFormTemplateKind;
  updatedAt: string | null;
};

type Props = {
  /** Shorter copy when embedded in the patient chart tab. */
  variant?: "standalone-page" | "patient-chart";
  /** Required for chart variant: enables Complete / Sign + QR flows. */
  patientId?: string;
};

function TemplatesTable({
  rows,
  patientId,
  onStart,
}: {
  rows: ClinicalFormTemplateListItem[];
  patientId?: string;
  onStart: (row: ClinicalFormTemplateListItem) => void;
}) {
  const primary = (kind: ClinicalFormTemplateKind) => (kind === "consent" ? "Sign consent" : "Complete form");

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Template</TableHead>
            <TableHead className="w-[8rem] tabular-nums">Fields</TableHead>
            <TableHead className="w-[12rem] whitespace-nowrap">Last updated</TableHead>
            {patientId ? (
              <TableHead className="w-[10rem] text-right whitespace-nowrap">Action</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="max-w-[min(28rem,55vw)]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate" title={t.title}>
                    {t.title}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t.kind === "consent" ? "Consent" : "Form"}
                  </Badge>
                </div>
                {t.description ? (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{t.fieldCount}</TableCell>
              <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                {t.updatedAt ? format(new Date(t.updatedAt), "MMM d, yyyy") : "—"}
              </TableCell>
              {patientId ? (
                <TableCell className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => onStart(t)} data-testid={`button-form-start-${t.id}`}>
                    {primary(t.kind)}
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type ChartPickerSectionProps = {
  heading: string;
  /** Label for the dropdown (e.g. "Select Form" / "Select Consent"). */
  selectLabel: string;
  selectTestId: string;
  buttonTestId: string;
  rows: ClinicalFormTemplateListItem[];
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  actionLabel: string;
  onAction: () => void;
};

function ChartPickerSection({
  heading,
  selectLabel,
  selectTestId,
  buttonTestId,
  rows,
  selectedId,
  onSelectedIdChange,
  actionLabel,
  onAction,
}: ChartPickerSectionProps) {
  const selected = rows.find((r) => r.id === selectedId);

  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      <div className="space-y-2 min-w-0 max-w-xl">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={selectTestId}>
          {selectLabel}
        </label>
        <Select value={selectedId || undefined} onValueChange={onSelectedIdChange}>
          <SelectTrigger id={selectTestId} className="w-full" data-testid={selectTestId}>
            <SelectValue placeholder={rows.length === 0 ? "None available" : "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {rows.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="truncate">{t.title}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected?.description ? (
        <p className="text-xs text-muted-foreground line-clamp-2">{selected.description}</p>
      ) : null}
      {selected ? (
        <p className="text-xs text-muted-foreground">
          {selected.fieldCount} field{selected.fieldCount === 1 ? "" : "s"}
          {selected.updatedAt ? ` · Updated ${format(new Date(selected.updatedAt), "MMM d, yyyy")}` : ""}
        </p>
      ) : null}
      <Button type="button" disabled={!selectedId} onClick={onAction} data-testid={buttonTestId}>
        {actionLabel}
      </Button>
    </section>
  );
}

export function ClinicalFormsTemplatesCard({ variant = "standalone-page", patientId }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [modeDialogRow, setModeDialogRow] = useState<ClinicalFormTemplateListItem | null>(null);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [selectedConsentId, setSelectedConsentId] = useState("");
  const [qrPayload, setQrPayload] = useState<{
    fillUrl: string;
    expiresAt: string;
    title: string;
    kind: ClinicalFormTemplateKind;
  } | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/clinical-form-templates"],
    queryFn: () => apiGetJson<ClinicalFormTemplateListItem[]>("/api/clinical-form-templates", token),
    enabled: !!token,
  });

  const qrMutation = useMutation({
    mutationFn: async (row: ClinicalFormTemplateListItem) => {
      const data = await apiPostJson<{ fillUrl: string; expiresAt: string }, Record<string, never>>(
        `/api/patients/${encodeURIComponent(patientId!)}/clinical-forms/${encodeURIComponent(row.id)}/qr-session`,
        {},
        token,
      );
      return { ...data, row };
    },
    onSuccess: (data) => {
      setModeDialogRow(null);
      setQrPayload({
        fillUrl: data.fillUrl,
        expiresAt: data.expiresAt,
        title: data.row.title,
        kind: data.row.kind,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not create QR session", description: e.message, variant: "destructive" });
    },
  });

  const description =
    variant === "patient-chart"
      ? "Start a form or consent for this patient. Staff-assisted opens on this device with patient details filled in; QR lets the patient complete on their phone."
      : "Templates available for reference; there is no public patient link.";

  const allForms = useMemo(() => templates.filter((t) => t.kind === "form"), [templates]);
  const allConsents = useMemo(() => templates.filter((t) => t.kind === "consent"), [templates]);

  const chartMode = variant === "patient-chart" && !!patientId;

  const openModeDialog = (row: ClinicalFormTemplateListItem) => {
    if (!chartMode || !patientId) return;
    // Consents are clinician-initiated; patient signature (QR) happens later from the pending list.
    if (row.kind === "consent") {
      setLocation(`/patients/${patientId}/clinical-forms/${row.id}/fill`);
      return;
    }
    setModeDialogRow(row);
  };

  const goStaffAssisted = () => {
    if (!modeDialogRow || !patientId) return;
    setLocation(`/patients/${patientId}/clinical-forms/${modeDialogRow.id}/fill`);
    setModeDialogRow(null);
  };

  const goQr = () => {
    if (!modeDialogRow || !patientId) return;
    qrMutation.mutate(modeDialogRow);
  };

  return (
    <>
      <Card data-testid="clinical-forms-templates-card">
        <CardHeader className={variant === "patient-chart" ? "pb-3" : undefined}>
          <CardTitle className={variant === "patient-chart" ? "text-base" : undefined}>
            <SectionTitleWithHint hint={description}>Published forms &amp; consent</SectionTitleWithHint>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              title="No forms & consent templates yet"
              description="When your Systems administrator publishes templates, they will appear here."
            />
          ) : chartMode ? (
            <div className="space-y-6">
              {allForms.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border bg-muted/20 p-4">No active form templates yet.</p>
              ) : (
                <ChartPickerSection
                  heading="Forms"
                  selectLabel="Select Form"
                  selectTestId="select-chart-form-template"
                  buttonTestId="button-chart-complete-form"
                  rows={allForms}
                  selectedId={selectedFormId}
                  onSelectedIdChange={setSelectedFormId}
                  actionLabel="Complete form"
                  onAction={() => {
                    const row = allForms.find((t) => t.id === selectedFormId);
                    if (row) openModeDialog(row);
                  }}
                />
              )}
              {allConsents.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border bg-muted/20 p-4">No active consent templates yet.</p>
              ) : (
                <ChartPickerSection
                  heading="Consents"
                  selectLabel="Select Consent"
                  selectTestId="select-chart-consent-template"
                  buttonTestId="button-chart-sign-consent"
                  rows={allConsents}
                  selectedId={selectedConsentId}
                  onSelectedIdChange={setSelectedConsentId}
                  actionLabel="Create Consent"
                  onAction={() => {
                    const row = allConsents.find((t) => t.id === selectedConsentId);
                    if (row) openModeDialog(row);
                  }}
                />
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Forms</h3>
                {allForms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No form templates yet.</p>
                ) : (
                  <TemplatesTable rows={allForms} patientId={undefined} onStart={openModeDialog} />
                )}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Consents</h3>
                {allConsents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No consent documents yet.</p>
                ) : (
                  <TemplatesTable rows={allConsents} patientId={undefined} onStart={openModeDialog} />
                )}
              </section>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!modeDialogRow} onOpenChange={(o) => !o && setModeDialogRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modeDialogRow?.title}</DialogTitle>
            <DialogDescription>
              Choose how to complete this {modeDialogRow?.kind === "consent" ? "consent" : "form"}. Staff-assisted opens
              here with the patient&apos;s MRN and name prefilled. QR lets the patient finish on their own device; the
              submission is still linked to this chart.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={goStaffAssisted}>
              Staff-assisted
            </Button>
            <Button type="button" variant="secondary" onClick={goQr} disabled={qrMutation.isPending}>
              {qrMutation.isPending ? "Generating…" : "Generate QR code"}
            </Button>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="ghost" onClick={() => setModeDialogRow(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrPayload} onOpenChange={(o) => !o && setQrPayload(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan to complete on phone</DialogTitle>
            <DialogDescription>
              The patient can scan this code to open {qrPayload?.title ? `“${qrPayload.title}”` : "the document"} (
              {qrPayload?.kind === "consent" ? "consent" : "form"}). It expires{" "}
              {qrPayload ? format(new Date(qrPayload.expiresAt), "MMM d, yyyy h:mm a") : ""}.
            </DialogDescription>
          </DialogHeader>
          {qrPayload ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="rounded-lg border bg-white p-3">
                <QRCodeSVG value={qrPayload.fillUrl} size={200} level="M" />
              </div>
              <p className="text-xs text-muted-foreground break-all text-center max-w-full">{qrPayload.fillUrl}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setQrPayload(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
