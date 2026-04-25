import { randomBytes } from "crypto";

function requiredSecret(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  if (v.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return v;
}

function optionalSecret(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  if (v.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return v;
}

export function getAppJwtSecret(): string {
  // Production must be explicitly configured.
  if (process.env.NODE_ENV === "production") return requiredSecret("SESSION_SECRET");
  // Dev/test: allow missing but never use a fixed fallback.
  return process.env.SESSION_SECRET?.trim() || `dev_${cryptoRandomHex(32)}`;
}

export function getIntegrationJwtSecret(): string {
  if (process.env.NODE_ENV === "production") return requiredSecret("INTEGRATION_JWT_SECRET");
  return (
    process.env.INTEGRATION_JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    `dev_${cryptoRandomHex(32)}`
  );
}

export function getPatientPortalJwtSecret(): string {
  if (process.env.NODE_ENV === "production") return requiredSecret("PATIENT_PORTAL_JWT_SECRET");
  return (
    process.env.PATIENT_PORTAL_JWT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    `dev_${cryptoRandomHex(32)}`
  );
}

export function validateProdSecurityConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  requiredSecret("SESSION_SECRET");
  requiredSecret("INTEGRATION_JWT_SECRET");
  requiredSecret("PATIENT_PORTAL_JWT_SECRET");
}

function cryptoRandomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

