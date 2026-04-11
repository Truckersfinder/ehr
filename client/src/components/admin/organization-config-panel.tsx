import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGetJson, apiPatchJson } from "@/lib/api-client";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BILLING_CURRENCY_CODES, billingCurrencyLabel } from "@shared/billing-currencies";
import { Building2, Globe } from "lucide-react";

type OrgApi = {
  id: string;
  name: string;
  code: string;
  billingCurrency: string;
  patientIdentifierLabel: string;
  country: string;
  timeZone: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type CountryRow = { code: string; name: string };

export function OrganizationConfigPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/facility/organization-settings"],
    queryFn: () => apiGetJson<OrgApi>("/api/facility/organization-settings", token!),
    enabled: !!token,
  });

  const { data: countries = [] } = useQuery({
    queryKey: ["/api/countries"],
    queryFn: () => apiGetJson<CountryRow[]>("/api/countries", token!),
    enabled: !!token,
  });

  const [name, setName] = useState("");
  const [billingCurrency, setBillingCurrency] = useState("KES");
  const [patientIdentifierLabel, setPatientIdentifierLabel] = useState("MRN");
  const [country, setCountry] = useState("KE");
  const [timeZone, setTimeZone] = useState("UTC");

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setBillingCurrency(data.billingCurrency || "KES");
    setPatientIdentifierLabel(data.patientIdentifierLabel || "MRN");
    setCountry(data.country || "KE");
    setTimeZone(data.timeZone || "UTC");
  }, [data]);

  const timeZones = (() => {
    try {
      // Modern browsers: returns IANA zone names (e.g., "Africa/Nairobi").
      const anyIntl = Intl as any;
      const tzs = typeof anyIntl?.supportedValuesOf === "function" ? (anyIntl.supportedValuesOf("timeZone") as string[]) : [];
      return tzs.length ? tzs : ["UTC"];
    } catch {
      return ["UTC"];
    }
  })();

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPatchJson<OrgApi, Record<string, unknown>>(
        "/api/facility/organization-settings",
        {
          name: name.trim(),
          billingCurrency,
          patientIdentifierLabel: patientIdentifierLabel.trim() || "MRN",
          country,
          timeZone,
        },
        token,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/facility/organization-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Organization updated" });
    },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/facility/organization-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message || "Upload failed");
      }
      return res.json() as Promise<{ logoUrl: string }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/facility/organization-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Logo updated" });
    },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Loading organization…</p>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          <SectionTitleWithHint hint="Currency, patient identifier label, default country, branding, and name apply across the organization.">
            Organization configuration
          </SectionTitleWithHint>
        </h2>
      </div>

      <Tabs defaultValue="profile">
        <SidebarTabsNavLayout
          sidebar={
            <TabsList className={SIDEBAR_TABS_LIST_CLASS} aria-label="Organization configuration sections">
              <TabsTrigger value="profile" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="org-config-tab-profile">
                <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Organization profile
              </TabsTrigger>
              <TabsTrigger value="regional" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="org-config-tab-regional">
                <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden />
                Regional &amp; billing defaults
              </TabsTrigger>
            </TabsList>
          }
        >
          <TabsContent value="profile" className="mt-0 space-y-4 focus-visible:outline-none">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <SectionTitleWithHint hint="Legal or display name and optional logo. Upload JPEG, PNG, GIF, or WebP; shown in the app when configured.">
                    Organization profile
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization name</Label>
                  <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Logo</Label>
                  {data.logoUrl ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={data.logoUrl}
                        alt="Organization logo"
                        className="h-14 w-auto max-w-[200px] object-contain rounded border"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No logo uploaded.</p>
                  )}
                  <div className="relative w-full max-w-md rounded-md focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 focus:outline-none"
                      aria-label="Upload organization logo"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) logoMutation.mutate(f);
                        e.target.value = "";
                      }}
                    />
                    <div className="pointer-events-none flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-center text-sm text-muted-foreground">
                      Choose file — JPEG, PNG, GIF, or WebP
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="regional" className="mt-0 space-y-4 focus-visible:outline-none">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <SectionTitleWithHint hint="Platform currency for billing. Patient identifier label is shown wherever patient identifiers are labeled (e.g. charts, forms). Default country pre-fills country fields for new records where applicable.">
                    Regional &amp; billing defaults
                  </SectionTitleWithHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <div className="space-y-2">
                  <Label>Platform currency</Label>
                  <Select value={billingCurrency} onValueChange={setBillingCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_CURRENCY_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {billingCurrencyLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="patient-id-label">Patient identifier label</Label>
                  <Input
                    id="patient-id-label"
                    value={patientIdentifierLabel}
                    onChange={(e) => setPatientIdentifierLabel(e.target.value)}
                    placeholder="e.g. MRN, Hospital #"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Default country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Time zone</Label>
                  <Select value={timeZone} onValueChange={setTimeZone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {timeZones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Controls how dates and times are displayed across the app for this organization.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </SidebarTabsNavLayout>
      </Tabs>

      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-border/60">
        <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Saving…" : "Save organization settings"}
        </Button>
      </div>
    </div>
  );
}
