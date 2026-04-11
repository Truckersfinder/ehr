import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClinicalFormField } from "@shared/schema";
import { isLegacyPatientSignOffTemplateField } from "@shared/consent-patient-signature";
import { cn } from "@/lib/utils";
import { SignaturePad } from "@/components/signature-pad";

type Answers = Record<string, string | number | boolean>;

const CONSENT_TYPE_FIELD_ID = "sys_consent_type";
const PROCEDURE_CONSENT_LABEL = "Procedure Consent";
const PERFORMING_CLINICIAN_FIELD_ID = "sys_performing_clinician";
const RISK_BENEFITS_FIELD_ID = "sys_procedure_risks_benefits";
const CLINICIAN_ONLY_FIELD_IDS = new Set([
  "sys_procedure_name",
  "sys_performing_clinician",
  "sys_procedure_risks_benefits",
]);
const PATIENT_SIGNATURE_FIELD_ID = "sys_provider_attestation";
const PATIENT_SIGNATURE_IMAGE_FIELD_ID = "sys_patient_signature";

type Props = {
  fields: ClinicalFormField[];
  answers: Answers;
  onChange: (fieldId: string, value: string | number | boolean | undefined) => void;
  disabled?: boolean;
  mode?: "patient" | "clinician";
  clinicianOptions?: { id: string; fullName: string }[];
  readOnlyFieldIds?: string[];
};

