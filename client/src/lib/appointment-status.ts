/**
 * Shared Tailwind classes for appointment status badges across Schedule, Reception, Dashboard, etc.
 */
export const APPOINTMENT_STATUS_BADGE_CLASSES: Record<string, string> = {
  scheduled: "bg-accent text-accent-foreground",
  confirmed: "bg-primary/10 text-primary",
  checked_in: "bg-chart-4/10 text-chart-4",
  in_progress: "bg-chart-3/10 text-chart-3",
  completed: "bg-chart-3/10 text-chart-3",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

export function appointmentStatusBadgeClass(status: string): string {
  return APPOINTMENT_STATUS_BADGE_CLASSES[status] ?? "";
}

/** Human-readable label for appointment status (underscores → spaces). */
export function formatAppointmentStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
