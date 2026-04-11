import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPostJson } from "@/lib/api-client";
import { EmptyState } from "@/components/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Row = {
  id: string;
  formId: string;
  formTitle: string;
  completionMode: "staff_assisted" | "patient_qr";
  clinicianSignedAt: string;
  createdAt: string | null;
};

export function ProcedureConsentsPendingProviderSignatureList({ patientId }: { patientId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Row | null>(null);
  const [qrPayload, setQrPayload] = useState<{ fillUrl: string; expiresAt: string; title: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/patients", patientId, "procedure-consents", "pending-patient-signature"],
    queryFn: () =>
      apiGetJson<Row[]>(
        `/api/patients/${encodeURIComponent(patientId)}/procedure-consents/pending-patient-signature`,
        token,
      ),
    enabled: !!token && !!patientId,
  });

  const qrMutation = useMutation({
    mutationFn: async (row: Row) => {
      const data = await apiPostJson<{ fillUrl: string; expiresAt: string }, Record<string, never>>(
        `/api/patients/${encodeURIComponent(patientId)}/procedure-consents/${encodeURIComponent(row.id)}/qr-session`,
        {},
        token,
      );
      return { ...data, row };
    },
    onSuccess: (data) => {
      setQrPayload({ fillUrl: data.fillUrl, expiresAt: data.expiresAt, title: data.row.formTitle });
      setSelected(null);
    },
    onError: (e: Error) => toast({ title: "Could not create QR session", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No pending procedure consents"
        description="Procedure consents that still need a patient signature will appear here."
      />
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead className="w-[12rem] whitespace-nowrap">Signed</TableHead>
              <TableHead className="w-[10rem] whitespace-nowrap">How initiated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium max-w-[min(24rem,55vw)]">{r.formTitle}</TableCell>
                <TableCell className="text-sm whitespace-nowrap tabular-nums">
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline font-medium"
                    onClick={() => setSelected(r)}
                    title="Generate QR code for patient signature"
                  >
                    {format(new Date(r.clinicianSignedAt), "MMM d, yyyy h:mm a")}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {r.completionMode === "patient_qr" ? "Patient (QR)" : "Staff-assisted"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate QR code</DialogTitle>
            <DialogDescription>
              Generate a QR code so the patient can sign this consent on their phone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => selected && qrMutation.mutate(selected)} disabled={qrMutation.isPending}>
              {qrMutation.isPending ? "Generating…" : "Generate QR code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrPayload} onOpenChange={(o) => !o && setQrPayload(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan to sign consent</DialogTitle>
            <DialogDescription>
              The patient can scan this code to sign {qrPayload?.title ? `“${qrPayload.title}”` : "the consent"}. It
              expires {qrPayload ? format(new Date(qrPayload.expiresAt), "MMM d, yyyy h:mm a") : ""}.
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

