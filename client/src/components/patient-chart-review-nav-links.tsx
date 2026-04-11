import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutGrid, History, ShieldCheck, FileCheck, User, PhoneCall, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { patientChartReviewHref } from "@/components/patient-chart-review-constants";
import {
  getPatientChartReviewNav,
  reviewActivityIdToMainTabValue,
} from "@/lib/patient-chart-activity-ui";

export type ReviewNavActive =
  | "overview"
  | "history"
  | "immunization"
  | "results"
  | "patient-call"
  | "demographics"
  | "forms-consent";

function iconForReview(id: string) {
  switch (id) {
    case "pc_demographics":
      return User;
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

function reviewEntryToActiveKey(id: string): ReviewNavActive | null {
  switch (id) {
    case "pc_demographics":
      return "demographics";
    case "pc_patient_call":
      return "patient-call";
    case "pc_overview":
      return "overview";
    case "pc_history":
      return "history";
    case "pc_immunization":
      return "immunization";
    case "pc_results":
      return "results";
    case "pc_forms_consent":
      return "forms-consent";
    default:
      return null;
  }
}

/**
 * Review-section navigator links (Demographics first when enabled, then other review tabs).
 * Uses Application configuration per role (`activityUi.patientChartReview`).
 */
export function PatientChartReviewNavLinks({
  patientId,
  active,
}: {
  patientId: string;
  active: ReviewNavActive;
}) {
  const { user } = useAuth();
  const items = getPatientChartReviewNav(user);
  const reviewNavItemBase =
    "flex w-full min-w-0 items-center justify-start gap-2 rounded-md px-3 py-2 h-auto text-sm font-medium text-left ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-transparent hover:bg-accent text-foreground";
  const itemClass = (key: ReviewNavActive) => cn(reviewNavItemBase, active === key && "bg-accent");

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((entry) => {
        const activeKey = reviewEntryToActiveKey(entry.id);
        if (!activeKey) return null;
        const Icon = iconForReview(entry.id);
        const href =
          entry.id === "pc_demographics"
            ? patientChartReviewHref(patientId, "demographics")
            : patientChartReviewHref(patientId, reviewActivityIdToMainTabValue(entry.id)!);
        const testId =
          entry.id === "pc_demographics"
            ? "nav-review-demographics"
            : `nav-review-${reviewActivityIdToMainTabValue(entry.id)}`;
        return (
          <Link key={entry.id} href={href} className="block w-full">
            <a className={itemClass(activeKey)} data-testid={testId}>
              <Icon className="w-4 h-4 shrink-0" /> {entry.label}
            </a>
          </Link>
        );
      })}
    </div>
  );
}
