import { format, isValid, parseISO } from "date-fns";

import type { ClinicalFormField } from "@shared/schema";

type Answers = Record<string, string | number | boolean>;

function transcriptValue(field: ClinicalFormField, raw: string | number | boolean | undefined): string {
  if (raw === undefined || raw === null) return "—";
  if (typeof raw === "boolean") {
    return raw ? "Yes" : "No";
  }
  const s = String(raw).trim();
  if (s === "") return "—";

  if (field.type === "date") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = parseISO(s);
      return isValid(d) ? format(d, "MMMM d, yyyy") : s;
    }
    const d = new Date(s);
    return isValid(d) ? format(d, "MMMM d, yyyy") : s;
  }

  if (field.type === "number" && typeof raw === "number") {
    return String(raw);
  }

  return s;
}

/**
 * Read-only “transcribed” view of submitted answers (labels + plain text), not form controls.
 */
export function ClinicalFormAnswersTranscript({
  fields,
  answers,
  omitFieldIds,
}: {
  fields: ClinicalFormField[];
  answers: Answers;
  omitFieldIds?: string[];
}) {
  const omit = new Set((omitFieldIds ?? []).filter(Boolean));
  return (
    <div
      className="rounded-md border bg-muted/15 px-4 py-5 sm:px-6"
      data-testid="clinical-form-answers-transcript"
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-5">
        Submission record
      </p>
      <div className="space-y-0 divide-y divide-border/70">
        {fields.filter((f) => !omit.has(f.id)).map((f) => (
          <div key={f.id} className="py-4 first:pt-0">
            <p className="text-sm font-semibold text-foreground">{f.label}</p>
            {(() => {
              const v = answers[f.id];
              if (f.id === "sys_patient_signature" && typeof v === "string" && v.startsWith("data:image/")) {
                return (
                  <div className="mt-2 rounded-md border bg-white p-2 max-w-xl">
                    <img src={v} alt="Patient signature" className="w-full h-auto" />
                  </div>
                );
              }
              return (
                <p className="mt-1.5 text-sm text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">
                  {transcriptValue(f, answers[f.id])}
                </p>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
