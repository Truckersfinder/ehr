import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTableSort } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { SectionTitleWithHint } from "@/components/section-title-with-hint";
import { format } from "date-fns";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";
import type { Appointment, Encounter, Patient } from "@shared/schema";
import { APPOINTMENT_REASON_FOR_VISIT_LABEL } from "@shared/appointment-labels";
import { ExternalLink } from "lucide-react";

export type BillingTodaysVisitRow = {
  appointment: Appointment;
  patient: Patient;
  encounter: Encounter | null;
  visitChargeTotal: string;
  billingCurrency: string;
  chargesFinalizedAt?: string | null;
};

function appointmentStatusBadgeClass(status: string | null | undefined): string {
  const s = String(status ?? "");
  if (s === "in_progress") return "bg-chart-3/15 text-chart-3 border-chart-3/30";
  if (s === "checked_in") return "bg-chart-2/15 text-chart-2 border-chart-2/30";
  if (s === "confirmed" || s === "scheduled") return "bg-muted text-muted-foreground";
  if (s === "completed") return "bg-chart-4/15 text-chart-4";
  if (s === "cancelled" || s === "no_show") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

function formatAppointmentStatus(status: string | null | undefined): string {
  return String(status ?? "—").replace(/_/g, " ");
}

type Props = {
  rows: BillingTodaysVisitRow[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};

type BillingSortKey = "time" | "patient" | "reason" | "status" | "encounter" | "total";

export function BillingTodaysVisitsTab({ rows, isLoading, isError, error }: Props) {
  const { sortKey, sortDir, toggleSort } = useTableSort<BillingSortKey>("time", "asc");
  const orgTz = useOrgTimeZone();

  const sortedRows = useMemo(() => {
    const list = [...rows];
    const mult = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "time":
          cmp =
            new Date(a.appointment.scheduledDate).getTime() -
            new Date(b.appointment.scheduledDate).getTime();
          break;
        case "patient":
          cmp = `${a.patient.firstName} ${a.patient.lastName}`.localeCompare(
            `${b.patient.firstName} ${b.patient.lastName}`,
          );
          break;
        case "reason":
          cmp = (a.appointment.reason ?? "").localeCompare(b.appointment.reason ?? "");
          break;
        case "status":
          cmp = a.appointment.status.localeCompare(b.appointment.status);
          break;
        case "encounter": {
          const sa = a.encounter ? String(a.encounter.status ?? "") : "";
          const sb = b.encounter ? String(b.encounter.status ?? "") : "";
          const na = a.encounter ? 0 : 1;
          const nb = b.encounter ? 0 : 1;
          cmp = na !== nb ? na - nb : sa.localeCompare(sb);
          break;
        }
        case "total":
          cmp = Number(a.visitChargeTotal) - Number(b.visitChargeTotal);
          break;
        default:
          cmp = 0;
      }
      return cmp * mult;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {error?.message || "Could not load today’s visits."}
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card data-testid="billing-todays-visits-empty">
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No appointments scheduled for this day.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="billing-todays-visits-list">
      <h3 className="text-sm font-semibold">
        <SectionTitleWithHint hint="All appointments for the selected day. Totals update when the visit has a started encounter. Refreshes about every 20 seconds while this tab is open.">
          Today&apos;s visits
        </SectionTitleWithHint>
      </h3>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                active={sortKey === "time"}
                sortDir={sortDir}
                onSort={() => toggleSort("time")}
              >
                Time
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "patient"}
                sortDir={sortDir}
                onSort={() => toggleSort("patient")}
              >
                Patient
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "reason"}
                sortDir={sortDir}
                onSort={() => toggleSort("reason")}
              >
                {APPOINTMENT_REASON_FOR_VISIT_LABEL}
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "status"}
                sortDir={sortDir}
                onSort={() => toggleSort("status")}
              >
                Visit status
              </SortableTableHead>
              <SortableTableHead
                active={sortKey === "encounter"}
                sortDir={sortDir}
                onSort={() => toggleSort("encounter")}
              >
                Encounter
              </SortableTableHead>
              <SortableTableHead
                align="right"
                active={sortKey === "total"}
                sortDir={sortDir}
                onSort={() => toggleSort("total")}
              >
                Visit total
              </SortableTableHead>
              <TableHead className="w-[1%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map(({ appointment, patient, encounter, visitChargeTotal, billingCurrency }) => (
              <TableRow key={appointment.id} data-testid={`billing-todays-visit-${appointment.id}`}>
                <TableCell className="text-sm whitespace-nowrap tabular-nums">
                  {appointment.scheduledDate
                    ? formatInOrgTimeZone(appointment.scheduledDate, "h:mm a", orgTz)
                    : "—"}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-sm">
                    {patient.firstName} {patient.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">MRN {patient.mrn}</div>
                </TableCell>
                <TableCell className="text-sm max-w-[14rem]">
                  <span className="line-clamp-3" title={appointment.reason?.trim() || undefined}>
                    {appointment.reason?.trim() ? appointment.reason : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${appointmentStatusBadgeClass(appointment.status)}`}
                  >
                    {formatAppointmentStatus(appointment.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {encounter ? (
                    <span className="capitalize">{String(encounter.status ?? "").replace(/_/g, " ")}</span>
                  ) : (
                    <span className="italic">Not started</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {encounter ? (
                    <Link
                      href={`/billing/visit-charges/${encounter.id}`}
                      className="text-primary font-semibold tabular-nums underline underline-offset-2 hover:text-primary/90"
                      data-testid={`todays-visit-total-link-${encounter.id}`}
                    >
                      {billingCurrency}{" "}
                      {Number(visitChargeTotal).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Link>
                  ) : (
                    <span
                      className="tabular-nums text-muted-foreground"
                      title="Start the visit from the schedule or chart to record charges"
                    >
                      {billingCurrency} 0.00
                    </span>
                  )}
                  {encounter && (encounter as any).chargesFinalizedAt ? (
                    <div className="text-[11px] text-muted-foreground mt-1">Charges Finalized</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {encounter ? (
                    <Button variant="outline" size="sm" className="gap-1.5" asChild>
                      <Link
                        href={`/patients/${patient.id}?visitDocReview=1&encounterId=${encodeURIComponent(encounter.id)}&tab=visit-summary`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Visit Documentation
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1.5" disabled title="Start the visit from the schedule or chart first">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Visit Documentation
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
