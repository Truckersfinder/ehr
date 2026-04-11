import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGetJson } from "@/lib/api-client";
import type { Bed } from "@shared/schema";

export function BedSelect({
  token,
  facilityId,
  value,
  onChange,
  disabled,
  placeholder = "Select bed",
  "data-testid": testId,
}: {
  token: string | null | undefined;
  facilityId?: string | null;
  value: string;
  onChange: (bedId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "data-testid"?: string;
}) {
  const { data: beds = [], isLoading } = useQuery<Bed[]>({
    queryKey: ["/api/beds/available", facilityId ?? ""],
    queryFn: () =>
      apiGetJson<Bed[]>(
        `/api/beds/available${facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ""}`,
        token
      ),
    enabled: !!token,
  });

  /** API returns only open, unoccupied beds; keep a defensive filter for status. */
  const options = useMemo(
    () => beds.filter((b) => b.status === "open" && b.isActive !== false),
    [beds],
  );

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled || options.length === 0}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={options.length === 0 ? "No beds available" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

