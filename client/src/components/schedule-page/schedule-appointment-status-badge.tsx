import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatAppointmentStatusLabel } from "@/lib/appointment-status";

/** Modern Schedule-specific status chip styles (tailwind-only). */
const SCHEDULE_BADGE_BY_STATUS: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
  checked_in: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300",
  scheduled: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300",
  confirmed: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300",
  no_show: "bg-gray-200 text-gray-600 dark:bg-neutral-700 dark:text-neutral-200",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300",
};

export function ScheduleAppointmentStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const label = t(`appointmentStatus.${status}`, { defaultValue: formatAppointmentStatusLabel(status) });
  const cls =
    SCHEDULE_BADGE_BY_STATUS[status] ?? "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300";
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", cls)}>{label}</span>;
}
