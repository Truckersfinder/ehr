import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutGrid, History, ShieldCheck, FileCheck, User, PhoneCall } from "lucide-react";

export type ReviewNavActive = "overview" | "history" | "immunization" | "results" | "patient-call" | "demographics";

/**
 * Review-section navigator links (Demographics first, then Patient call and other review tabs).
 * Used on the patient chart and on the full-page demographics editor.
 */
export function PatientChartReviewNavLinks({
  patientId,
  active,
}: {
  patientId: string;
  active: ReviewNavActive;
}) {
  const itemClass = (key: ReviewNavActive) =>
    cn(
      "inline-flex w-full items-center justify-start gap-2 rounded-md px-3 py-2 h-auto text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "bg-transparent hover:bg-accent text-foreground",
      active === key && "bg-accent"
    );

  const base = `/patients/${patientId}`;

  return (
    <div className="flex flex-col gap-0.5">
      <Link href={`${base}/demographics`} className="block w-full">
        <a className={itemClass("demographics")} data-testid="nav-review-demographics">
          <User className="w-4 h-4 shrink-0" /> Demographics
        </a>
      </Link>
      <Link href={`${base}?tab=patient-call`} className="block w-full">
        <a className={itemClass("patient-call")} data-testid="nav-review-patient-call">
          <PhoneCall className="w-4 h-4 shrink-0" /> Patient call
        </a>
      </Link>
      <Link href={`${base}?tab=overview`} className="block w-full">
        <a className={itemClass("overview")} data-testid="nav-review-overview">
          <LayoutGrid className="w-4 h-4 shrink-0" /> Overview
        </a>
      </Link>
      <Link href={`${base}?tab=history`} className="block w-full">
        <a className={itemClass("history")} data-testid="nav-review-history">
          <History className="w-4 h-4 shrink-0" /> History
        </a>
      </Link>
      <Link href={`${base}?tab=immunization`} className="block w-full">
        <a className={itemClass("immunization")} data-testid="nav-review-immunization">
          <ShieldCheck className="w-4 h-4 shrink-0" /> Immunization
        </a>
      </Link>
      <Link href={`${base}?tab=results`} className="block w-full">
        <a className={itemClass("results")} data-testid="nav-review-results">
          <FileCheck className="w-4 h-4 shrink-0" /> Results
        </a>
      </Link>
    </div>
  );
}
