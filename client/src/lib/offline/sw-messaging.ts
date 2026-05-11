/**
 * Ask the service worker to drop cached API responses (no auth tokens are stored there, but PHI
 * may be present in JSON bodies — cleared on logout alongside IndexedDB).
 */
export async function postMessageClearApiCacheToServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "EHR_CLEAR_API_CACHE" });
  } catch {
    /* ignore */
  }
}
