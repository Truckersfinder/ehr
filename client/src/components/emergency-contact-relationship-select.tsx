import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMERGENCY_CONTACT_RELATIONSHIPS_QUERY_KEY,
  fetchEmergencyContactRelationships,
} from "@/lib/emergency-contact-relationships-api";
import type { EmergencyContactRelationshipOption } from "@shared/emergency-contact-relationships";

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  "data-testid"?: string;
};

export function EmergencyContactRelationshipSelect({
  value,
  onValueChange,
  placeholder = "Select relationship",
  "data-testid": testId,
}: Props) {
  const { data = [], isLoading, isError } = useQuery<EmergencyContactRelationshipOption[]>({
    queryKey: [...EMERGENCY_CONTACT_RELATIONSHIPS_QUERY_KEY],
    queryFn: fetchEmergencyContactRelationships,
    staleTime: 1000 * 60 * 60 * 24,
    retry: 2,
  });

  const options = useMemo(() => {
    const list = [...data];
    const v = value?.trim();
    if (v && !list.some((o) => o.value === v)) {
      list.push({ value: v, label: v });
    }
    return list;
  }, [data, value]);

  return (
    <Select
      value={value || "__none"}
      onValueChange={(v) => onValueChange(v === "__none" ? "" : v)}
      disabled={isLoading || isError}
    >
      <SelectTrigger data-testid={testId}>
        <SelectValue
          placeholder={
            isLoading
              ? "Loading relationships…"
              : isError
                ? "Unable to load relationships"
                : placeholder
          }
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">— Not specified —</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

