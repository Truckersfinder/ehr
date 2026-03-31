import { authHeaders } from "@/lib/api-client";
import type { Patient } from "@shared/schema";

/**
 * Debounced search from Uploads / similar flows: soft-fail to [] on HTTP errors.
 */
export async function searchPatientsByQuery(trimmedQuery: string, token: string | null): Promise<Patient[]> {
  const q = trimmedQuery.trim();
  if (!q) return [];
  const res = await fetch(`/api/patients?search=${encodeURIComponent(q)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchPatientById(id: string, token: string | null): Promise<Patient | null> {
  const res = await fetch(`/api/patients/${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json() as Promise<Patient>;
}
