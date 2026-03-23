/**
 * When the UI is not served from the same host:port as the Express API, relative `/api`
 * and `/uploads` fetch() calls would hit the wrong server and return HTML.
 */
import { getApiOrigin, isSameDevServerAsApi } from "@/lib/dev-api-origin";

export function installDevApiFetchShim(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  if (isSameDevServerAsApi()) return;

  const apiOrigin = getApiOrigin();

  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof input === "string") {
      if (input.startsWith("/api") || input.startsWith("/uploads")) {
        return orig(apiOrigin + input, {
          ...init,
          credentials: init?.credentials ?? "include",
        });
      }
      return orig(input, init);
    }

    if (input instanceof URL) {
      if (input.pathname.startsWith("/api") || input.pathname.startsWith("/uploads")) {
        const target = apiOrigin + input.pathname + input.search + input.hash;
        return orig(target, { ...init, credentials: init?.credentials ?? "include" });
      }
      return orig(input, init);
    }

    if (input instanceof Request) {
      const u = new URL(input.url);
      if (u.origin === window.location.origin && (u.pathname.startsWith("/api") || u.pathname.startsWith("/uploads"))) {
        const target = apiOrigin + u.pathname + u.search + u.hash;
        return orig(new Request(target, input), init);
      }
    }

    return orig(input, init);
  };
}
