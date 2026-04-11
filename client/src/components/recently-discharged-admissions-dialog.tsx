import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/use-table-sort";
import { apiGetJson } from "@/lib/api-client";
import type { BedAssignment, Patient, User } from "@shared/schema";
import { APPOINTMENT_REASON_FOR_VISIT_LABEL } from "@shared/appointment-labels";
import { Link } from "wouter";

export type RecentDischargedAdmissionRow = BedAssignment & {
  bedName: string;
  clinicianId: string | null;
  scheduledDate: Date | string | null;
  status: string | null;
  reason: string | null;
};

type SortKey = "patient" | "mrn" | "clinician" | "reason" | "bed" | "dischargedAt" | "dischargeReason";

export function RecentlyDischargedAdmissionsDialog({
  open,
  onOpenChange,
  token,
  patientMap,
  userMap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null | undefined;
  patientMap: Map<string, Patient>;
  userMap: Map<string, Omit<User, "password">>;
}) {
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("dischargedAt", "desc");

  const { data: rows = [], isLoading } = useQuery<RecentDischargedAdmissionRow[]>({
    queryKey: ["/api/admissions/recent"],
    queryFn: () => apiGetJson<RecentDischargedAdmissionRow[]>("/api/admissions/recent", token ?? null),
    enabled: open && !!token,
  });

  const display = useMemo(() => {
    const list = [...rows];
    const mult = sortDir === "asc" ? 1 : -1;
    const patientName = (id: string) => {
      const p = patientMap.get(id);
      return p ? `${p.firstName} ${p.lastName}` : "—";
    };
    const mrn = (id: string) => patientMap.get(id)?.mrn ?? "";
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "patient":
          cmp = patientName(a.patientId).localeCompare(patientName(b.patientId));
          break;
        case "mrn":
          cmp = mrn(a.patientId).localeCompare(mrn(b.patientId));
          break;
        case "clinician":
          cmp = (userMap.get(a.clinicianId ?? "")?.fullName ?? "").localeCompare(
            userMap.get(b.clinicianId ?? "")?.fullName ?? "",
          );
          break;
        case "reason":
          cmp = (a.reason ?? "").localeCompare(b.reason ?? "");
          break;
        case "bed":
          cmp = (a.bedName ?? "").localeCompare(b.bedName ?? "");
          break;
        case "dischargeReason":
          cmp = (a.dischargeReason ?? "").localeCompare(b.dischargeReason ?? "");
          break;
        case "dischargedAt":
        default:
          cmp = new Date(a.dischargedAt ?? 0).getTime() - new Date(b.dischargedAt ?? 0).getTime();
      }
      return cmp * mult;
    });
    return list;
  }, [rows, patientMap, userMap, sortKey, sortDir]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Recently discharged (last 2 weeks)</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6">Loading…</p>
        ) : display.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">No recently discharged patients.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[980px] w-full text-sm table-fixed">
              <TableHeader>
                <TableRow>
                  <SortableTableHead active={sortKey === "patient"} sortDir={sortDir} onSort={() => toggleSort("patient")}>
                    Patient
                  </SortableTableHead>
                  <SortableTableHead className="w-[7rem]" active={sortKey === "mrn"} sortDir={sortDir} onSort={() => toggleSort("mrn")}>
                    MRN
                  </SortableTableHead>
                  <SortableTableHead active={sortKey === "clinician"} sortDir={sortDir} onSort={() => toggleSort("clinician")}>
                    Clinician
                  </SortableTableHead>
                  <SortableTableHead active={sortKey === "reason"} sortDir={sortDir} onSort={() => toggleSort("reason")}>
                    {APPOINTMENT_REASON_FOR_VISIT_LABEL}
                  </SortableTableHead>
                  <SortableTableHead className="w-[10rem]" active={sortKey === "bed"} sortDir={sortDir} onSort={() => toggleSort("bed")}>
                    Bed / Room
                  </SortableTableHead>
                  <SortableTableHead className="w-[10rem]" active={sortKey === "dischargeReason"} sortDir={sortDir} onSort={() => toggleSort("dischargeReason")}>
                    Discharge reason
                  </SortableTableHead>
                  <SortableTableHead className="w-[10rem]" active={sortKey === "dischargedAt"} sortDir={sortDir} onSort={() => toggleSort("dischargedAt")}>
                    Discharged
                  </SortableTableHead>
                  <TableCell className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {display.map((a) => {
                  const p = patientMap.get(a.patientId);
                  const clinician = a.clinicianId ? userMap.get(a.clinicianId) : undefined;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium truncate max-w-0">
                        <Link href={`/patients/${a.patientId}?fromAdmission=1&admissionId=${encodeURIComponent(a.id)}&tab=medication`}>
                          <a className="text-primary hover:underline">
                            {p ? `${p.firstName} ${p.lastName}` : "—"}
                          </a>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {p?.mrn ?? "—"}
                      </TableCell>
                      <TableCell className="truncate max-w-0 whitespace-nowrap">{clinician?.fullName ?? "—"}</TableCell>
                      <TableCell className="truncate max-w-0" title={a.reason ?? ""}>
                        {a.reason ?? "—"}
                      </TableCell>
                      <TableCell className="truncate max-w-0 whitespace-nowrap">{a.bedName}</TableCell>
                      <TableCell>
                        {a.dischargeReason ? (
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {String(a.dischargeReason).replace(/_/g, " ")}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {a.dischargedAt ? format(new Date(a.dischargedAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline" className="h-8">
                          <Link href={`/patients/${a.patientId}?fromAdmission=1&admissionId=${encodeURIComponent(a.id)}&tab=medication`}>
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

