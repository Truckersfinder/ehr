import { useQuery } from "@tanstack/react-query";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

type FacilityBillingSettings = {
  facilityId: string | null;
  billingCurrency: string;
  canEdit: boolean;
};

export function useBillingCurrency(token: string | null) {
  const { data, isLoading } = useQuery<FacilityBillingSettings>({
    queryKey: queryKeys.facilityBillingSettings.root,
    queryFn: () => apiGetJson<FacilityBillingSettings>("/api/facility/billing-settings", token),
    enabled: !!token,
    staleTime: 60_000,
  });

  return {
    currencyCode: data?.billingCurrency ?? "KES",
    isLoading,
  };
}

