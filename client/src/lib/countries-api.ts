import type { CountryOption } from "@shared/countries";

export const COUNTRIES_QUERY_KEY = ["/api/countries"] as const;

export async function fetchCountries(token: string | null): Promise<CountryOption[]> {
  const res = await fetch("/api/countries", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load countries");
  return res.json();
}
