import { apiGetJson } from "@/lib/api-client";
import type { CountryOption } from "@shared/countries";

export const COUNTRIES_QUERY_KEY = ["/api/countries"] as const;

export async function fetchCountries(token: string | null): Promise<CountryOption[]> {
  return apiGetJson<CountryOption[]>("/api/countries", token);
}
