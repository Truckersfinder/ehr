import { useAuth } from "@/lib/auth";

/** Organization-wide labels and defaults from `/api/auth/me` (facility settings). */
export function useOrganizationSettings() {
  const { user } = useAuth();
  const o = user?.organization;
  return {
    patientIdentifierLabel: o?.patientIdentifierLabel?.trim() || "MRN",
    defaultCountry: o?.defaultCountry?.trim() || "",
    billingCurrency: o?.billingCurrency?.trim() || "KES",
    organizationName: o?.name?.trim() || "Pin Point Health",
    logoUrl: o?.logoUrl ?? null,
  };
}
