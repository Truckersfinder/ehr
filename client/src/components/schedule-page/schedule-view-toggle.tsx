import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type ScheduleViewMode = "list" | "calendar" | "board";

type Props = {
  value: ScheduleViewMode;
  onChange: (v: ScheduleViewMode) => void;
};

export function ScheduleViewToggle({ value, onChange }: Props) {
  const { t } = useTranslation();
  const modes: { id: ScheduleViewMode; labelKey: string }[] = [
    { id: "list", labelKey: "pages.schedule.viewList" },
    { id: "calendar", labelKey: "pages.schedule.viewCalendar" },
    { id: "board", labelKey: "pages.schedule.viewBoard" },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-border bg-white shadow-sm p-0.5"
      role="radiogroup"
      aria-label={t("pages.schedule.viewModeAria")}
      data-testid="schedule-view-toggle"
    >
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          data-testid={`schedule-view-${m.id}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === m.id
              ? "bg-[#0E3B2E] text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
          )}
        >
          {t(m.labelKey)}
        </button>
      ))}
    </div>
  );
}
