import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiGetJson, apiPatchJson, apiPostFormData, apiPostJson } from "@/lib/api-client";
import { useBillingCurrency } from "@/lib/currency";
import { queryKeys } from "@/lib/query-keys";
import { queryClient } from "@/lib/queryClient";
import type { BillingChargeCatalog } from "@shared/schema";
import { BILLING_CURRENCY_CODES, billingCurrencyLabel } from "@shared/billing-currencies";
import { Upload } from "lucide-react";

type FacilityBillingSettings = { facilityId: string | null; billingCurrency: string; canEdit: boolean };

function normalizeChargeCategory(cat: unknown): string {
  return String(cat ?? "")
    .trim()
    .toLowerCase();
}

const CATEGORY_ORDER = [
  "lab_order",
  "medication",
  "imaging",
  "problem_list",
  "clinical_charge",
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  lab_order: "Lab orders",
  medication: "Medication orders",
  imaging: "Imaging orders",
  problem_list: "Problem list",
  clinical_charge: "Clinical charges",
};

function CategoryExcelUploadButton({
  category,
  token,
  onDone,
}: {
  category: (typeof CATEGORY_ORDER)[number];
  token: string | null;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiPostFormData<{ ok: boolean; count: number }>(
        `/api/billing/charge-catalog/upload/${category}`,
        fd,
        token,
      );
      toast({
        title: "Price list replaced",
        description: `${res.count} item(s) imported for ${CATEGORY_LABELS[category]}.`,
      });
      onDone();
    } catch (err) {
      toast({
        title: "Import failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="sr-only"
        onChange={onFile}
        aria-label={`Upload Excel for ${CATEGORY_LABELS[category]}`}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5"
        data-testid={`upload-excel-${category}`}
      >
        <Upload className="w-3.5 h-3.5" />
        {uploading ? "Uploading…" : "Upload Excel"}
      </Button>
    </>
  );
}

function ChargeRow({
  row,
  token,
  currencyCode,
  onSaved,
}: {
  row: BillingChargeCatalog;
  token: string | null;
  currencyCode: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [price, setPrice] = useState(String(row.unitPrice ?? "0"));
  const [label, setLabel] = useState(row.label);

  useEffect(() => {
    setPrice(String(row.unitPrice ?? "0"));
    setLabel(row.label);
  }, [row.id, row.unitPrice, row.label]);

  const patchMutation = useMutation({
    mutationFn: () =>
      apiPatchJson<BillingChargeCatalog, { unitPrice: string; label?: string }>(
        `/api/billing/charge-catalog/${row.id}`,
        { unitPrice: price.trim(), label: label.trim() },
        token,
      ),
    onSuccess: () => {
      toast({ title: "Saved", description: row.label });
      onSaved();
    },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const dirty =
    price.trim() !== String(row.unitPrice ?? "0").trim() || label.trim() !== row.label.trim();

  return (
    <TableRow data-testid={`charge-row-${row.id}`}>
      <TableCell className="min-w-[12rem] max-w-[min(28rem,55vw)]">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 text-sm"
          aria-label={`Label for ${row.itemKey}`}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">{row.itemKey}</TableCell>
      <TableCell className="w-[10rem]">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground shrink-0">{currencyCode}</span>
          <Input
            type="number"
            min={0}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-9 text-sm"
            data-testid={`charge-price-${row.id}`}
          />
        </div>
      </TableCell>
      <TableCell className="w-[6rem] text-right">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!dirty || patchMutation.isPending}
          onClick={() => patchMutation.mutate()}
        >
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function BillingChargeCatalogPanel({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<(typeof CATEGORY_ORDER)[number]>("lab_order");
  const [addItemKey, setAddItemKey] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const { data: billingSettings, isLoading: billingSettingsLoading } = useQuery<FacilityBillingSettings>({
    queryKey: queryKeys.facilityBillingSettings.root,
    queryFn: () => apiGetJson<FacilityBillingSettings>("/api/facility/billing-settings", token),
    enabled: !!token,
  });

  const { currencyCode } = useBillingCurrency(token);

  const patchCurrencyMutation = useMutation({
    mutationFn: (billingCurrency: string) =>
      apiPatchJson<FacilityBillingSettings, { billingCurrency: string }>(
        "/api/facility/billing-settings",
        { billingCurrency },
        token,
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.facilityBillingSettings.root });
      toast({
        title: "Currency updated",
        description: `Catalog amounts are labeled in ${data.billingCurrency}.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Could not update currency", description: e.message, variant: "destructive" }),
  });

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
  } = useQuery<BillingChargeCatalog[]>({
    queryKey: queryKeys.billingChargeCatalog.root,
    queryFn: () => apiGetJson<BillingChargeCatalog[]>("/api/billing/charge-catalog", token),
    enabled: !!token,
  });

  const byCategory = useMemo(() => {
    const m = new Map<string, BillingChargeCatalog[]>();
    for (const c of CATEGORY_ORDER) m.set(c, []);
    for (const r of rows) {
      const cat = normalizeChargeCategory(r.category);
      const list = m.get(cat) ?? [];
      list.push(r);
      m.set(cat, list);
    }
    for (const c of CATEGORY_ORDER) {
      m.set(c, (m.get(c) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)));
    }
    return m;
  }, [rows]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.billingChargeCatalog.root });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiPostJson<BillingChargeCatalog, Record<string, unknown>>(
        "/api/billing/charge-catalog",
        {
          category: addCategory,
          itemKey: addItemKey.trim(),
          label: addLabel.trim(),
          unitPrice: addPrice.trim(),
        },
        token,
      ),
    onSuccess: () => {
      toast({ title: "Item added" });
      setAddOpen(false);
      setAddItemKey("");
      setAddLabel("");
      setAddPrice("");
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Could not add item", description: e.message, variant: "destructive" }),
  });

  if (!token) {
    return (
      <div className="space-y-3 mt-1">
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="billing-charge-catalog">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="text-sm text-muted-foreground space-y-1 max-w-3xl">
          <p>
            <strong className="text-foreground font-medium">Excel import:</strong> each section has its own Upload Excel button.
            Upload replaces <em>all</em> prices in that category. Use a header row with columns such as{" "}
            <span className="font-mono text-xs">Item key</span>, <span className="font-mono text-xs">Item</span> (or Label), and{" "}
            <span className="font-mono text-xs">Price</span> (or <span className="font-mono text-xs">unit_price</span>).
          </p>
        </div>
        <div className="space-y-2 shrink-0 w-full sm:w-auto sm:min-w-[22rem] sm:ml-auto sm:text-right">
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <Label htmlFor="facility-billing-currency" className="whitespace-nowrap">
              Catalog currency
            </Label>
            <Select
              value={currencyCode}
              disabled={billingSettingsLoading || !billingSettings?.canEdit || patchCurrencyMutation.isPending}
              onValueChange={(v) => patchCurrencyMutation.mutate(v)}
            >
              <SelectTrigger
                id="facility-billing-currency"
                data-testid="facility-billing-currency"
                className="w-[16.5rem]"
              >
                <SelectValue placeholder="Currency" />
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
          {!billingSettings?.facilityId ? (
            <p className="text-xs text-muted-foreground">Link your user to a facility to set catalog currency (defaults to KES).</p>
          ) : null}
        </div>
      </div>

      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error)?.message || "Could not load charge catalog."}
        </p>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        CATEGORY_ORDER.map((cat) => (
          <Card key={cat} data-testid={`charge-section-${cat}`}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">
                <SectionTitleWithHint
                  hint={`Prices for ${CATEGORY_LABELS[cat]}. Use Upload Excel or Add item for this category.`}
                >
                  {CATEGORY_LABELS[cat]}
                </SectionTitleWithHint>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryExcelUploadButton category={cat} token={token} onDone={invalidate} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddCategory(cat);
                    setAddOpen(true);
                  }}
                >
                  Add item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:px-6 pb-4">
              {(byCategory.get(cat) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 px-1">No items in this category yet.</p>
              ) : (
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="whitespace-nowrap">Key</TableHead>
                        <TableHead>Price ({currencyCode})</TableHead>
                        <TableHead className="text-right w-[6rem]"> </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(byCategory.get(cat) ?? []).map((row) => (
                        <ChargeRow
                          key={row.id}
                          row={row}
                          token={token}
                          currencyCode={currencyCode}
                          onSaved={invalidate}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add charge item</DialogTitle>
            <DialogDescription>
              Use a short key (letters, numbers, underscores). It must be unique within the category.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={addCategory} onValueChange={(v) => setAddCategory(v as (typeof CATEGORY_ORDER)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-item-key">Item key</Label>
              <Input
                id="add-item-key"
                value={addItemKey}
                onChange={(e) => setAddItemKey(e.target.value)}
                placeholder="e.g. custom_lab_panel"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-label">Display name</Label>
              <Input
                id="add-label"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="Shown on invoices and pickers"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-price">Unit price ({currencyCode})</Label>
              <Input
                id="add-price"
                type="number"
                min={0}
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                createMutation.isPending ||
                !addItemKey.trim() ||
                !addLabel.trim() ||
                !addPrice.trim()
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
