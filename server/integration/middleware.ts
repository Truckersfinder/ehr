import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { scopeAllows } from "@shared/integration-scopes";
import { verifyIntegrationApiKey } from "./api-key";
import { loadIntegrationKeyFromJwt } from "./integration-jwt";
import type { IntegrationRequestContext } from "./integration-context";
import { storage } from "../storage";
import { integrationRateLimitCheck } from "./rate-limit";

const RATE_MAX = Math.min(Math.max(parseInt(process.env.INTEGRATION_RATE_LIMIT_PER_MIN ?? "120", 10) || 120, 10), 10_000);

export async function integrationAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header (Bearer token or API key)." },
    });
  }
  const token = auth.slice(7).trim();

  let row = await loadIntegrationKeyFromJwt(storage, token);
  if (!row) {
    row = await verifyIntegrationApiKey(storage, token);
  }
  if (!row) {
    return res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid or expired integration credentials." },
    });
  }

  const rl = await integrationRateLimitCheck({ keyId: row.id, maxPerMinute: RATE_MAX });
  if (!rl.ok) {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: `Too many requests. Limit is ${RATE_MAX} per minute per API key.`,
      },
    });
  }

  void storage.touchIntegrationApiKeyLastUsed(row.id);

  const ctx: IntegrationRequestContext = {
    apiKey: row,
    actingUserId: row.createdByUserId,
  };
  req.integration = ctx;
  next();
}

export function requireIntegrationScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const granted = req.integration?.apiKey.scopes as string[] | undefined;
    if (!granted) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Integration context missing." } });
    }
    if (!scopeAllows(granted, scope)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: `Missing required scope: ${scope}` },
      });
    }
    next();
  };
}

function fingerprintForRequest(req: Request): string {
  const body =
    req.body && typeof req.body === "object" ? JSON.stringify(req.body) : String(req.body ?? "");
  return createHash("sha256").update(`${req.method}:${req.path}:${body}`).digest("hex");
}

/**
 * Replay cached responses for identical Idempotency-Key + request body (writes only).
 */
export async function integrationIdempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const ctx = req.integration;
  if (!ctx) return next();

  const key = req.get("Idempotency-Key")?.trim();
  if (!key || key.length > 256) {
    return next();
  }
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return next();
  }

  const fp = fingerprintForRequest(req);
  try {
    const existing = await storage.getIntegrationIdempotencyRecord(ctx.apiKey.id, key);
    if (existing) {
      if (existing.requestFingerprint !== fp) {
        return res.status(409).json({
          error: {
            code: "IDEMPOTENCY_KEY_REUSE",
            message: "Idempotency-Key was reused with a different request body.",
          },
        });
      }
      return res.status(existing.responseStatus).json(existing.responseBody);
    }
  } catch (e) {
    console.warn("[integration] idempotency read failed", e);
    return next();
  }

  const origJson = res.json.bind(res);
  let captured: unknown;
  res.json = function jsonCapture(body: unknown) {
    captured = body;
    return origJson(body);
  };

  res.on("finish", () => {
    if (res.statusCode >= 500) return;
    let toStore: unknown = captured;
    try {
      const raw = JSON.stringify(captured);
      const max = Math.min(
        Math.max(parseInt(process.env.INTEGRATION_IDEMPOTENCY_MAX_BYTES ?? "50000", 10) || 50000, 1000),
        500000,
      );
      if (raw.length > max) {
        toStore = { truncated: true, bytes: raw.length };
      }
    } catch {
      toStore = { truncated: true };
    }
    void storage
      .insertIntegrationIdempotencyRecord({
        integrationApiKeyId: ctx.apiKey.id,
        idempotencyKey: key,
        requestFingerprint: fp,
        responseStatus: res.statusCode,
        responseBody: toStore,
      })
      .catch((e) => console.warn("[integration] idempotency save failed", e));
  });

  next();
}
