import { randomUUID } from "crypto";
import { storage } from "../storage";

export type IntegrationWebhookEvent = {
  type: string;
  /** When set, only matched to facility-scoped webhook keys for that facility. */
  facilityId?: string | null | undefined;
  data: unknown;
  source?: "integration" | "app";
};

/**
 * Enqueue webhook deliveries for active subscriptions.
 * A separate worker will retry with backoff until delivered.
 */
export async function emitIntegrationWebhookEvent(event: IntegrationWebhookEvent): Promise<void> {
  try {
    const envelope = {
      id: `evt_${randomUUID()}`,
      type: event.type,
      createdAt: new Date().toISOString(),
      source: event.source ?? "integration",
      data: event.data,
    };
    await storage.enqueueIntegrationWebhookDeliveries({
      eventType: event.type,
      facilityId: event.facilityId,
      payload: envelope,
    });
  } catch (e) {
    console.warn("[integration webhook] enqueue failed", e);
  }
}
