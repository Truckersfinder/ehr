import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { EmptyState } from "@/components/empty-state";
import type { ClinicalFormCompletionMode, ClinicalFormTemplateKind } from "@shared/schema";

export type ClinicalFormCompletionRow = {
  id: string;
  formId: string;
  formTitle: string;
  kind: ClinicalFormTemplateKind;
  completionMode: ClinicalFormCompletionMode;
  completedAt: string;
  createdAt: string | null;
};

export function ClinicalFormCompletionsList({ patientId }: { patientId: string }) {
  const { token } = useAuth();
  const orgTz = useOrgTimeZone();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/patients", patientId, "clinical-form-completions"],
    queryFn: () =>
      apiGetJson<
        {
          id: string;
          formId: string;
          formTitle: string;
          templateKind: ClinicalFormTemplateKind;
          completionMode: ClinicalFormCompletionMode;
          completedAt: string;
          createdAt: string | null;
        }[]
      >(`/api/patients/${encodeURIComponent(patientId)}/clinical-form-completions`, token),
    enabled: !!token && !!patientId,
  });

  const normalized: ClinicalFormCompletionRow[] = rows.map((r) => ({
    id: r.id,
    formId: r.formId,
    formTitle: r.formTitle,
    kind: r.templateKind,
    completionMode: r.completionMode,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (normalized.length === 0) {
    return (
      <EmptyState
        title="No completed forms yet"
        description="Completed forms and consents for this patient will appear here after staff-assisted or mobile submission."
      />
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="w-[12rem] whitespace-nowrap">Completed</TableHead>
            <TableHead className="w-[8rem]">Type</TableHead>
            <TableHead className="w-[10rem] whitespace-nowrap">How completed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {normalized.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium max-w-[min(24rem,55vw)]">{r.formTitle}</TableCell>
              <TableCell className="text-sm whitespace-nowrap tabular-nums">
                <Link
                  href={`/patients/${encodeURIComponent(patientId)}/clinical-forms/completions/${encodeURIComponent(r.id)}`}
                  className="text-primary underline-offset-4 hover:underline font-medium"
                  title="View submitted documentation"
                >
                  {formatInOrgTimeZone(r.completedAt, "MMM d, yyyy h:mm a", orgTz)}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-[10px]">
                  {r.kind === "consent" ? "Consent" : "Form"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {r.completionMode === "patient_qr" ? "Patient (QR)" : "Staff-assisted"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
