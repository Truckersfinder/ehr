import { decryptJson, deriveUserDataKey, encryptJson, type EncryptedEnvelope } from "@/lib/offline/crypto-user-data";
import type { OfflineConflictRecord, PendingSyncItem } from "@/lib/offline/offline-types";

const DB_NAME = "imani_ehr_offline";
const DB_VERSION = 1;

const STORE_META = "meta";
const STORE_MIRROR = "apiMirror";
const STORE_PENDING = "pendingSync";
const STORE_CONFLICTS = "conflicts";

type MetaRow = { key: "userScope"; userId: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_MIRROR)) db.createObjectStore(STORE_MIRROR, { keyPath: "mirrorKey" });
      if (!db.objectStoreNames.contains(STORE_PENDING)) db.createObjectStore(STORE_PENDING, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_CONFLICTS)) db.createObjectStore(STORE_CONFLICTS, { keyPath: "id" });
    };
  });
}

function mirrorKeyForGet(path: string): string {
  return `GET:${path}`;
}

async function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function assertOfflineUserScope(userId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readwrite");
  const store = tx.objectStore(STORE_META);
  store.put({ key: "userScope", userId } satisfies MetaRow);
  await txComplete(tx);
  db.close();
}

export async function getOfflineUserScope(): Promise<string | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_META, "readonly");
  const row = await idbRequest<MetaRow | undefined>(tx.objectStore(STORE_META).get("userScope"));
  db.close();
  return row?.userId ?? null;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveEncryptedMirror(
  userId: string,
  token: string,
  path: string,
  jsonBody: unknown,
): Promise<void> {
  const key = await deriveUserDataKey(userId, token);
  const env = await encryptJson(key, jsonBody);
  const db = await openDb();
  const tx = db.transaction(STORE_MIRROR, "readwrite");
  tx.objectStore(STORE_MIRROR).put({
    mirrorKey: mirrorKeyForGet(path),
    userId,
    envelope: env,
    storedAt: Date.now(),
  });
  await txComplete(tx);
  db.close();
}

export async function loadEncryptedMirror<T>(userId: string, token: string, path: string): Promise<T | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_MIRROR, "readonly");
  const row = await idbRequest<
    | {
        mirrorKey: string;
        userId: string;
        envelope: EncryptedEnvelope;
      }
    | undefined
  >(tx.objectStore(STORE_MIRROR).get(mirrorKeyForGet(path)));
  db.close();
  if (!row || row.userId !== userId) return null;
  const key = await deriveUserDataKey(userId, token);
  try {
    return await decryptJson<T>(key, row.envelope);
  } catch {
    return null;
  }
}

export async function addPendingSyncItem(
  userId: string,
  token: string,
  item: PendingSyncItem,
): Promise<void> {
  const key = await deriveUserDataKey(userId, token);
  const env = await encryptJson(key, item);
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  tx.objectStore(STORE_PENDING).put({
    id: item.id,
    userId,
    envelope: env,
  });
  await txComplete(tx);
  db.close();
}

export async function listPendingSyncItems(userId: string, token: string): Promise<PendingSyncItem[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readonly");
  const store = tx.objectStore(STORE_PENDING);
  const all = await idbRequest<{ id: string; userId: string; envelope: EncryptedEnvelope }[]>(store.getAll());
  db.close();
  const key = await deriveUserDataKey(userId, token);
  const out: PendingSyncItem[] = [];
  for (const row of all) {
    if (row.userId !== userId) continue;
    try {
      out.push(await decryptJson<PendingSyncItem>(key, row.envelope));
    } catch {
      /* skip corrupt */
    }
  }
  out.sort((a, b) => a.queuedAt - b.queuedAt);
  return out;
}

export async function removePendingSyncItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING, "readwrite");
  tx.objectStore(STORE_PENDING).delete(id);
  await txComplete(tx);
  db.close();
}

export async function addConflictRecord(
  userId: string,
  token: string,
  record: OfflineConflictRecord,
): Promise<void> {
  const key = await deriveUserDataKey(userId, token);
  const env = await encryptJson(key, record);
  const db = await openDb();
  const tx = db.transaction(STORE_CONFLICTS, "readwrite");
  tx.objectStore(STORE_CONFLICTS).put({
    id: record.id,
    userId,
    envelope: env,
  });
  await txComplete(tx);
  db.close();
}

export async function listConflictRecords(userId: string, token: string): Promise<OfflineConflictRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONFLICTS, "readonly");
  const rows = await idbRequest<{ id: string; userId: string; envelope: EncryptedEnvelope }[]>(
    tx.objectStore(STORE_CONFLICTS).getAll(),
  );
  db.close();
  const key = await deriveUserDataKey(userId, token);
  const out: OfflineConflictRecord[] = [];
  for (const row of rows) {
    if (row.userId !== userId) continue;
    try {
      out.push(await decryptJson<OfflineConflictRecord>(key, row.envelope));
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export async function removeConflictRecord(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONFLICTS, "readwrite");
  tx.objectStore(STORE_CONFLICTS).delete(id);
  await txComplete(tx);
  db.close();
}

/** Logout / security: wipe all offline stores for every user scope on this device. */
export async function clearAllOfflineIndexedDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
