import { createHmac } from "crypto";
import { storage } from "../storage";

const WEBHOOK_TIMEOUT_MS = Math.min(
  Math.max(parseInt(process.env.INTEGRATION_WEBHOOK_TIMEOUT_MS ?? "15000", 10) || 15000, 3000),
  60000,
);

const WORKER_POLL_MS = Math.min(
  Math.max(parseInt(process.env.INTEGRATION_WEBHOOK_POLL_MS ?? "2000", 10) || 2000, 500),
  30_000,
);

const BATCH_SIZE = Math.min(
  Math.max(parseInt(process.env.INTEGRATION_WEBHOOK_BATCH_SIZE ?? "25", 10) || 25, 1),
  200,
);

function signBody(secret: string, rawBody: string, timestamp: string): string {
  const payload = `${timestamp}.${rawBody}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function backoffSeconds(attempt: number): number {
  // attempt starts at 1; cap around ~1 hour
  const base = Math.min(3600, Math.pow(2, Math.min(12, Math.max(0, attempt - 1))));
  const jitter = Math.floor(Math.random() * 10);
  return base + jitter;
}

async function deliverOne(args: {
  deliveryId: string;
  url: string;
  secret: string;
  payload: unknown;
  webhookId: string;
  attempt: number;
}): Promise<void> {
  const rawBody = JSON.stringify(args.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signBody(args.secret, rawBody, timestamp);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const res = await fetch(args.url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "X-Integration-Timestamp": timestamp,
        "X-Integration-Signature": `sha256=${signature}`,
        "X-Integration-Webhook-Id": args.webhookId,
      },
      body: rawBody,
      signal: ac.signal,
    });

    if (res.ok) {
      await storage.markIntegrationWebhookDeliverySuccess(args.deliveryId, res.status);
      return;
    }

    const nextAttemptAt = new Date(Date.now() + backoffSeconds(args.attempt) * 1000);
    await storage.rescheduleIntegrationWebhookDeliveryFailure({
      deliveryId: args.deliveryId,
      statusCode: res.status,
      error: `HTTP ${res.status}`,
      nextAttemptAt,
    });
  } catch (e: any) {
    const nextAttemptAt = new Date(Date.now() + backoffSeconds(args.attempt) * 1000);
    await storage.rescheduleIntegrationWebhookDeliveryFailure({
      deliveryId: args.deliveryId,
      statusCode: null,
      error: String(e?.message || e),
      nextAttemptAt,
    });
  } finally {
    clearTimeout(t);
  }
}

let started = false;
let timer: NodeJS.Timeout | null = null;

export function startIntegrationWebhookWorker(): void {
  if (started) return;
  started = true;

  timer = setInterval(async () => {
    try {
      const due = await storage.claimDueIntegrationWebhookDeliveries({ limit: BATCH_SIZE });
      if (due.length === 0) return;
      await Promise.all(
        due.map((d) =>
          deliverOne({
            deliveryId: d.deliveryId,
            url: d.subscription.url,
            secret: d.subscription.secret,
            payload: d.payload,
            webhookId: d.subscription.id,
            attempt: d.attempts,
          }),
        ),
      );
    } catch (e) {
      console.warn("[integration webhook worker] poll failed", e);
    }
  }, WORKER_POLL_MS);
}

export function stopIntegrationWebhookWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

