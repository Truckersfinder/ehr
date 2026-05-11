import {
  addConflictRecord,
  addPendingSyncItem,
  listPendingSyncItems,
  loadEncryptedMirror,
  removePendingSyncItem,
  saveEncryptedMirror,
} from "@/lib/offline/offline-idb";
import {
  slimPatientForOfflineCompare,
  type PendingSyncItem,
} from "@/lib/offline/offline-types";
import { stableStringify } from "@/lib/offline/stable-json";
import type { Patient } from "@shared/schema";
import i18n from "@/lib/i18n";

const OFFLINE_TEMP_PREFIX = "offline-pending-";

export function isOfflineTempPatientId(id: string): boolean {
  return id.startsWith(OFFLINE_TEMP_PREFIX);
}

export function newOfflineTempId(): string {
  return `${OFFLINE_TEMP_PREFIX}${crypto.randomUUID()}`;
}

function classifyOfflineWrite(path: string, method: string): PendingSyncItem["entityType"] {
  if (method === "PATCH" && /^\/api\/patients\/[^/]+$/.test(path)) return "patient";
  if (method === "POST" && /^\/api\/patients$/.test(path)) return "patient";
  if (method === "POST" && /\/clinical-forms\/[^/]+\/submit$/.test(path)) return "clinical_form_completion";
  return "generic";
}

function patientIdFromPatchPath(path: string): string | undefined {
  const m = path.match(/^\/api\/patients\/([^/]+)$/);
  return m?.[1];
}

function mergePatientWithPatch(patient: Patient, body: Record<string, unknown>): Patient {
  const out = { ...patient } as Record<string, unknown>;
  for (const [k, v] of Object.entries(body)) {
    out[k] = v;
  }
  return out as Patient;
}

export async function mirrorSuccessfulJsonGet(path: string, userId: string, token: string, clone: Response): Promise<void> {
  try {
    const data = await clone.json();
    await saveEncryptedMirror(userId, token, path, data);
  } catch {
    /* non-json */
  }
}

/**
 * Offline-specific: when the device is offline, intercept staff JSON writes, encrypt-queue them
 * in IndexedDB, and return a synthetic HTTP response so the UI can continue with optimistic state.
 */
export async function handleOfflineStaffWrite(input: {
  path: string;
  method: "POST" | "PATCH" | "PUT";
  body: unknown;
  userId: string;
  token: string;
}): Promise<Response> {
  const { path, method, body, userId, token } = input;
  const id = crypto.randomUUID();
  const queuedAt = Date.now();
  const entityType = classifyOfflineWrite(path, method);
  const entityId =
    entityType === "patient" && method === "PATCH" ? patientIdFromPatchPath(path) : undefined;

  let baseEntitySnapshotJson: string | undefined;
  if (entityType === "patient" && method === "PATCH" && entityId) {
    const mirror = await loadEncryptedMirror<Patient>(userId, token, path);
    if (mirror) {
      baseEntitySnapshotJson = stableStringify(slimPatientForOfflineCompare(mirror));
    }
  }

  const item: PendingSyncItem = {
    id,
    queuedAt,
    action: method === "POST" ? "create" : "update",
    method,
    path,
    body,
    entityType,
    entityId,
    baseEntitySnapshotJson,
  };
  await addPendingSyncItem(userId, token, item);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ehr-offline-queue-changed"));
  }

  /** Optimistic JSON bodies mirror what online APIs return for these routes. */
  if (entityType === "patient" && method === "PATCH" && entityId) {
    const base = await loadEncryptedMirror<Patient>(userId, token, path);
    const merged = base && body && typeof body === "object" ? mergePatientWithPatch(base, body as Record<string, unknown>) : base;
    if (merged) {
      await saveEncryptedMirror(userId, token, path, merged);
      return new Response(JSON.stringify(merged), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-EHR-Offline-Queued": "1" },
      });
    }
  }

  if (entityType === "patient" && method === "POST" && path === "/api/patients") {
    const tempId = newOfflineTempId();
    return new Response(JSON.stringify({ id: tempId }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-EHR-Offline-Queued": "1" },
    });
  }

  if (entityType === "clinical_form_completion" && method === "POST") {
    return new Response(
      JSON.stringify({ id: newOfflineTempId(), completedAt: undefined }),
      { status: 200, headers: { "Content-Type": "application/json", "X-EHR-Offline-Queued": "1" } },
    );
  }

  return new Response(JSON.stringify({ ok: true, offlineQueued: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-EHR-Offline-Queued": "1" },
  });
}

