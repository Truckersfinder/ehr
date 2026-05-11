import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";

export function ScheduleCalendarPlaceholder() {
  const { t } = useTranslation();
  return (
    <Card className="rounded-xl border border-border bg-white shadow-sm" data-testid="schedule-calendar-placeholder">
      <CardContent className="flex min-h-[280px] items-center justify-center p-12">
        <p className="text-center text-muted-foreground text-sm font-medium">
          {t("pages.schedule.calendarComingSoon")}
        </p>
      </CardContent>
    </Card>
  );
}
