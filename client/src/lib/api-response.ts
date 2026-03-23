/**
 * Read fetch Response as JSON. Detects HTML error pages (SPA fallback) which cause
 * "Unexpected token '<'" when JSON.parse runs on <!DOCTYPE...>.
 */
export async function readApiJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<")) {
    throw new Error(
      "The server returned a web page instead of API data. Open the app at http://127.0.0.1:3000 (run `npm run dev` in the project). If you use the Vite dev server on port 5173, keep the API running on port 3000 in another terminal — requests are forwarded automatically.",
    );
  }
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "Invalid JSON from server" : "Request failed");
  }
  if (!res.ok) {
    const msg = (data as { message?: string }).message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}
