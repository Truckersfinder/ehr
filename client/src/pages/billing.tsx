import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiGetJson, apiPatchJson } from "@/lib/api-client";
import { useBillingCurrency } from "@/lib/currency";
import { queryKeys } from "@/lib/query-keys";
import { Receipt, CreditCard, Banknote, Tags, Clock, CircleCheck, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { BillingChargeCatalogPanel } from "@/components/billing-charge-catalog-panel";
import { BillingTodaysVisitsTab, type BillingTodaysVisitRow } from "@/components/billing-todays-visits-tab";
import { format, parse, startOfDay, endOfDay } from "date-fns";
import type { Invoice, Patient } from "@shared/schema";
import { useLocation } from "wouter";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";

function canManageChargeCatalog(role: string | undefined) {
  return role === "super_admin";
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, token } = useAuth();
  const [location, setLocation] = useLocation();
  const showPricingTab = canManageChargeCatalog(user?.role);
  const canViewRevenue = canManageChargeCatalog(user?.role);
  const [activeTab, setActiveTab] = useState<"todays-visit" | "pending" | "paid" | "pricing">("todays-visit");
  const [deepLinkInvoiceId, setDeepLinkInvoiceId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [visitsDay, setVisitsDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [revStart, setRevStart] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [revEnd, setRevEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: queryKeys.invoices.root,
    queryFn: () => apiGetJson<Invoice[]>("/api/invoices", token),
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.root,
    queryFn: () => apiGetJson<Patient[]>("/api/patients", token),
  });

  const { currencyCode } = useBillingCurrency(token);

  const revenueBounds = useMemo(() => {
    const s = parse(revStart, "yyyy-MM-dd", new Date());
    const e = parse(revEnd, "yyyy-MM-dd", new Date());
    return {
      start: startOfDay(s).toISOString(),
      end: endOfDay(e).toISOString(),
    };
  }, [revStart, revEnd]);

  const { data: revenueStats } = useQuery<{ revenue: number; outstanding: number }>({
    queryKey: ["/api/billing/revenue-stats", revenueBounds.start, revenueBounds.end],
    queryFn: () =>
      apiGetJson<{ revenue: number; outstanding: number }>(
        `/api/billing/revenue-stats?start=${encodeURIComponent(revenueBounds.start)}&end=${encodeURIComponent(revenueBounds.end)}`,
        token,
      ),
    enabled: !!token && canViewRevenue,
  });

  /** Same local-day bounds as Schedule (`startOfDay` / `endOfDay`), so appointments match when changing the date. */
  const visitsDayBounds = useMemo(() => {
    const d = parse(visitsDay, "yyyy-MM-dd", new Date());
    return {
      start: startOfDay(d).toISOString(),
      end: endOfDay(d).toISOString(),
    };
  }, [visitsDay]);

  const {
    data: todaysVisits = [],
    isLoading: todaysVisitsLoading,
    isError: todaysVisitsError,
    error: todaysVisitsErr,
  } = useQuery<BillingTodaysVisitRow[]>({
    queryKey: queryKeys.billing.todaysVisits(visitsDay),
    queryFn: () =>
      apiGetJson<BillingTodaysVisitRow[]>(
        `/api/billing/todays-visits?start=${encodeURIComponent(visitsDayBounds.start)}&end=${encodeURIComponent(visitsDayBounds.end)}`,
        token,
      ),
    enabled: !!token,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const visitsDayLabel = useMemo(() => {
    try {
      return format(new Date(`${visitsDay}T00:00:00`), "MMM d, yyyy");
    } catch {
      return visitsDay;
    }
  }, [visitsDay]);

  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const payMutation = useMutation({
    mutationFn: async ({ id, amount, method }: { id: string; amount: number; method: string }) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv) throw new Error("Invoice not found");
      const newPaid = Number(inv.paidAmount || 0) + amount;
      const newStatus = newPaid >= Number(inv.totalAmount) ? "paid" : "partial";
      return apiPatchJson<Invoice>(`/api/invoices/${id}`, {
        paidAmount: String(newPaid),
        status: newStatus,
        paymentMethod: method,
      }, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.root });
      toast({ title: "Payment recorded" });
      setPayOpen(null);
    },
    onError: () => toast({ title: "Error", description: "Failed to record payment", variant: "destructive" }),
  });

  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending: "bg-chart-4/10 text-chart-4",
    paid: "bg-chart-3/10 text-chart-3",
    partial: "bg-chart-5/10 text-chart-5",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const pending = invoices.filter((i) => i.status === "pending" || i.status === "partial");
  const paid = invoices.filter((i) => i.status === "paid");
  const totalRevenue = invoices.reduce((sum, i) => sum + Number(i.paidAmount || 0), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + (Number(i.totalAmount) - Number(i.paidAmount || 0)), 0);

  /** Deep link from follow-up: /billing?payInvoiceId=... opens payment dialog. */
  useEffect(() => {
    // Always read from the real browser URL (wouter `location` can omit query).
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search || "");
    const id = sp.get("payInvoiceId");
    if (!id) {
      setDeepLinkInvoiceId(null);
      return;
    }
    setDeepLinkInvoiceId(id);
    setActiveTab("pending");
  }, [location]);

  /** Sync Billing tabs into URL so Back restores the previous tab. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search || "");
    const t = sp.get("tab");
    if (!t) return;
    if (t === "todays-visit" || t === "pending" || t === "paid" || t === "pricing") {
      setActiveTab(t);
    }
  }, [location]);

  useEffect(() => {
    if (!token || invoices.length === 0 || !deepLinkInvoiceId) return;
    const inv = invoices.find((x) => x.id === deepLinkInvoiceId);
    if (!inv) return;
    const balance = Number(inv.totalAmount) - Number(inv.paidAmount || 0);
    if (balance <= 0) return;
    setPayOpen(inv.id);
    setPayAmount(String(balance));
    // Scroll to the invoice card in the Pending Payment list.
    setTimeout(() => {
      try {
        const el = document.querySelector(`[data-testid="card-invoice-${inv.id}"]`);
        if (el && "scrollIntoView" in el) (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // ignore
      }
    }, 50);
    // Strip param so refresh doesn't keep reopening.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("payInvoiceId");
      window.history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""));
    } catch {
      // ignore
    }
    setDeepLinkInvoiceId(null);
  }, [token, invoices, deepLinkInvoiceId]);

  const renderInvoice = (inv: Invoice, showPay = false) => {
    const pt = patientMap.get(inv.patientId);
    const items = typeof inv.items === "string" ? JSON.parse(inv.items) : inv.items;
    const balance = Number(inv.totalAmount) - Number(inv.paidAmount || 0);
    return (
      <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">{pt ? `${pt.firstName} ${pt.lastName}` : "Unknown"}</p>
                <Badge variant="secondary" className={`text-[10px] ${statusColors[inv.status]}`}>{inv.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {inv.createdAt ? format(new Date(inv.createdAt), "MMM d, yyyy") : ""}
                {inv.paymentMethod && ` - ${inv.paymentMethod.toUpperCase()}`}
              </p>
              {Array.isArray(items) && (
                <div className="mt-2 space-y-0.5">
                  {items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.description}</span>
                      <span>
                        {currencyCode} {Number(item.amount).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t text-sm">
                <span>
                  Total: {currencyCode} {Number(inv.totalAmount).toLocaleString()}
                </span>
                <span className="font-medium">
                  Balance: {currencyCode} {balance.toLocaleString()}
                </span>
              </div>
            </div>
            {showPay && balance > 0 && (
              <Button size="sm" onClick={() => { setPayOpen(inv.id); setPayAmount(String(balance)); }} data-testid={`button-pay-${inv.id}`}>
                <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Pay
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" data-testid="billing-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <SectionTitleWithHint hint={t("pages.billing.titleHint", { count: pending.length })}>
            {t("pages.billing.title")}
          </SectionTitleWithHint>
        </h1>
      </div>

      {canViewRevenue ? (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium">Revenue & balance</p>
                <p className="text-xs text-muted-foreground">Pick a date range to calculate revenue and outstanding balance.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">Start</Label>
                  <Input type="date" value={revStart} onChange={(e) => setRevStart(e.target.value)} className="h-9 w-[10.5rem]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End</Label>
                  <Input type="date" value={revEnd} onChange={(e) => setRevEnd(e.target.value)} className="h-9 w-[10.5rem]" />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Revenue (paid)</p>
                  <p className="text-xl font-bold" data-testid="stat-range-revenue">
                    {currencyCode} {Number(revenueStats?.revenue ?? 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/60">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Outstanding balance</p>
                  <p className="text-xl font-bold" data-testid="stat-range-outstanding">
                    {currencyCode} {Number(revenueStats?.outstanding ?? 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const next = v as "todays-visit" | "pending" | "paid" | "pricing";
          setActiveTab(next);
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", next);
            setLocation(url.pathname + url.search);
          } catch {
            // ignore
          }
        }}
      >
        <SidebarTabsNavLayout
          sidebar={
            <TabsList className={SIDEBAR_TABS_LIST_CLASS}>
              <TabsTrigger value="todays-visit" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-todays-visit">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                Today&apos;s visit ({todaysVisits.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-pending">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Pending Payment ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="paid" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-paid">
                <CircleCheck className="w-3.5 h-3.5 shrink-0" />
                Paid ({paid.length})
              </TabsTrigger>
              {showPricingTab ? (
                <TabsTrigger value="pricing" className={SIDEBAR_TABS_TRIGGER_CLASS} data-testid="tab-pricing">
                  <Tags className="w-3.5 h-3.5 shrink-0" />
                  Pricing
                </TabsTrigger>
              ) : null}
            </TabsList>
          }
        >
        <TabsContent value="todays-visit" className="mt-0 space-y-4 focus-visible:outline-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Visits for {visitsDayLabel}</p>
              <p className="text-xs text-muted-foreground">Use the arrows or pick a date.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  const d = new Date(`${visitsDay}T00:00:00`);
                  d.setDate(d.getDate() - 1);
                  setVisitsDay(format(d, "yyyy-MM-dd"));
                }}
                aria-label="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Button>
              <Input
                type="date"
                value={visitsDay}
                onChange={(e) => setVisitsDay(e.target.value)}
                className="h-9 w-[10.5rem]"
                data-testid="billing-visits-day"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  const d = new Date(`${visitsDay}T00:00:00`);
                  d.setDate(d.getDate() + 1);
                  setVisitsDay(format(d, "yyyy-MM-dd"));
                }}
                aria-label="Next day"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <BillingTodaysVisitsTab
            rows={todaysVisits}
            isLoading={!!token && todaysVisitsLoading}
            isError={todaysVisitsError}
            error={todaysVisitsErr instanceof Error ? todaysVisitsErr : null}
          />
        </TabsContent>

        <TabsContent value="pending" className="mt-0 space-y-4 focus-visible:outline-none">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          ) : pending.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No pending invoices</CardContent></Card>
          ) : pending.map((inv) => renderInvoice(inv, true))}
        </TabsContent>

        <TabsContent value="paid" className="mt-0 space-y-4 focus-visible:outline-none">
          {paid.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No paid invoices yet</CardContent></Card>
          ) : paid.map((inv) => renderInvoice(inv))}
        </TabsContent>

        {showPricingTab ? (
          <TabsContent value="pricing" className="mt-0 space-y-4 focus-visible:outline-none">
            <BillingChargeCatalogPanel token={token} />
          </TabsContent>
        ) : null}
        </SidebarTabsNavLayout>
      </Tabs>

      <Dialog open={!!payOpen} onOpenChange={() => setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (payOpen) payMutation.mutate({ id: payOpen, amount: parseFloat(payAmount), method: payMethod });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount ({currencyCode})</Label>
              <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayOpen(null)}>Cancel</Button>
              <Button type="submit" disabled={payMutation.isPending}>
                {payMutation.isPending ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
