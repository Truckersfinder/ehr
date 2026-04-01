import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMON_AFRICAN_PATIENT_PROBLEMS,
  joinAfricanPatientProblem,
  splitAfricanPatientProblem,
} from "@/lib/common-african-patient-problems";

type AfricanPatientProblemSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown when nothing selected */
  placeholder?: string;
  "data-testid"?: string;
};

export function AfricanPatientProblemSelect({
  value,
  onChange,
  disabled,
  placeholder = "Select a problem",
  "data-testid": testId,
}: AfricanPatientProblemSelectProps) {
  const { select: initialSelect, other: initialOther } = splitAfricanPatientProblem(value);
  const [select, setSelect] = useState(initialSelect);
  const [other, setOther] = useState(initialOther);

  useEffect(() => {
    const s = splitAfricanPatientProblem(value);
    setSelect(s.select);
    setOther(s.other);
  }, [value]);

  const pushChange = (nextSelect: string, nextOther: string) => {
    onChange(joinAfricanPatientProblem(nextSelect, nextOther));
  };

  return (
    <div className="space-y-2">
      <Select
        value={select || undefined}
        disabled={disabled}
        onValueChange={(v) => {
          setSelect(v);
          if (v !== "Other") {
            setOther("");
            pushChange(v, "");
          } else {
            setOther("");
            pushChange("Other", "");
          }
        }}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(60vh,20rem)]">
          {COMMON_AFRICAN_PATIENT_PROBLEMS.map((label) => (
            <SelectItem key={label} value={label}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {select === "Other" && (
        <div className="space-y-1.5">
          <Label className="text-muted-foreground">Describe problem</Label>
          <Input
            value={other}
            disabled={disabled}
            onChange={(e) => {
              const t = e.target.value;
              setOther(t);
              pushChange("Other", t);
            }}
            placeholder="Enter problem in your own words"
          />
        </div>
      )}
    </div>
  );
}
