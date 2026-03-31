/**
 * Central HTTP helpers for the EHR client: consistent auth headers and JSON handling.
 * Prefer these over ad-hoc `fetch("/api/...")` + manual Authorization strings.
 */
import { readApiJsonOrThrow } from "@/lib/api-response";

export function authHeaders(token: string | null | undefined): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function jsonAuthHeaders(token: string | null | undefined): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function apiGetJson<T>(path: string, token: string | null | undefined): Promise<T> {
  const res = await fetch(path, { headers: authHeaders(token) });
  return readApiJsonOrThrow<T>(res);
}

export async function apiPostJson<TRes, TBody extends object = object>(
  path: string,
  body: TBody,
  token: string | null | undefined,
): Promise<TRes> {
  const res = await fetch(path, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
  return readApiJsonOrThrow<TRes>(res);
}

export async function apiPatchJson<TRes, TBody extends object = object>(
  path: string,
  body: TBody,
  token: string | null | undefined,
): Promise<TRes> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
  return readApiJsonOrThrow<TRes>(res);
}

/** Multipart POST (e.g. file upload). Do not set Content-Type — browser sets boundary. */
export async function apiPostFormData<TRes>(
  path: string,
  formData: FormData,
  token: string | null | undefined,
): Promise<TRes> {
  const res = await fetch(path, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  return readApiJsonOrThrow<TRes>(res);
}

export async function apiDeleteJson<T>(path: string, token: string | null | undefined): Promise<T> {
  const res = await fetch(path, { method: "DELETE", headers: authHeaders(token) });
  return readApiJsonOrThrow<T>(res);
}
