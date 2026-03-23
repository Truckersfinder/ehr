/**
 * Where the Express API (and /uploads static files) live in local development.
 * Override with VITE_API_ORIGIN in .env (e.g. http://127.0.0.1:3000).
 */
export function getApiOrigin(): string {
  return (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
}

/** True when the page is served by Express on the same port as the API (integrated `npm run dev`). */
export function isSameDevServerAsApi(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.DEV) return true;

  const api = new URL(getApiOrigin());
  const loc = window.location;
  if (!loc.protocol.startsWith("http")) return false;

  const locPort = loc.port || (loc.protocol === "https:" ? "443" : "80");
  const apiPort = api.port || (api.protocol === "https:" ? "443" : "80");

  if (loc.origin === api.origin) return true;

  const isLocal = (h: string) => h === "localhost" || h === "127.0.0.1";
  if (isLocal(loc.hostname) && isLocal(api.hostname) && locPort === apiPort) return true;

  return false;
}

/**
 * Origin to use for `/uploads/...` and other public assets served by Express.
 * When the UI runs on another port (Vite, Cursor preview), this must be the API origin.
 */
export function getPublicAssetOrigin(): string {
  if (typeof window === "undefined") return "";
  if (!import.meta.env.DEV) return window.location.origin;
  if (isSameDevServerAsApi()) return window.location.origin;
  return getApiOrigin();
}
