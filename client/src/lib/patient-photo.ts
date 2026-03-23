import type { Patient } from "@shared/schema";
import { getPublicAssetOrigin } from "@/lib/dev-api-origin";

/**
 * Ensure patient JSON from the API uses camelCase fields the UI expects.
 * (Defensive: some stacks may surface snake_case keys.)
 */
export function normalizePatientRow(row: unknown): Patient {
  const r = row as Record<string, unknown>;
  const profilePhotoUrl =
    (typeof r.profilePhotoUrl === "string" ? r.profilePhotoUrl : null) ??
    (typeof r.profile_photo_url === "string" ? r.profile_photo_url : null);

  return {
    ...(r as Patient),
    profilePhotoUrl: profilePhotoUrl ?? null,
  };
}

/**
 * Full URL for <img src> so the browser always loads from the app origin,
 * with a cache-bust param so the avatar remounts after a new upload.
 */
export function profileImageDisplaySrc(profilePhotoUrl: string | null | undefined): string | undefined {
  if (!profilePhotoUrl?.trim()) return undefined;
  const path = profilePhotoUrl.trim();
  const origin = typeof window !== "undefined" ? getPublicAssetOrigin() : "";
  const absolute = path.startsWith("http") ? path : `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  const tag = path.split("/").filter(Boolean).pop() ?? "photo";
  const sep = absolute.includes("?") ? "&" : "?";
  return `${absolute}${sep}cb=${encodeURIComponent(tag)}`;
}
