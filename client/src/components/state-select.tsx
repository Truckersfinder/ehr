import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchStates, statesQueryKey } from "@/lib/states-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StateOption } from "@shared/states";

export type { StateOption };

export function useStates(countryCode: string): UseQueryResult<StateOption[], Error> {
  const code = String(countryCode || "").trim().toUpperCase();
  return useQuery<StateOption[]>({
    queryKey: [...statesQueryKey(code)],
    queryFn: () => fetchStates(code, null),
    enabled: !!code,
    staleTime: 1000 * 60 * 60 * 24,
  });
}

type StateSelectProps = {
  countryCode: string;
  value: string;
  onValueChange: (state: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  "data-testid"?: string;
};

export function StateSelect({
  countryCode,
  value,
  onValueChange,
  disabled,
  placeholder = "Select state",
  id,
  className,
  "data-testid": testId,
}: StateSelectProps) {
  const code = String(countryCode || "").trim().toUpperCase();
  const { data: states = [], isLoading } = useStates(code);

  const options = useMemo(() => {
    const list = [...states];
    const v = value?.trim();
    if (v && !list.some((s) => s.name === v || s.code === v)) {
      list.push({ code: v, name: v });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [states, value]);

  return (
    <Select
      value={value || "__none"}
      onValueChange={(v) => onValueChange(v === "__none" ? "" : v)}
      disabled={disabled || !code || isLoading}
    >
      <SelectTrigger id={id} className={cn(className)} data-testid={testId}>
        <SelectValue placeholder={!code ? "Select country first" : isLoading ? "Loading states…" : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[min(24rem,70vh)] overflow-y-auto">
        <SelectItem value="__none">— Not specified —</SelectItem>
        {options.map((s) => (
          <SelectItem key={`${s.code}:${s.name}`} value={s.name}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

