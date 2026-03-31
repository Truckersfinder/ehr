import { apiGetJson } from "@/lib/api-client";
import type { StateOption } from "@shared/states";

export function statesQueryKey(countryCode: string) {
  return ["/api/countries", countryCode.toUpperCase(), "states"] as const;
}

export async function fetchStates(countryCode: string, token: string | null): Promise<StateOption[]> {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) return [];
  return apiGetJson<StateOption[]>(`/api/countries/${encodeURIComponent(code)}/states`, token);
}

