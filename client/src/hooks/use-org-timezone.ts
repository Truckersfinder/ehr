import { useAuth } from "@/lib/auth";
import { normalizeOrgTimeZone } from "@/lib/org-timezone";

export function useOrgTimeZone(): string {
  const { user } = useAuth();
  return normalizeOrgTimeZone(user?.organization?.timeZone);
}

