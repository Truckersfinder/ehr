import { Link } from "wouter";
import type { Appointment, Patient } from "@shared/schema";
import { cn } from "@/lib/utils";
import { formatInOrgTimeZone } from "@/lib/org-timezone";

type BoardBucket = "scheduled" | "in_progress" | "completed" | "no_show";

function boardBucketForStatus(status: string): BoardBucket | null {
  if (status === "no_show") return "no_show";
  if (status === "completed") return "completed";
  if (status === "in_progress") return "in_progress";
  if (status === "scheduled" || status === "confirmed" || status === "checked_in") return "scheduled";
  return null;
}

const COLUMNS: { key: BoardBucket; title: string }[] = [
  { key: "scheduled", title: "Scheduled" },
  { key: "in_progress", title: "In Progress" },
  { key: "completed", title: "Completed" },
  { key: "no_show", title: "No Show" },
];

type Props = {
  appointments: Appointment[];
  patientMap: Map<string, Patient>;
  className?: string;
  orgTz: string;
};

export function ScheduleBoardView({ appointments, patientMap, className, orgTz }: Props) {
  const buckets: Record<BoardBucket, Appointment[]> = {
    scheduled: [],
    in_progress: [],
    completed: [],
    no_show: [],
  };

  for (const apt of appointments) {
    const k = boardBucketForStatus(apt.status);
    if (!k) continue;
    buckets[k].push(apt);
  }

  for (const col of COLUMNS) {
    buckets[col.key].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  }

  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}
      data-testid="schedule-board-view"
    >
      {COLUMNS.map((col) => (
        <div
          key={col.key}
          className="flex min-h-[320px] flex-col rounded-xl border border-border bg-white shadow-sm overflow-hidden"
        >
          <div className="border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{col.title}</p>
              <span className="text-xs tabular-nums text-muted-foreground">{buckets[col.key].length}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {buckets[col.key].length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No appointments</p>
            ) : (
              buckets[col.key].map((apt) => {
                const pt = patientMap.get(apt.patientId);
                const name = pt ? `${pt.firstName} ${pt.lastName}` : "Patient";
                const time = formatInOrgTimeZone(apt.scheduledDate, "HH:mm", orgTz);
                const href = `/patients/${apt.patientId}?fromSchedule=1&appointmentId=${encodeURIComponent(apt.id)}`;
                return (
                  <Link key={apt.id} href={href}>
                    <a className="block rounded-lg border border-border bg-muted/20 p-3 text-left shadow-none transition-colors hover:bg-muted/50">
                      <p className="text-sm font-semibold leading-tight line-clamp-2">{name}</p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{time}</p>
                    </a>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
