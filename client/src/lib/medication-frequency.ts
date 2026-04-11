/**
 * Best-effort parsing of medication frequency strings into an interval in minutes.
 * Supports our common option set plus typical free-text patterns.
 */
export function frequencyToIntervalMinutes(frequencyRaw: string | null | undefined): number | null {
  const f = String(frequencyRaw ?? "").trim().toLowerCase();
  if (!f) return null;

  // Common named patterns.
  if (f === "once daily" || f === "daily" || f === "qd") return 24 * 60;
  if (f === "twice daily" || f === "bid") return 12 * 60;
  if (f === "three times daily" || f === "tid") return 8 * 60;
  if (f === "four times daily" || f === "qid") return 6 * 60;

  // "every X hours" / "qXh"
  const everyHours = f.match(/every\s+(\d+)\s*(hour|hours|hr|hrs|h)\b/);
  if (everyHours?.[1]) {
    const n = Number(everyHours[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 60);
  }
  const qxh = f.match(/\bq\s*(\d+)\s*h\b/);
  if (qxh?.[1]) {
    const n = Number(qxh[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 60);
  }

  // "every X minutes"
  const everyMin = f.match(/every\s+(\d+)\s*(minute|minutes|min|mins|m)\b/);
  if (everyMin?.[1]) {
    const n = Number(everyMin[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }

  // "once weekly" (not ideal for timers, but support)
  if (f.includes("weekly")) return 7 * 24 * 60;

  return null;
}

