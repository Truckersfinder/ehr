import { randomBytes } from "crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { patients } from "@shared/schema";
import type { IntegrationRequestContext } from "../integration-context";
import { db } from "../../db";
import { storage } from "../../storage";

const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sort: z.string().optional(),
  q: z.string().optional(),
});

export function getPagination(req: { query: Record<string, unknown> }) {
  const p = paginationQuery.safeParse(req.query);
  if (!p.success) return { limit: 50, offset: 0 };
  return p.data;
}

export function paramId(p: string | string[] | undefined): string {
  if (p === undefined) return "";
  return Array.isArray(p) ? String(p[0] ?? "") : String(p);
}

export function facilityScope(ctx: IntegrationRequestContext): string | undefined {
  return ctx.apiKey.facilityId ?? undefined;
}

export async function patientVisible(ctx: IntegrationRequestContext, patientId: string) {
  const p = await storage.getPatient(patientId);
  if (!p) return null;
  const fac = facilityScope(ctx);
  if (fac && p.facilityId !== fac) return null;
  return p;
}

export async function requireVisiblePatientById(ctx: IntegrationRequestContext, patientId: string) {
  const p = await patientVisible(ctx, patientId);
  if (!p) {
    return { ok: false as const, res: { error: { code: "NOT_FOUND", message: "Patient not found." } } };
  }
  return { ok: true as const, patient: p };
}

export async function integrationAudit(
  ctx: IntegrationRequestContext,
  req: { ip?: string },
  action: string,
  resource: string,
  resourceId: string | null,
) {
  await storage.createAuditLog({
    userId: ctx.actingUserId,
    action,
    resource,
    resourceId: resourceId ?? undefined,
    details: undefined,
    ipAddress: req.ip ?? undefined,
  });
}

export async function generateUniqueMrn(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = `INT-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const existing = await db.select({ id: patients.id }).from(patients).where(eq(patients.mrn, candidate));
    if (existing.length === 0) return candidate;
  }
  return `INT-${randomBytes(8).toString("hex")}`;
}

