import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { ClinicalFormField, ClinicalFormTemplateKind } from "@shared/schema";
import { getSystemPatientClinicalFormFields, isSystemClinicalFormFieldId } from "@shared/clinical-form-system-fields";

export type DraftFormFieldRow = {
  tempId: string;
  label: string;
  type: ClinicalFormField["type"];
  required: boolean;
  optionsText: string;
};

const FIELD_TYPE_LABELS: Record<ClinicalFormField["type"], string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
};

export function clinicalFieldsToDraftRows(fields: ClinicalFormField[]): DraftFormFieldRow[] {
  return fields.map((f) => ({
    tempId: f.id,
    label: f.label,
    type: f.type,
    required: f.required ?? false,
    optionsText: f.options?.join(", ") ?? "",
  }));
}

/** Draft rows for custom fields only (system patient identifiers are merged server-side and shown separately in the UI). */
export function clinicalFieldsToCustomDraftRows(fields: ClinicalFormField[]): DraftFormFieldRow[] {
  return clinicalFieldsToDraftRows(fields.filter((f) => !isSystemClinicalFormFieldId(f.id)));
}

/** Body for POST/PATCH `/api/admin/forms` — preserves stable field ids when `tempId` is a server id. */
export function buildAdminFormBodyFromDraft(
  title: string,
  description: string,
  draftFields: DraftFormFieldRow[],
  kind: ClinicalFormTemplateKind,
): {
  title: string;
  description?: string;
  kind: ClinicalFormTemplateKind;
  fields: { id?: string; label: string; type: ClinicalFormField["type"]; required: boolean; options?: string[] }[];
} {
  const t = title.trim();
  if (!t) throw new Error("Form title is required");
  const customRows = draftFields.filter((row) => !isSystemClinicalFormFieldId(row.tempId));
  const fields = customRows.map((row) => {
    const label = row.label.trim();
    if (!label) throw new Error("Each field needs a label");
    const isNewRow = row.tempId.startsWith("row_");
    const base: {
      id?: string;
      label: string;
      type: ClinicalFormField["type"];
      required: boolean;
      options?: string[];
    } = {
      ...(isNewRow ? {} : { id: row.tempId }),
      label,
      type: row.type,
      required: row.required,
    };
    if (row.type === "select") {
      const options = row.optionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length === 0) throw new Error(`Select field "${label}" needs comma-separated options`);
      base.options = options;
    }
    return base;
  });
  return {
    title: t,
    kind,
    ...(description.trim() ? { description: description.trim() } : {}),
    fields,
  };
}

type ClinicalFormDefinitionCardProps = {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  draftFields: DraftFormFieldRow[];
  setDraftFields: Dispatch<SetStateAction<DraftFormFieldRow[]>>;
  footer: ReactNode;
  /** Drives card heading copy for Form vs Consent templates. */
  templateKind: ClinicalFormTemplateKind;
  titleId?: string;
  descriptionId?: string;
};

export function ClinicalFormDefinitionCard({
  title,
  setTitle,
  description,
  setDescription,
  draftFields,
  setDraftFields,
  footer,
  templateKind,
  titleId = "clinical-form-title",
  descriptionId = "clinical-form-description",
}: ClinicalFormDefinitionCardProps) {
  const systemFields = getSystemPatientClinicalFormFields();
  const moveCustomField = (index: number, delta: -1 | 1) => {
    setDraftFields((prev) => {
      const next = [...prev];
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      const t = next[index];
      next[index] = next[j]!;
      next[j] = t!;
      return next;
    });
  };
  const heading = templateKind === "consent" ? "Consent document — template" : "Form — template";
  const sub =
    templateKind === "consent"
      ? "Define the consent fields (e.g. acknowledgements, signatures) for this document."
      : "Define the fields for this form (text, dates, checkboxes, etc.).";
  return (
    <Card className="border-2 shadow-sm w-full overflow-hidden">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 shrink-0" />
          <SectionTitleWithHint hint={sub}>{heading}</SectionTitleWithHint>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor={titleId}>Title *</Label>
          <Input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pre-admission checklist"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={descriptionId}>Description</Label>
          <Textarea
            id={descriptionId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional instructions for staff"
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              <SectionTitleWithHint hint="These four fields are always included first on every form and consent. They cannot be edited or removed.">
                Patient identifiers
              </SectionTitleWithHint>
            </Label>
            <div className="space-y-3">
              {systemFields.map((sf) => (
                <div
                  key={sf.id}
                  className="rounded-md border border-dashed p-3 space-y-2 bg-muted/40 opacity-85 pointer-events-none select-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{sf.label} (required)</span>
                  </div>
                  <Input readOnly value={sf.label} className="bg-muted/60 text-muted-foreground" tabIndex={-1} />
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Type</span>
                    <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/60 px-3 text-sm text-muted-foreground">
                      {FIELD_TYPE_LABELS[sf.type]}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked disabled />
                    Required
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Additional fields</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  setDraftFields((prev) => [
                    ...prev,
                    {
                      tempId: `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                      label: "",
                      type: "text",
                      required: false,
                      optionsText: "",
                    },
                  ])
                }
              >
                Add field
              </Button>
            </div>
            {draftFields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No additional fields yet. Click &quot;Add field&quot;.</p>
            ) : (
              <div className="space-y-3">
                {draftFields.map((row, idx) => (
                  <div key={row.tempId} className="rounded-md border p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Additional field {idx + 1}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Move field up"
                          disabled={idx === 0}
                          onClick={() => moveCustomField(idx, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Move field down"
                          disabled={idx === draftFields.length - 1}
                          onClick={() => moveCustomField(idx, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => setDraftFields((prev) => prev.filter((r) => r.tempId !== row.tempId))}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <Input
                      placeholder="Label *"
                      value={row.label}
                      onChange={(e) =>
                        setDraftFields((prev) =>
                          prev.map((r) => (r.tempId === row.tempId ? { ...r, label: e.target.value } : r)),
                        )
                      }
                    />
                    <Select
                      value={row.type}
                      onValueChange={(v) =>
                        setDraftFields((prev) =>
                          prev.map((r) =>
                            r.tempId === row.tempId ? { ...r, type: v as ClinicalFormField["type"] } : r,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Short text</SelectItem>
                        <SelectItem value="textarea">Long text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="select">Dropdown</SelectItem>
                        <SelectItem value="checkbox">Checkbox</SelectItem>
                      </SelectContent>
                    </Select>
                    {row.type === "select" ? (
                      <Input
                        placeholder="Options (comma-separated) *"
                        value={row.optionsText}
                        onChange={(e) =>
                          setDraftFields((prev) =>
                            prev.map((r) =>
                              r.tempId === row.tempId ? { ...r, optionsText: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={row.required}
                        onCheckedChange={(c) =>
                          setDraftFields((prev) =>
                            prev.map((r) => (r.tempId === row.tempId ? { ...r, required: c === true } : r)),
                          )
                        }
                      />
                      Required
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2 border-t">{footer}</div>
      </CardContent>
    </Card>
  );
}
