import jwt from "jsonwebtoken";
import type { IntegrationApiKey } from "@shared/schema";
import type { IStorage } from "../storage";

import { getIntegrationJwtSecret } from "../config";

const INTEGRATION_JWT_SECRET = getIntegrationJwtSecret();

export type IntegrationJwtPayload = {
  sub: string;
  integration: true;
  scopes: string[];
  facilityId: string | null;
  actingUserId: string;
};

export function signIntegrationAccessToken(key: IntegrationApiKey): string {
  const payload: IntegrationJwtPayload = {
    sub: key.id,
    integration: true,
    scopes: key.scopes as string[],
    facilityId: key.facilityId ?? null,
    actingUserId: key.createdByUserId,
  };
  return jwt.sign(payload, INTEGRATION_JWT_SECRET, { expiresIn: "1h" });
}

export function verifyIntegrationAccessToken(token: string): IntegrationJwtPayload {
  const d = jwt.verify(token, INTEGRATION_JWT_SECRET) as IntegrationJwtPayload;
  if (!d?.integration || typeof d.sub !== "string") {
    throw new Error("Invalid integration token");
  }
  return d;
}

/** Resolves JWT to the live API key row (revocation, scope changes). */
export async function loadIntegrationKeyFromJwt(
  storage: IStorage,
  token: string,
): Promise<IntegrationApiKey | null> {
  try {
    const payload = verifyIntegrationAccessToken(token);
    const row = await storage.getIntegrationApiKeyById(payload.sub);
    if (!row?.isActive) return null;
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
    return row;
  } catch {
    return null;
  }
}
