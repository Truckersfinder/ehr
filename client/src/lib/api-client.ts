/**
 * Central HTTP helpers for the EHR client: consistent auth headers and JSON handling.
 * Prefer these over ad-hoc `fetch("/api/...")` + manual Authorization strings.
 *
 * Offline: staff `fetch` is wrapped globally (see `offline-fetch-overlay.ts`) to mirror JSON GETs
 * into encrypted IndexedDB, replay writes from a queue when online, and return optimistic responses
 * when offline — this module stays unchanged so all callers share the same behavior.
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

/** Unauthenticated GET (e.g. public form session). */
export async function apiGetJsonPublic<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return readApiJsonOrThrow<T>(res);
}

/** Unauthenticated POST (e.g. public form submit). */
export async function apiPostJsonPublic<TRes, TBody extends object = object>(path: string, body: TBody): Promise<TRes> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readApiJsonOrThrow<TRes>(res);
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

export async function apiPutJson<TRes, TBody extends object = object>(
  path: string,
  body: TBody,
  token: string | null | undefined,
): Promise<TRes> {
  const res = await fetch(path, {
    method: "PUT",
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
