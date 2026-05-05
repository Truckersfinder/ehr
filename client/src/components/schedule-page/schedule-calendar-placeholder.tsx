import { Card, CardContent } from "@/components/ui/card";

export function ScheduleCalendarPlaceholder() {
  return (
    <Card className="rounded-xl border border-border bg-white shadow-sm" data-testid="schedule-calendar-placeholder">
      <CardContent className="flex min-h-[280px] items-center justify-center p-12">
        <p className="text-center text-muted-foreground text-sm font-medium">Calendar view coming soon</p>
      </CardContent>
    </Card>
  );
}