export async function tryServeMirrorGet(path: string, userId: string, token: string): Promise<Response | null> {
  const data = await loadEncryptedMirror<unknown>(userId, token, path);
  if (data == null) return null;
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "X-EHR-Offline-Mirror": "1" },
  });
}

async function fetchWithAuth(path: string, method: string, body: unknown, token: string): Promise<Response> {
  return fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

export async function flushPendingSyncQueue(input: {
  userId: string;
  token: string;
  onProgress?: (phase: "syncing" | "idle", detail?: string) => void;
  onQueueLength?: (n: number) => void;
  onConflicts?: () => void;
}): Promise<{ flushed: number; conflicts: number }> {
  const { userId, token, onProgress, onQueueLength, onConflicts } = input;
  if (!navigator.onLine) return { flushed: 0, conflicts: 0 };

  const pending = await listPendingSyncItems(userId, token);
  onQueueLength?.(pending.length);
  if (pending.length === 0) return { flushed: 0, conflicts: 0 };

  onProgress?.("syncing", i18n.t("app.offline.flushing"));
  let flushed = 0;
  let conflicts = 0;

  for (const item of pending) {
    if (item.entityType === "patient" && item.method === "PATCH" && item.entityId && item.baseEntitySnapshotJson) {
      const getPath = `/api/patients/${encodeURIComponent(item.entityId)}`;
      const cur = await fetchWithAuth(getPath, "GET", undefined, token);
      if (cur.ok) {
        const serverPatient = (await cur.json()) as Patient;
        const serverSlim = stableStringify(slimPatientForOfflineCompare(serverPatient));
        if (serverSlim !== item.baseEntitySnapshotJson) {
          await addConflictRecord(userId, token, {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            pendingItemId: item.id,
            path: item.path,
            method: item.method,
            queuedBody: item.body,
            serverSnapshot: serverPatient,
            message: i18n.t("pages.offlineSync.conflictPatientDemographics"),
          });
          await removePendingSyncItem(item.id);
          conflicts++;
          onConflicts?.();
          continue;
        }
      }
    }

    const res = await fetchWithAuth(item.path, item.method, item.body, token);
    if (res.ok) {
      await removePendingSyncItem(item.id);
      flushed++;
      if (item.entityType === "patient" && item.method === "PATCH" && item.entityId) {
        try {
          const json = await res.clone().json();
          await saveEncryptedMirror(userId, token, `/api/patients/${encodeURIComponent(item.entityId)}`, json);
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    /** Leave item in queue for a later retry unless it is a hard client error. */
    if (res.status >= 400 && res.status < 500 && res.status !== 409) {
      if (res.status === 401 || res.status === 403) {
        await res.text().catch(() => "");
        onProgress?.("idle", i18n.t("app.offline.unauthorized"));
        break;
      }
    }
  }

  const remaining = await listPendingSyncItems(userId, token);
  onQueueLength?.(remaining.length);
  onProgress?.("idle");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ehr-offline-queue-changed"));
  }
  return { flushed, conflicts };
}

export function requestBackgroundSyncWhenPossible(): void {
  if (!("serviceWorker" in navigator)) return;
  const tag = "ehr-offline-sync";
  navigator.serviceWorker.ready
    .then((reg) => {
      // Offline-specific: Background Sync is Chromium-first; Safari/Firefox rely on online/app-load flush.
      const anyReg = reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } };
      return anyReg.sync?.register(tag);
    })
    .catch(() => {});
}
