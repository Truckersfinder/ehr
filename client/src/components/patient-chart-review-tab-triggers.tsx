import type { LucideIcon } from "lucide-react";
import { TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, History, ShieldCheck, FileCheck, PhoneCall, FileText } from "lucide-react";
import { PATIENT_CHART_SIDEBAR_TAB_TRIGGER_CLASS } from "@/components/patient-chart-review-constants";
import { reviewActivityIdToMainTabValue } from "@/lib/patient-chart-activity-ui";

const triggerClass = PATIENT_CHART_SIDEBAR_TAB_TRIGGER_CLASS;

function iconForReview(id: string): LucideIcon {
  switch (id) {
    case "pc_patient_call":
      return PhoneCall;
    case "pc_overview":
      return LayoutGrid;
    case "pc_history":
      return History;
    case "pc_immunization":
      return ShieldCheck;
    case "pc_results":
      return FileCheck;
    case "pc_forms_consent":
      return FileText;
    default:
      return LayoutGrid;
  }
}

export type PatientChartReviewNavEntry = { id: string; label: string };

/**
 * Review-section tab triggers for the patient chart (must be rendered inside the same {@link Tabs} as content).
 * Items come from Application configuration (per-role); Demographics stays on its own route and is omitted here.
 */
export function PatientChartReviewTabTriggers({ items }: { items: PatientChartReviewNavEntry[] }) {
  return (
    <>
      {items.map((entry) => {
        if (entry.id === "pc_demographics") return null;
        const tab = reviewActivityIdToMainTabValue(entry.id);
        if (!tab) return null;
        const Icon = iconForReview(entry.id);
        return (
          <TabsTrigger
            key={entry.id}
            value={tab}
            data-testid={`tab-${tab}`}
            className={triggerClass}
          >
            <Icon className="w-4 h-4 shrink-0" /> {entry.label}
          </TabsTrigger>
        );
      })}
    </>
  );
}