export function ClinicalFormFillFields({
  fields,
  answers,
  onChange,
  disabled,
  mode = "patient",
  clinicianOptions,
  readOnlyFieldIds,
}: Props) {
  const consentType = String(answers[CONSENT_TYPE_FIELD_ID] ?? "");
  const isProcedureConsent = consentType === PROCEDURE_CONSENT_LABEL;
  const signatureValue = String(answers[PATIENT_SIGNATURE_IMAGE_FIELD_ID] ?? "");
  const readOnly = new Set((readOnlyFieldIds ?? []).filter(Boolean));

  return (
    <div className="space-y-5">
      {fields
        .filter((f) => {
          if (CLINICIAN_ONLY_FIELD_IDS.has(f.id)) return isProcedureConsent;
          if (f.id === PATIENT_SIGNATURE_FIELD_ID) return mode === "patient";
          if (f.id === PATIENT_SIGNATURE_IMAGE_FIELD_ID) return mode === "patient";
          // Legacy "Patient Sign Off" template fields should not appear; we use attestation + signature.
          if (isLegacyPatientSignOffTemplateField(f)) return false;
          return true;
        })
        .map((f) => {
          const isClinicianOnly = CLINICIAN_ONLY_FIELD_IDS.has(f.id);
          const isPatientSignature = f.id === PATIENT_SIGNATURE_FIELD_ID;
          const fieldDisabled =
            disabled ||
            (mode === "patient" && isClinicianOnly) ||
            (mode === "clinician" && isPatientSignature) ||
            readOnly.has(f.id);
          const showRequiredStar =
            f.required || (f.id === PATIENT_SIGNATURE_FIELD_ID && mode === "patient");
          if (f.id === PATIENT_SIGNATURE_IMAGE_FIELD_ID) {
            return (
              <div key={f.id} className="space-y-2">
                <Label className="text-sm font-medium">
                  {f.label}
                  {showRequiredStar ? <span className="text-destructive"> *</span> : null}
                </Label>
                <SignaturePad
                  value={signatureValue}
                  onChange={(v) => onChange(PATIENT_SIGNATURE_IMAGE_FIELD_ID, v || undefined)}
                  disabled={fieldDisabled}
                  className="max-w-xl"
                />
              </div>
            );
          }

          return (
            <div key={f.id} className={cn("space-y-2", (isClinicianOnly || isPatientSignature) && "opacity-80")}>
              <Label className="text-sm font-medium">
                {f.label}
                {showRequiredStar ? <span className="text-destructive"> *</span> : null}
              </Label>
          {(() => {
            const usesClinicianDropdown =
              mode === "clinician" && isProcedureConsent && f.id === PERFORMING_CLINICIAN_FIELD_ID;
            return (
              <>
                {usesClinicianDropdown ? (
            <Select
              value={String(answers[f.id] ?? "")}
              onValueChange={(v) => onChange(f.id, v)}
              disabled={fieldDisabled}
            >
              <SelectTrigger className={cn("max-w-xl", !answers[f.id] && "text-muted-foreground")}>
                <SelectValue placeholder="Select clinician…" />
              </SelectTrigger>
              <SelectContent>
                {(clinicianOptions ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.fullName}>
                    {c.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
                {f.type === "text" && !usesClinicianDropdown && (
            <Input
              value={String(answers[f.id] ?? "")}
              onChange={(e) => onChange(f.id, e.target.value)}
              disabled={fieldDisabled}
              className="max-w-xl"
            />
          )}
              </>
            );
          })()}
          {f.type === "textarea" && (
            <div className="relative max-w-xl">
              <Textarea
                value={String(answers[f.id] ?? "")}
                onChange={(e) => onChange(f.id, e.target.value)}
                disabled={fieldDisabled}
                rows={4}
                className="resize-y min-h-[80px] pr-10"
              />
              {mode === "clinician" && isProcedureConsent && f.id === RISK_BENEFITS_FIELD_ID ? (
                <button
                  type="button"
                  className={cn(
                    "absolute bottom-2 right-2 h-8 w-8 rounded-md border bg-background/80 text-muted-foreground",
                    "hover:text-foreground hover:bg-background",
                    fieldDisabled && "opacity-50 pointer-events-none",
                  )}
                  aria-label="Dictate"
                  title="Dictate"
                  onClick={() => {
                    const w = window as any;
                    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
                    if (!SR) return;
                    const rec = new SR();
                    rec.lang = "en-US";
                    rec.interimResults = false;
                    rec.maxAlternatives = 1;
                    rec.onresult = (ev: any) => {
                      const t = ev?.results?.[0]?.[0]?.transcript;
                      if (!t) return;
                      const prev = String(answers[f.id] ?? "");
                      const next = prev ? `${prev}\n${t}` : String(t);
                      onChange(f.id, next);
                    };
                    rec.start();
                  }}
                >
                  <span className="text-lg leading-none">🎙</span>
                </button>
              ) : null}
            </div>
          )}
          {f.type === "number" && (
            <Input
              type="number"
              value={answers[f.id] === undefined ? "" : String(answers[f.id])}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") onChange(f.id, undefined);
                else {
                  const n = Number(v);
                  onChange(f.id, Number.isNaN(n) ? 0 : n);
                }
              }}
              disabled={fieldDisabled}
              className="max-w-xs tabular-nums"
            />
          )}
          {f.type === "date" && (
            <Input
              type="date"
              value={String(answers[f.id] ?? "")}
              onChange={(e) => onChange(f.id, e.target.value)}
              disabled={fieldDisabled}
              className="max-w-xs"
            />
          )}
          {f.type === "select" && f.options && (
            <Select
              value={String(answers[f.id] ?? "")}
              onValueChange={(v) => onChange(f.id, v)}
              disabled={fieldDisabled}
            >
              <SelectTrigger className={cn("max-w-xl", !answers[f.id] && "text-muted-foreground")}>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {f.options.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {f.type === "checkbox" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`cf-${f.id}`}
                checked={Boolean(answers[f.id])}
                onCheckedChange={(c) => onChange(f.id, c === true)}
                disabled={fieldDisabled}
              />
              <label htmlFor={`cf-${f.id}`} className="text-sm text-muted-foreground cursor-pointer">
                Yes
              </label>
            </div>
          )}
        </div>
          );
        })}
    </div>
  );
}
