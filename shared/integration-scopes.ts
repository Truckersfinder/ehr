/**
 * OAuth2-style scopes for `/api/v1` integration keys.
 * Wildcard `integration:*` grants all (use only for trusted internal bridges).
 */
export const INTEGRATION_SCOPES = [
  "integration:*",
  "patients:read",
  "patients:write",
  "providers:read",
  "appointments:read",
  "appointments:write",
  "encounters:read",
  "encounters:write",
  "medications:read",
  "medications:write",
  "allergies:read",
  "allergies:write",
  "problems:read",
  "problems:write",
  "labs:read",
  "labs:write",
  "vitals:read",
  "vitals:write",
  "documents:read",
  "documents:write",
  "notes:read",
  "notes:write",
  "billing:read",
  "billing:write",
  "insurance:read",
  "insurance:write",
  "facilities:read",
  "facilities:write",
  "users:read",
  "users:write",
  "audit:read",
  "webhooks:read",
  "webhooks:write",
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export function scopeAllows(granted: string[], required: string): boolean {
  if (granted.includes("integration:*")) return true;
  return granted.includes(required);
}

export function scopeAllowsAny(granted: string[], required: string[]): boolean {
  if (granted.includes("integration:*")) return true;
  return required.some((s) => granted.includes(s));
}
