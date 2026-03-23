/**
 * Single source of truth for the auth token storage key and reading the token
 * when React context is not available (e.g. rare edge cases) or as a fallback.
 */
export const EHR_TOKEN_STORAGE_KEY = "ehr_token" as const;

export function getStoredAuthToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(EHR_TOKEN_STORAGE_KEY);
}

/** Headers for fetch when using a bearer token from storage */
export function getStoredAuthHeaders(): Record<string, string> {
  const t = getStoredAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
