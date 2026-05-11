/**
 * EHR service worker: precached app shell, cache-first static/fonts, network-first API
 * with offline fallback to cached API responses. Auth token is never stored here — only
 * anonymous Request/Response pairs in the Cache API (client clears API cache on logout).
 */
/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

const API_CACHE = "ehr-api-v1";
const STATIC_CACHE = "ehr-static-v1";
const FONT_CACHE = "ehr-fonts-v1";

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/** SPA navigations: serve shell; never treat API or uploads as client routes. */
const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /^\/uploads\//],
  }),
);

/** API: network-first, fall back to cache when offline (GET/HEAD only are cached by plugin below). */
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/api/auth/") &&
    (request.method === "GET" || request.method === "HEAD"),
  new NetworkFirst({
    cacheName: API_CACHE,
    networkTimeoutSeconds: 8,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (response.status === 200) return response;
          return null;
        },
      },
      new ExpirationPlugin({ maxEntries: 120, purgeOnQuotaError: true }),
    ],
  }),
);

/** Same-origin static assets (bundled JS/CSS, images). */
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    (request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "image" ||
      request.destination === "font"),
  new CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 80, purgeOnQuotaError: true })],
  }),
);

/** Google Fonts — cache-first (no PHI). */
registerRoute(
  ({ url }) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i.test(url.href),
  new CacheFirst({
    cacheName: FONT_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 32, purgeOnQuotaError: true })],
  }),
);

/** Background Sync: tell clients to flush IndexedDB queue (tokens stay in the page, not in SW). */
self.addEventListener("sync", (event: Event) => {
  const se = event as ExtendableEvent & { tag: string };
  if (se.tag === "ehr-offline-sync") {
    se.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const c of clients) {
          c.postMessage({ type: "EHR_RUN_OFFLINE_FLUSH" } satisfies SwToClientMessage);
        }
      }),
    );
  }
});

export type SwToClientMessage = { type: "EHR_RUN_OFFLINE_FLUSH" };
export type ClientToSwMessage =
  | { type: "EHR_CLEAR_API_CACHE" }
  | { type: "EHR_SKIP_WAITING" };

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as ClientToSwMessage | undefined;
  if (!data || typeof data !== "object") return;
  if (data.type === "EHR_CLEAR_API_CACHE") {
    event.waitUntil(
      caches.delete(API_CACHE).then(() => {
        event.source?.postMessage({ type: "EHR_API_CACHE_CLEARED" });
      }),
    );
  }
  if (data.type === "EHR_SKIP_WAITING") {
    void self.skipWaiting();
  }
});
