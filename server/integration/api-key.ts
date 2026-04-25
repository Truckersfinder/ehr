import bcrypt from "bcryptjs";
import type { IntegrationApiKey } from "@shared/schema";
import type { IStorage } from "../storage";

/** `ehr_live_<uuid>_<secret>` — secret is hex from `randomBytes(32)`. */
const API_KEY_RE = /^ehr_(live|test)_([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})_(.+)$/;

export function parseIntegrationApiKey(raw: string): { id: string; secret: string } | null {
  const t = String(raw ?? "").trim();
  const m = API_KEY_RE.exec(t);
  if (!m) return null;
  return { id: m[2], secret: m[3] };
}

export async function verifyIntegrationApiKey(
  storage: IStorage,
  raw: string,
): Promise<IntegrationApiKey | null> {
  const parsed = parseIntegrationApiKey(raw);
  if (!parsed) return null;
  const row = await storage.getIntegrationApiKeyById(parsed.id);
  if (!row?.isActive) return null;
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
  const ok = bcrypt.compareSync(parsed.secret, row.secretHash);
  return ok ? row : null;
}
