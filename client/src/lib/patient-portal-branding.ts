import { useQuery } from "@tanstack/react-query";

export const PATIENT_PORTAL_BRANDING_QUERY_KEY = ["/api/patient-portal/branding"] as const;

export type PatientPortalBrandingResponse = {
  organizationName: string;
  welcomeMessage?: string;
};

/** Product wordmark on staff surfaces (distinct from facility name in Admin / portal branding API). */
export const APP_PRODUCT_DISPLAY_NAME = "Imani EHR";

/** Public branding (facility name from Admin). Shared query key so React Query dedupes across login, portal, and public forms. */
export function usePatientPortalBranding() {
  return useQuery({
    queryKey: PATIENT_PORTAL_BRANDING_QUERY_KEY,
    queryFn: async (): Promise<PatientPortalBrandingResponse> => {
      const res = await fetch("/api/patient-portal/branding");
      if (!res.ok) throw new Error("branding");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** When the branding API has not loaded or failed; matches server default after env + DB. */
export function publicOrganizationNameFallback(): string {
  return "Imani";
}
