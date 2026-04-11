import { formatInTimeZone } from "date-fns-tz";
import { format as formatLocal } from "date-fns";

export type DateLike = string | number | Date | null | undefined;

export function normalizeOrgTimeZone(tz: unknown): string {
  const s = typeof tz === "string" ? tz.trim() : "";
  return s || "UTC";
}

export function toDateOrNull(v: DateLike): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatInOrgTimeZone(v: DateLike, fmt: string, timeZone: string): string {
  const d = toDateOrNull(v);
  if (!d) return "—";
  const tz = normalizeOrgTimeZone(timeZone);
  try {
    return formatInTimeZone(d, tz, fmt);
  } catch {
    // Fallback if tz is invalid or unsupported.
    return formatLocal(d, fmt);
  }
}

