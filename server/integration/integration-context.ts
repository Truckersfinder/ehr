import type { IntegrationApiKey } from "@shared/schema";
import type { Request } from "express";

export type IntegrationRequestContext = {
  apiKey: IntegrationApiKey;
  /** Staff user attributed for audit logs (`audit_logs.user_id`). */
  actingUserId: string;
};

declare global {
  namespace Express {
    interface Request {
      integration?: IntegrationRequestContext;
    }
  }
}

export function getIntegrationContext(req: Request): IntegrationRequestContext | undefined {
  return req.integration;
}
