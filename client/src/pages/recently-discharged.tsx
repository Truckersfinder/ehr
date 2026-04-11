import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiGetJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { Patient, User as UserType } from "@shared/schema";
import type { BedAssignment } from "@shared/schema";
import { APPOINTMENT_REASON_FOR_VISIT_LABEL } from "@shared/appointment-labels";
import { useTableSort } from "@/hooks/use-table-sort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { formatInOrgTimeZone } from "@/lib/org-timezone";

type RecentDischargedAdmissionRow = BedAssignment & {
  bedName: string;
  clinicianId: string | null;
  scheduledDate: Date | string | null;
  status: string | null;
  reason: string | null;
};

type SortKey = "patient" | "mrn" | "clinician" | "reason" | "bed" | "dischargedAt" | "dischargeReason";

export default function RecentlyDischargedPage() {
  const { token, user } = useAuth();
  const [, navigate] = useLocation();
  const orgTz = useOrgTimeZone();

  // Restrict to clinical staff + admins that can view admissions.
  const allowed =
    user?.role === "clinician" || user?.role === "nurse" || user?.role === "super_admin";
  if (user && !allowed) {
    navigate("/");
  }

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: queryKeys.patients.root,
    queryFn: () => apiGetJson<Patient[]>("/api/patients", token),
    enabled: !!token && allowed,
  });

  const { data: users = [] } = useQuery<Omit<UserType, "password">[]>({
    queryKey: queryKeys.users.root,
    queryFn: () => apiGetJson<Omit<UserType, "password">[]>("/api/users", token),
    enabled: !!token && allowed,
  });

  const patientMap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("dischargedAt", "desc");

  const { data: rows = [], isLoading } = useQuery<RecentDischargedAdmissionRow[]>({
    queryKey: ["/api/admissions/recent"],
    queryFn: () => apiGetJson<RecentDischargedAdmissionRow[]>("/api/admissions/recent", token ?? null),
    enabled: !!token && allowed,
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
    <div className="p-6 space-y-4 max-w-7xl mx-auto" data-testid="recently-discharged-page">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Recently discharged</h1>
          <p className="text-sm text-muted-foreground">
            Discharged admissions stay here for 2 weeks for addenda.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate("/schedule")} className="shrink-0">
          Back to schedule
        </Button>
      </div>

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
                    <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">{p?.mrn ?? "—"}</TableCell>
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
                      {formatInOrgTimeZone(a.dischargedAt, "MMM d, yyyy", orgTz)}
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
    </div>
  );
}

