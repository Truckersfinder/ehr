/**
 * AES-GCM encryption for IndexedDB payloads. Key material is derived from the logged-in
 * staff user id + bearer token so ciphertext is not portable across accounts on the same device.
 * Offline-specific: differs from online-only flows which never persist response bodies locally.
 */
export async function deriveUserDataKey(userId: string, bearerToken: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${userId}\u0000${bearerToken}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type EncryptedEnvelope = { ivB64: string; ciphertextB64: string };

export async function encryptJson(key: CryptoKey, payload: unknown): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ivB64: toB64(iv), ciphertextB64: toB64(ciphertext) };
}

export async function decryptJson<T>(key: CryptoKey, env: EncryptedEnvelope): Promise<T> {
  const iv = fromB64(env.ivB64);
  const ciphertext = fromB64(env.ciphertextB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
