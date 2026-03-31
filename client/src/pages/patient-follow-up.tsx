import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format, startOfDay, addDays, endOfDay } from "date-fns";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { useBillingCurrency } from "@/lib/currency";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Search, PhoneCall, CalendarClock, Banknote, Phone } from "lucide-react";
import { PatientCallDocumentationForm } from "@/components/patient-call-documentation-form";
import type { Appointment, FollowUpContact, ImagingOrder, Invoice, LabOrder, Patient } from "@shared/schema";

type FollowUpRow =
  | {
      kind: "lab";
      createdAt: string;
      patientId: string;
      orderName: string;
      status: LabOrder["status"];
      labOrderId: string;
    }
  | {
      kind: "imaging";
      createdAt: string;
      patientId: string;
      orderName: string;
      status: ImagingOrder["status"];
      modality: string;
      imagingOrderId: string;
    };

function isExternal(v: unknown) {
  return String(v || "").toLowerCase() === "external";
}

function orderCreatedAtIso(v: string | Date | null | undefined): string {
  if (v == null) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

function orderFollowUpKey(r: FollowUpRow): string {
  return r.kind === "lab" ? `lab:${r.labOrderId}` : `img:${r.imagingOrderId}`;
}

export default function PatientFollowUpPage() {
  const [location, navigate] = useLocation();
  const { user, token } = useAuth();
  const { currencyCode } = useBillingCurrency(token);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<
    "patient" | "mrn" | "phone" | "orderDate" | "orderType" | "orderName" | "calledOn"
  >("orderDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [contactRow, setContactRow] = useState<FollowUpRow | null>(null);
  const [contactReasonForCall, setContactReasonForCall] = useState("");
  const [contactOutcome, setContactOutcome] = useState<"picked_up" | "did_not_pick_up" | "left_message" | "">("");
  const [contactDiscussion, setContactDiscussion] = useState("");
  const [appointmentForCall, setAppointmentForCall] = useState<Appointment | null>(null);
  const [apptCallReason, setApptCallReason] = useState("");
  const [apptCallOutcome, setApptCallOutcome] = useState<"picked_up" | "did_not_pick_up" | "left_message" | "">("");
  const [apptCallDiscussion, setApptCallDiscussion] = useState("");
  const [lastCallDetail, setLastCallDetail] = useState<FollowUpContact | null>(null);
  const [paymentCallInvoice, setPaymentCallInvoice] = useState<Invoice | null>(null);
  const [paymentCallReason, setPaymentCallReason] = useState("outstanding_payment");
  const [paymentCallOutcome, setPaymentCallOutcome] = useState<"picked_up" | "did_not_pick_up" | "left_message" | "">("");
  const [paymentCallDiscussion, setPaymentCallDiscussion] = useState("");

  const [activeTab, setActiveTab] = useState<"orders" | "appointments" | "payments">("orders");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search || "");
    const t = sp.get("tab");
    if (t === "orders" || t === "appointments" || t === "payments") setActiveTab(t);
  }, [location]);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.root,
    queryFn: () => apiGetJson<Patient[]>("/api/patients", token),
    enabled: !!token && user?.role === "reception",
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: queryKeys.labOrders.root,
    queryFn: () => apiGetJson<LabOrder[]>("/api/lab-orders", token),
    enabled: !!token && user?.role === "reception",
  });

  const { data: imagingOrders = [] } = useQuery<ImagingOrder[]>({
    queryKey: queryKeys.imagingOrders.root,
    queryFn: () => apiGetJson<ImagingOrder[]>("/api/imaging-orders", token),
    enabled: !!token && user?.role === "reception",
  });

  const { data: allAppointments = [] } = useQuery<Appointment[]>({
    queryKey: queryKeys.appointments.root,
    queryFn: () => apiGetJson<Appointment[]>("/api/appointments", token),
    enabled: !!token && user?.role === "reception",
  });

  const { data: allInvoices = [] } = useQuery<Invoice[]>({
    queryKey: queryKeys.invoices.root,
    queryFn: () => apiGetJson<Invoice[]>("/api/invoices", token),
    enabled: !!token && user?.role === "reception",
  });

  const { data: users = [] } = useQuery<{ id: string; fullName: string; username?: string }[]>({
    queryKey: queryKeys.users.root,
    queryFn: () =>
      apiGetJson<{ id: string; fullName: string; username?: string }[]>("/api/users", token),
    enabled: !!token && user?.role === "reception",
  });

  const { data: followUpContacts = [] } = useQuery<FollowUpContact[]>({
    queryKey: queryKeys.followUpContacts.root,
    queryFn: () => apiGetJson<FollowUpContact[]>("/api/follow-up-contacts", token),
    enabled: !!token && user?.role === "reception",
  });

  const patientMap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const clinicianNameById = useMemo(
    () => new Map(users.map((u) => [u.id, u.fullName?.trim() || u.username || "—"])),
    [users],
  );

  /** Latest follow-up contact per external lab / imaging order (for “Called on”). */
  const lastCallByOrderKey = useMemo(() => {
    const map = new Map<string, FollowUpContact>();
    for (const c of followUpContacts) {
      if (!c.labOrderId && !c.imagingOrderId) continue;
      const k = c.labOrderId ? `lab:${c.labOrderId}` : `img:${c.imagingOrderId!}`;
      const prev = map.get(k);
      const t = new Date(c.createdAt ?? 0).getTime();
      if (!prev || t > new Date(prev.createdAt ?? 0).getTime()) {
        map.set(k, c);
      }
    }
    return map;
  }, [followUpContacts]);

  /** Appointments on the calendar day exactly 7 days from today (local date). */
  const appointmentReminders = useMemo(() => {
    const targetDayStart = addDays(startOfDay(new Date()), 7);
    const targetDayEnd = endOfDay(targetDayStart);
    const t0 = targetDayStart.getTime();
    const t1 = targetDayEnd.getTime();
    return allAppointments
      .filter((a) => {
        const t = new Date(a.scheduledDate).getTime();
        if (t < t0 || t > t1) return false;
        return a.status === "scheduled" || a.status === "confirmed";
      })
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }, [allAppointments]);

  /**
   * Appointment IDs that already have a documented reminder call.
   * Includes contacts with `appointmentId` set, and "orphan" reminder calls saved from the patient chart
   * (reason appointment_reminder but no appointmentId) when this patient has exactly one row on the reminder day.
   */
  const reminderCallCompletedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of followUpContacts) {
      if (c.appointmentId) ids.add(c.appointmentId);
    }
    const byPatient = new Map<string, Appointment[]>();
    for (const a of appointmentReminders) {
      const list = byPatient.get(a.patientId) ?? [];
      list.push(a);
      byPatient.set(a.patientId, list);
    }
    for (const c of followUpContacts) {
      const reason = (c.reasonForCall ?? "").trim();
      if (reason !== "appointment_reminder") continue;
      if (c.appointmentId) continue;
      const appts = byPatient.get(c.patientId);
      if (appts?.length === 1) ids.add(appts[0].id);
    }
    return ids;
  }, [followUpContacts, appointmentReminders]);

  const outstandingPayments = useMemo(() => {
    return allInvoices
      .filter((inv) => inv.status === "pending" || inv.status === "partial")
      .map((inv) => ({
        inv,
        balance: Number(inv.totalAmount) - Number(inv.paidAmount || 0),
      }))
      .filter(({ balance }) => balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [allInvoices]);

  const openOutstandingPaymentCall = (inv: Invoice) => {
    setPaymentCallInvoice(inv);
    setPaymentCallReason("outstanding_payment");
    setPaymentCallOutcome("");
    setPaymentCallDiscussion("");
  };

  const rows: FollowUpRow[] = useMemo(() => {
    const lab = labOrders
      .filter((o) => isExternal(o.internalExternal))
      .filter((o) => o.status !== "cancelled" && o.status !== "completed" && o.status !== "resulted")
      .map(
        (o) =>
          ({
            kind: "lab",
            createdAt: orderCreatedAtIso(o.createdAt),
            patientId: o.patientId,
            orderName: o.testName,
            status: o.status,
            labOrderId: o.id,
          }) satisfies FollowUpRow
      );

    const imaging = imagingOrders
      .filter((o) => isExternal(o.internalExternal))
      .filter((o) => o.status !== "cancelled" && o.status !== "completed")
      .map(
        (o) =>
          ({
            kind: "imaging",
            createdAt: orderCreatedAtIso(o.createdAt),
            patientId: o.patientId,
            orderName: o.title,
            status: o.status,
            modality: o.modality,
            imagingOrderId: o.id,
          }) satisfies FollowUpRow
      );

    return [...lab, ...imaging].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [labOrders, imagingOrders]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => {
      const p = patientMap.get(r.patientId);
      const patientStr = p ? `${p.firstName} ${p.lastName} ${p.mrn}`.toLowerCase() : "";
      return (
        r.orderName.toLowerCase().includes(t) ||
        (r.kind === "imaging" && r.modality.toLowerCase().includes(t)) ||
        patientStr.includes(t)
      );
    });
  }, [rows, query, patientMap]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const aPatient = patientMap.get(a.patientId);
      const bPatient = patientMap.get(b.patientId);
      switch (sortKey) {
        case "patient": {
          const av = `${aPatient?.firstName ?? ""} ${aPatient?.lastName ?? ""}`.trim().toLowerCase();
          const bv = `${bPatient?.firstName ?? ""} ${bPatient?.lastName ?? ""}`.trim().toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case "mrn": {
          const av = (aPatient?.mrn ?? "").toLowerCase();
          const bv = (bPatient?.mrn ?? "").toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case "phone": {
          const av = (aPatient?.phone ?? "").toLowerCase();
          const bv = (bPatient?.phone ?? "").toLowerCase();
          return av.localeCompare(bv) * dir;
        }
        case "orderType":
          return (a.kind === "lab" ? "lab" : "imaging").localeCompare(
            b.kind === "lab" ? "lab" : "imaging"
          ) * dir;
        case "orderName":
          return a.orderName.toLowerCase().localeCompare(b.orderName.toLowerCase()) * dir;
        case "calledOn": {
          const getT = (r: FollowUpRow) => {
            const c = lastCallByOrderKey.get(orderFollowUpKey(r));
            return c ? new Date(c.createdAt ?? 0).getTime() : 0;
          };
          return (getT(a) - getT(b)) * dir;
        }
        case "orderDate":
        default:
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
    return list;
  }, [filtered, patientMap, sortDir, sortKey, lastCallByOrderKey]);

  const toggleSort = (
    key: "patient" | "mrn" | "phone" | "orderDate" | "orderType" | "orderName" | "calledOn"
  ) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "orderDate" || key === "calledOn" ? "desc" : "asc");
  };

  const sortHeader = (
    key: "patient" | "mrn" | "phone" | "orderDate" | "orderType" | "orderName" | "calledOn",
    label: string,
    thClassName?: string
  ) => (
    <TableHead className={cn("whitespace-nowrap", thClassName)}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="-mx-1 inline-flex items-center rounded-md px-1 py-0.5 font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      >
        {label}
        {sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </TableHead>
  );

  const openUpload = (row: FollowUpRow) => {
    const params = new URLSearchParams();
    params.set("patientId", row.patientId);
    if (row.kind === "lab") {
      params.set("docType", "lab_result");
      params.set("labOrderId", row.labOrderId);
      params.set("title", row.orderName);
    } else {
      params.set("docType", "imaging");
      params.set("imagingOrderId", row.imagingOrderId);
      params.set("title", row.orderName);
      params.set("modality", row.modality);
    }
    navigate(`/upload-results?${params.toString()}`);
  };

  const openAppointmentReminderCall = (a: Appointment) => {
    setAppointmentForCall(a);
    setApptCallReason("appointment_reminder");
    setApptCallOutcome("");
    setApptCallDiscussion("");
  };

  if (user?.role !== "reception") {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <p className="font-medium">Patient Follow up</p>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page is available for Reception users.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-[1600px] mx-auto" data-testid="patient-follow-up-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patient Follow up</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a tab to work on one area at a time.
          </p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const next = v as "orders" | "appointments" | "payments";
          setActiveTab(next);
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", next);
            navigate(url.pathname + url.search);
          } catch {
            // ignore
          }
        }}
        className="space-y-4"
      >
        <TabsList className="grid w-full max-w-3xl grid-cols-3 h-auto gap-1 p-1">
          <TabsTrigger
            value="orders"
            className="text-xs sm:text-sm py-2 px-2 whitespace-normal leading-tight"
            data-testid="tab-follow-up-orders"
          >
            <span className="hidden sm:inline">Order Follow up </span>
            <span className="sm:hidden">Orders </span>
            <span className="text-muted-foreground">({filtered.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="appointments"
            className="text-xs sm:text-sm py-2 px-2 whitespace-normal leading-tight"
            data-testid="tab-follow-up-appointments"
          >
            <span className="hidden sm:inline">Appointment reminder </span>
            <span className="sm:hidden">Reminder </span>
            <span className="text-muted-foreground">({appointmentReminders.length})</span>
          </TabsTrigger>
          <TabsTrigger
            value="payments"
            className="text-xs sm:text-sm py-2 px-2 whitespace-normal leading-tight"
            data-testid="tab-follow-up-payments"
          >
            <span className="hidden sm:inline">Outstanding payment </span>
            <span className="sm:hidden">Pay </span>
            <span className="text-muted-foreground">({outstandingPayments.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3 mt-4 focus-visible:outline-none">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              External lab / imaging orders awaiting outside results.
            </p>
            <div className="flex items-center gap-2 sm:justify-end">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patient, MRN, or order name…"
                className="w-full sm:w-[320px]"
                aria-label="Search order follow up"
              />
            </div>
          </div>

          <Card className="border-2 shadow-sm overflow-hidden">
            <CardHeader className="py-3 border-b bg-muted/40">
              <p className="text-sm text-muted-foreground">
                {filtered.length} order follow up item{filtered.length !== 1 ? "s" : ""}
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {sorted.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No external orders in follow up.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sortHeader("patient", "Patient", "min-w-[9rem]")}
                      {sortHeader("mrn", "MRN", "w-[7rem]")}
                      {sortHeader("phone", "Phone", "min-w-[8rem]")}
                      {sortHeader("orderDate", "Order date", "min-w-[9rem]")}
                      {sortHeader("orderType", "Order type", "w-[5rem]")}
                      {sortHeader("orderName", "Order name", "min-w-[12rem]")}
                      {sortHeader("calledOn", "Called on", "min-w-[9rem]")}
                      <TableHead className="min-w-[14rem] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => {
                      const p = patientMap.get(r.patientId);
                      const patientName = p ? `${p.firstName} ${p.lastName}`.trim() : "—";
                      const mrn = p?.mrn ?? "—";
                      const phone = p?.phone?.trim() ? p.phone : "—";
                      const lastCall = lastCallByOrderKey.get(orderFollowUpKey(r));
                      return (
                        <TableRow key={r.kind === "lab" ? r.labOrderId : r.imagingOrderId}>
                          <TableCell className="font-medium">{patientName}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{mrn}</TableCell>
                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="truncate block" title={phone}>
                                {phone}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {format(new Date(r.createdAt), "yyyy-MM-dd HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {r.kind === "lab" ? "Lab" : "Imaging"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[20rem]">
                            <span className="font-medium truncate block" title={r.orderName}>
                              {r.orderName}
                            </span>
                          </TableCell>
                          <TableCell>
                            {lastCall?.createdAt ? (
                              <button
                                type="button"
                                className="text-primary text-xs font-mono underline underline-offset-1 hover:text-primary/80 text-left"
                                title={format(new Date(lastCall.createdAt), "yyyy-MM-dd HH:mm")}
                                onClick={() => setLastCallDetail(lastCall)}
                                data-testid={`follow-up-called-on-${r.kind}-${r.kind === "lab" ? r.labOrderId : r.imagingOrderId}`}
                              >
                                {format(new Date(lastCall.createdAt), "yyyy-MM-dd HH:mm")}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2 flex-wrap">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 min-h-8 px-2.5 text-xs gap-1"
                                onClick={() => setContactRow(r)}
                                data-testid={`follow-up-contact-${r.kind}-${r.kind === "lab" ? r.labOrderId : r.imagingOrderId}`}
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                                Patient Call
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 min-h-8 px-2.5 text-xs gap-1"
                                onClick={() => openUpload(r)}
                                data-testid={`follow-up-upload-${r.kind}-${r.kind === "lab" ? r.labOrderId : r.imagingOrderId}`}
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Upload
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-3 mt-4 focus-visible:outline-none">
          <div className="flex items-start gap-2">
            <CalendarClock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Scheduled or confirmed appointments on{" "}
              <strong>{format(addDays(startOfDay(new Date()), 7), "EEEE, MMMM d, yyyy")}</strong>
              {" "}(exactly one week from today). Use{" "}
              <strong>Patient call</strong> in the Actions column to document the reminder.
            </p>
          </div>

          <Card className="border-2 shadow-sm overflow-hidden">
            <CardHeader className="py-3 border-b bg-muted/40">
              <p className="text-sm text-muted-foreground">
                {appointmentReminders.length} appointment{appointmentReminders.length !== 1 ? "s" : ""}
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {appointmentReminders.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No scheduled or confirmed appointments on that day.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[9rem] whitespace-nowrap">Date &amp; time</TableHead>
                      <TableHead className="min-w-[9rem]">Patient</TableHead>
                      <TableHead className="w-[7rem]">MRN</TableHead>
                      <TableHead className="min-w-[8rem]">Phone</TableHead>
                      <TableHead className="w-[5rem] text-right">Duration</TableHead>
                      <TableHead className="min-w-[8rem]">Clinician</TableHead>
                      <TableHead className="min-w-[8rem]">Reason</TableHead>
                      <TableHead className="w-[8rem]">Call status</TableHead>
                      <TableHead className="min-w-[9rem] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointmentReminders.map((a) => {
                      const p = patientMap.get(a.patientId);
                      const patientName = p ? `${p.firstName} ${p.lastName}`.trim() : "—";
                      const mrn = p?.mrn ?? "—";
                      const phone = p?.phone?.trim() ? p.phone : "—";
                      const clinician = clinicianNameById.get(a.clinicianId) ?? "—";
                      const completed = reminderCallCompletedIds.has(a.id);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs font-mono whitespace-nowrap">
                            {format(new Date(a.scheduledDate), "yyyy-MM-dd HH:mm")}
                          </TableCell>
                          <TableCell className="font-medium">{patientName}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{mrn}</TableCell>
                          <TableCell className="text-sm">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              <span className="truncate block" title={phone}>
                                {phone}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {a.duration ?? 30} min
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{clinician}</TableCell>
                          <TableCell className="max-w-[14rem] truncate text-sm" title={a.reason ?? ""}>
                            {a.reason ?? "—"}
                          </TableCell>
                          <TableCell>
                            {completed ? (
                              <Badge variant="secondary" className="text-[10px] bg-chart-3/15 text-chart-3 border-0">
                                Completed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">
                                Not Started
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 min-h-8 px-2.5 text-xs gap-1"
                              disabled={completed}
                              title={completed ? "Reminder call already documented" : undefined}
                              onClick={() => openAppointmentReminderCall(a)}
                              data-testid={`reminder-row-patient-call-${a.id}`}
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              Patient call
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-3 mt-4 focus-visible:outline-none">
        <div className="flex items-start gap-2">
          <Banknote className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Invoices with a remaining balance (pending or partial).
          </p>
        </div>

        <Card className="border-2 shadow-sm overflow-hidden">
          <CardHeader className="py-3 border-b bg-muted/40">
            <p className="text-sm text-muted-foreground">
              {outstandingPayments.length} outstanding invoice{outstandingPayments.length !== 1 ? "s" : ""}
            </p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {outstandingPayments.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No outstanding balances.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[14rem]">Patient</TableHead>
                    <TableHead className="w-[7rem]">MRN</TableHead>
                    <TableHead className="w-[7rem]">Status</TableHead>
                    <TableHead className="w-[9rem] text-right">Total</TableHead>
                    <TableHead className="w-[9rem] text-right">Balance due</TableHead>
                    <TableHead className="w-[16rem] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstandingPayments.map(({ inv, balance }) => {
                    const p = patientMap.get(inv.patientId);
                    const patientName = p ? `${p.firstName} ${p.lastName}`.trim() : "—";
                    const mrn = p?.mrn ?? "—";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium max-w-[14rem] truncate" title={patientName}>
                          {patientName}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{mrn}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {currencyCode} {Number(inv.totalAmount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <Link href={`/billing?payInvoiceId=${encodeURIComponent(inv.id)}`}>
                            <a className="text-primary font-medium underline underline-offset-2 hover:text-primary/90 tabular-nums">
                              {currencyCode} {balance.toLocaleString()}
                            </a>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 min-h-8 px-2.5 text-xs gap-1"
                              onClick={() => openOutstandingPaymentCall(inv)}
                              data-testid={`outstanding-payment-patient-call-${inv.id}`}
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              Patient Call
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 min-h-8" asChild>
                              <Link href={`/billing?payInvoiceId=${encodeURIComponent(inv.id)}`}>
                                <a data-testid={`outstanding-payment-make-payment-${inv.id}`}>Make payment</a>
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!lastCallDetail}
        onOpenChange={(open) => {
          if (!open) setLastCallDetail(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Last patient call</DialogTitle>
            <DialogDescription>
              Notes and caller for the most recent contact on this order.
            </DialogDescription>
          </DialogHeader>
          {lastCallDetail ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Called on</p>
                <p className="font-mono mt-1">
                  {lastCallDetail.createdAt
                    ? format(new Date(lastCallDetail.createdAt), "yyyy-MM-dd HH:mm")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Called by</p>
                <p className="mt-1 font-medium">
                  {clinicianNameById.get(lastCallDetail.contactedBy) ?? lastCallDetail.contactedBy}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outcome</p>
                <p className="mt-1 capitalize">{String(lastCallDetail.outcome ?? "").replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
                <div className="mt-2 rounded-md border bg-muted/40 p-3 whitespace-pre-wrap min-h-[4rem] text-foreground">
                  {lastCallDetail.discussion?.trim() ? lastCallDetail.discussion : "—"}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!contactRow}
        onOpenChange={(open) => {
          if (!open) {
            setContactRow(null);
            setContactReasonForCall("");
            setContactOutcome("");
            setContactDiscussion("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document contact attempt</DialogTitle>
            <DialogDescription>
              Record the call outcome and discussion notes for this patient follow-up item.
            </DialogDescription>
          </DialogHeader>
          {contactRow ? (
            <PatientCallDocumentationForm
              token={token ?? null}
              userId={user?.id}
              patientId={contactRow.patientId}
              labOrderId={contactRow.kind === "lab" ? contactRow.labOrderId : undefined}
              imagingOrderId={contactRow.kind === "imaging" ? contactRow.imagingOrderId : undefined}
              reasonForCall={contactReasonForCall}
              outcome={contactOutcome}
              discussion={contactDiscussion}
              onReasonForCallChange={setContactReasonForCall}
              onOutcomeChange={setContactOutcome}
              onDiscussionChange={setContactDiscussion}
              onCancel={() => setContactRow(null)}
              onSaved={() => {
                setContactRow(null);
                setContactReasonForCall("");
                setContactOutcome("");
                setContactDiscussion("");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!paymentCallInvoice}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentCallInvoice(null);
            setPaymentCallReason("outstanding_payment");
            setPaymentCallOutcome("");
            setPaymentCallDiscussion("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document patient call</DialogTitle>
            <DialogDescription>
              Record the call outcome and discussion notes for this outstanding payment.
            </DialogDescription>
          </DialogHeader>
          {paymentCallInvoice ? (
            <PatientCallDocumentationForm
              token={token ?? null}
              userId={user?.id}
              patientId={paymentCallInvoice.patientId}
              reasonForCall={paymentCallReason}
              outcome={paymentCallOutcome}
              discussion={paymentCallDiscussion}
              onReasonForCallChange={setPaymentCallReason}
              onOutcomeChange={setPaymentCallOutcome}
              onDiscussionChange={setPaymentCallDiscussion}
              onCancel={() => setPaymentCallInvoice(null)}
              onSaved={() => {
                setPaymentCallInvoice(null);
                setPaymentCallReason("outstanding_payment");
                setPaymentCallOutcome("");
                setPaymentCallDiscussion("");
              }}
              saveLabel="Save call note"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!appointmentForCall}
        onOpenChange={(open) => {
          if (!open) {
            setAppointmentForCall(null);
            setApptCallReason("");
            setApptCallOutcome("");
            setApptCallDiscussion("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Appointment reminder — patient call</DialogTitle>
            <DialogDescription>
              {appointmentForCall && (
                <>
                  Document the call for{" "}
                  <strong>
                    {format(new Date(appointmentForCall.scheduledDate), "MMM d, yyyy HH:mm")}
                  </strong>
                  {patientMap.get(appointmentForCall.patientId) && (
                    <>
                      {" "}
                      —{" "}
                      {patientMap.get(appointmentForCall.patientId)!.firstName}{" "}
                      {patientMap.get(appointmentForCall.patientId)!.lastName}
                    </>
                  )}
                  . After saving, the reminder status shows as Completed.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {appointmentForCall ? (
            <PatientCallDocumentationForm
              token={token ?? null}
              userId={user?.id}
              patientId={appointmentForCall.patientId}
              appointmentId={appointmentForCall.id}
              reasonForCall={apptCallReason}
              outcome={apptCallOutcome}
              discussion={apptCallDiscussion}
              onReasonForCallChange={setApptCallReason}
              onOutcomeChange={setApptCallOutcome}
              onDiscussionChange={setApptCallDiscussion}
              onCancel={() => setAppointmentForCall(null)}
              saveLabel="Save call"
              onSaved={() => {
                setAppointmentForCall(null);
                setApptCallReason("");
                setApptCallOutcome("");
                setApptCallDiscussion("");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
