import { assertOfflineUserScope } from "@/lib/offline/offline-idb";
import { handleOfflineStaffWrite, mirrorSuccessfulJsonGet, tryServeMirrorGet } from "@/lib/offline/offline-write-queue";

type Access = () => { token: string | null; userId: string | null };

declare global {
  interface Window {
    __ehrOfflineFetchInstalled?: boolean;
  }
}

let accessGetter: Access = () => ({ token: null, userId: null });

/** Keep latest auth in a ref-like getter so the fetch overlay always sees current credentials. */
export function setStaffOfflineAccessGetter(get: Access): void {
  accessGetter = get;
}

function shouldBypassOfflineHandling(url: URL, method: string, headers: Headers): boolean {
  if (!url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/api/auth/")) return true;
  if (url.pathname.startsWith("/api/patient-portal")) return true;
  if (url.pathname.startsWith("/api/public/")) return true;
  if (url.pathname === "/api/upload" || url.pathname.startsWith("/api/upload")) return true;
  const auth = headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return true;
  const ct = headers.get("content-type") || "";
  if (method !== "GET" && method !== "HEAD" && ct.includes("multipart/form-data")) return true;
  return false;
}

/**
 * Installs a single global fetch wrapper for staff Bearer requests: mirrors successful JSON GETs
 * into encrypted IndexedDB, serves encrypted mirrors when the network is down, and queues writes.
 * Offline-specific: diverges from the default browser fetch pipeline only for these cases.
 */
export function installStaffOfflineFetchOverlayOnce(): void {
  if (typeof window === "undefined" || window.__ehrOfflineFetchInstalled) return;
  window.__ehrOfflineFetchInstalled = true;

  const native = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url, self.location?.origin ?? window.location.origin);
    const method = (req.method || "GET").toUpperCase();
    const { token, userId } = accessGetter();

    if (shouldBypassOfflineHandling(url, method, req.headers)) {
      return native(input, init);
    }

    const path = url.pathname + (url.search || "");

    if ((method === "GET" || method === "HEAD") && token && userId) {
      try {
        const res = await native(input, init);
        if (method === "GET" && res.ok) {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            void mirrorSuccessfulJsonGet(path, userId, token, res.clone());
          }
        }
        return res;
      } catch {
        if (method === "GET" && token && userId) {
          const mirrorRes = await tryServeMirrorGet(path, userId, token);
          if (mirrorRes) return mirrorRes;
        }
        throw new Error("OFFLINE_NO_MIRROR");
      }
    }

    if (!navigator.onLine && token && userId && ["POST", "PATCH", "PUT"].includes(method)) {
      let body: unknown = undefined;
      if (method !== "GET" && method !== "HEAD") {
        const text = await req.clone().text();
        body = text ? JSON.parse(text) : undefined;
      }
      return handleOfflineStaffWrite({
        path,
        method: method as "POST" | "PATCH" | "PUT",
        body,
        userId,
        token,
      });
    }

    const res = await native(input, init);
    if (method === "GET" && res.ok && token && userId) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        void mirrorSuccessfulJsonGet(path, userId, token, res.clone());
      }
    }
    return res;
  };
}

export function notifyOfflineUserBinding(userId: string): void {
  sessionStorage.setItem("ehr_offline_user_id", userId);
  void assertOfflineUserScope(userId);
}

export function clearOfflineUserBinding(): void {
  sessionStorage.removeItem("ehr_offline_user_id");
}
