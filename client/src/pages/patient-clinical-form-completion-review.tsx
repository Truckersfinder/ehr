import { format } from "date-fns";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { ClinicalFormAnswersTranscript } from "@/components/clinical-form-answers-transcript";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import type {
  ClinicalFormCompletionMode,
  ClinicalFormField,
  ClinicalFormTemplateKind,
} from "@shared/schema";

type ReviewPayload = {
  completion: {
    id: string;
    completedAt: string;
    completionMode: ClinicalFormCompletionMode;
    answers: Record<string, string | number | boolean>;
  };
  form: {
    id: string;
    title: string;
    description: string | null;
    fields: ClinicalFormField[];
    templateKind: ClinicalFormTemplateKind;
  };
};

export default function PatientClinicalFormCompletionReviewPage() {
  const params = useParams<{ id: string; completionId: string }>();
  const patientId = params.id;
  const completionId = params.completionId;
  const { token } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/patients", patientId, "clinical-form-completions", completionId],
    queryFn: () =>
      apiGetJson<ReviewPayload>(
        `/api/patients/${encodeURIComponent(patientId!)}/clinical-form-completions/${encodeURIComponent(completionId!)}`,
        token,
      ),
    enabled: !!token && !!patientId && !!completionId,
  });

  if (!patientId || !completionId) {
    return <p className="p-6 text-sm text-muted-foreground">Missing route parameters.</p>;
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load this submission."}</p>
        <Button variant="outline" asChild>
          <Link href={`/patients/${patientId}?tab=forms-consent`}>Back to chart</Link>
        </Button>
      </div>
    );
  }

  const completedLabel = format(new Date(data.completion.completedAt), "MMM d, yyyy h:mm a");
  const how =
    data.completion.completionMode === "patient_qr" ? "Patient (QR)" : "Staff-assisted";

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" asChild>
          <Link href={`/patients/${patientId}?tab=forms-consent`}>
            <ArrowLeft className="w-4 h-4" /> Back to chart
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>
                {data.form.description ? (
                  <SectionTitleWithHint hint={data.form.description}>{data.form.title}</SectionTitleWithHint>
                ) : (
                  data.form.title
                )}
              </CardTitle>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {data.form.templateKind === "consent" ? "Consent" : "Form"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground pt-2">
            Completed {completedLabel} · {how}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <ClinicalFormAnswersTranscript fields={data.form.fields} answers={data.completion.answers} />
        </CardContent>
      </Card>
    </div>
  );
}
