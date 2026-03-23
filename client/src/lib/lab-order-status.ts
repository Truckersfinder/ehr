/** Tailwind classes for lab order status badges (Laboratory page + patient chart). */
export const LAB_ORDER_STATUS_BADGE_CLASSES: Record<string, string> = {
  ordered: "bg-chart-4/10 text-chart-4",
  collected: "bg-chart-5/10 text-chart-5",
  processing: "bg-chart-2/10 text-chart-2",
  completed: "bg-chart-3/10 text-chart-3",
  resulted: "bg-chart-3/10 text-chart-3",
  cancelled: "bg-destructive/10 text-destructive",
};

export function labOrderStatusBadgeClass(status: string): string {
  return LAB_ORDER_STATUS_BADGE_CLASSES[status] ?? "";
}
