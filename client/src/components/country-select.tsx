import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { COUNTRIES_QUERY_KEY, fetchCountries } from "@/lib/countries-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CountryOption } from "@shared/countries";

export type { CountryOption };

/** React Query hook for GET /api/countries (use anywhere you need the list without this Select). */
export function useCountries(): UseQueryResult<CountryOption[], Error> {
  const { token } = useAuth();
  return useQuery<CountryOption[]>({
    queryKey: [...COUNTRIES_QUERY_KEY],
    queryFn: () => fetchCountries(token),
    staleTime: 1000 * 60 * 60 * 24,
  });
}

type CountrySelectProps = {
  value: string;
  onValueChange: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  "data-testid"?: string;
};

/**
 * Country picker backed by GET /api/countries (ISO 3166-1 alpha-2 + English names).
 */
export function CountrySelect({
  value,
  onValueChange,
  disabled,
  placeholder = "Select country",
  id,
  className,
  "data-testid": testId,
}: CountrySelectProps) {
  const { data: countries = [], isLoading } = useCountries();

  const options = useMemo(() => {
    const list = [...countries];
    const v = value?.trim();
    if (v && !list.some((c) => c.code === v)) {
      list.push({ code: v, name: v });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [countries, value]);

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id} className={cn(className)} data-testid={testId}>
        <SelectValue placeholder={isLoading ? "Loading countries…" : placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[min(24rem,70vh)] overflow-y-auto">
        {options.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.name} ({c.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
