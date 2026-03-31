import { apiGetJson } from "@/lib/api-client";
import type { EmergencyContactRelationshipOption } from "@shared/emergency-contact-relationships";

export const EMERGENCY_CONTACT_RELATIONSHIPS_QUERY_KEY = ["/api/emergency-contact-relationships"] as const;

export async function fetchEmergencyContactRelationships(): Promise<EmergencyContactRelationshipOption[]> {
  return apiGetJson<EmergencyContactRelationshipOption[]>("/api/emergency-contact-relationships", null);
}

