import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  History,
  ShieldCheck,
  FileCheck,
  User,
  AlertTriangle,
  ListChecks,
  Activity,
  Pill,
  ClipboardList,
  FileText,
  ScrollText,
  PhoneCall,
} from "lucide-react";
import {
  PATIENT_CHART_FORMS_CONSENT_TAB,
  patientChartReviewHref as chartReviewHrefFromTab,
} from "@/components/patient-chart-review-constants";
import {
  getPatientChartReviewNav,
  getPatientChartVisitDocNav,
  visitDocActivityIdToTab,
} from "@/lib/patient-chart-activity-ui";

type Props = {
  patientId: string;
  /** When true, clinician or nurse — show Visit documentation section */
  showVisitDocumentation: boolean;
};

function NavLink({
  href,
  active,
  children,
  "data-testid": testId,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <Link href={href} className="block w-full">
      <a
        className={cn(
          "flex w-full min-w-0 items-center justify-start gap-2 rounded-md px-3 py-2 h-auto text-sm font-medium text-left ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "bg-transparent hover:bg-accent text-foreground",
          active && "bg-accent"
        )}
        data-testid={testId}
      >
        {children}
      </a>
    </Link>
  );
}

/**
 * Review + Visit documentation links shown beside toolbar routes when a patient
 * chart is active (session). Navigates to the patient chart with ?tab=…
 */
function reviewActivityIdToTab(id: string): string {
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
      return PATIENT_CHART_FORMS_CONSENT_TAB;
    default:
      return "overview";
  }
}

export function PatientChartNavigatorEmbedded({ patientId, showVisitDocumentation }: Props) {
  const [location] = useLocation();
  const { token, user } = useAuth();
  /** Reception (and similar) must not see Visit documentation links here or on the chart. */
  const docSectionVisible = showVisitDocumentation && user?.role !== "reception";
  const [showVisitSummaryLink, setShowVisitSummaryLink] = useState(false);
  const search =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
  const activeTab = search || "overview";
  const pathOnly = location.split("?")[0];
  const onDemographicsPage = pathOnly === `/patients/${patientId}/demographics`;
  const onFormsConsentTab =
    pathOnly === `/patients/${patientId}` && activeTab === PATIENT_CHART_FORMS_CONSENT_TAB;

  const reviewNavItems = getPatientChartReviewNav(user);
  const visitDocNavItems = getPatientChartVisitDocNav(user);

  const base = `/patients/${patientId}`;

  useEffect(() => {
    if (!docSectionVisible || !token) {
      setShowVisitSummaryLink(false);
      return;
    }
    const eid = sessionStorage.getItem("ehr_active_encounter_id");
    const pid = sessionStorage.getItem("ehr_active_encounter_patient_id");
    if (!eid || pid !== patientId) {
      setShowVisitSummaryLink(false);
      return;
    }
    const ac = new AbortController();
    fetch(`/api/encounters/${eid}`, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((enc: { appointmentId?: string | null } | null) => {
        setShowVisitSummaryLink(!!enc?.appointmentId);
      })
      .catch(() => setShowVisitSummaryLink(false));
    return () => ac.abort();
  }, [patientId, docSectionVisible, token, location]);

  useEffect(() => {
    const fn = () => {
      const eid = sessionStorage.getItem("ehr_active_encounter_id");
      const pid = sessionStorage.getItem("ehr_active_encounter_patient_id");
      if (!eid || pid !== patientId || !token || !docSectionVisible) {
        setShowVisitSummaryLink(false);
        return;
      }
      fetch(`/api/encounters/${eid}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((enc: { appointmentId?: string | null } | null) => setShowVisitSummaryLink(!!enc?.appointmentId))
        .catch(() => setShowVisitSummaryLink(false));
    };
    window.addEventListener("ehr-encounter-session", fn);
    return () => window.removeEventListener("ehr-encounter-session", fn);
  }, [patientId, docSectionVisible, token]);

  return (
    <nav
      className="w-52 flex-shrink-0 border border-border rounded-lg bg-muted/30 flex flex-col overflow-y-auto py-4"
      aria-label="Patient chart sections"
    >
      <div className="px-3 space-y-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
            Review
          </p>
          <div className="flex flex-col gap-0.5">
            {reviewNavItems.map((entry) => {
              const tab = reviewActivityIdToTab(entry.id);
              const href = chartReviewHrefFromTab(patientId, tab);
              const active =
                tab === "demographics"
                  ? onDemographicsPage
                  : !onDemographicsPage && (tab === PATIENT_CHART_FORMS_CONSENT_TAB ? onFormsConsentTab : activeTab === tab);
              const Icon =
                entry.id === "pc_demographics"
                  ? User
                  : entry.id === "pc_patient_call"
                    ? PhoneCall
                    : entry.id === "pc_overview"
                      ? LayoutGrid
                      : entry.id === "pc_history"
                        ? History
                        : entry.id === "pc_immunization"
                          ? ShieldCheck
                          : entry.id === "pc_results"
                            ? FileCheck
                            : FileText;
              return (
                <NavLink
                  key={entry.id}
                  href={href}
                  active={active}
                  data-testid={`tab-${entry.id.replace(/^pc_/, "")}-embedded`}
                >
                  <Icon className="w-4 h-4 shrink-0" /> {entry.label}
                </NavLink>
              );
            })}
          </div>
        </div>
        {docSectionVisible && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              Visit documentation
            </p>
            <div className="flex flex-col gap-0.5">
              {visitDocNavItems
                .filter((entry) => entry.id !== "pc_visit_summary")
                .map((entry) => {
                  const tab = visitDocActivityIdToTab(entry.id);
                  const href = `${base}?tab=${encodeURIComponent(tab)}`;
                  const Icon =
                    entry.id === "pc_allergy"
                      ? AlertTriangle
                      : entry.id === "pc_problems"
                        ? ListChecks
                        : entry.id === "pc_vitals"
                          ? Activity
                          : entry.id === "pc_medication"
                            ? Pill
                            : entry.id === "pc_orders"
                              ? ClipboardList
                              : FileText;
                  return (
                    <NavLink
                      key={entry.id}
                      href={href}
                      active={activeTab === tab}
                      data-testid={`tab-${tab}-embedded`}
                    >
                      <Icon className="w-4 h-4 shrink-0" /> {entry.label}
                    </NavLink>
                  );
                })}
            </div>
            {showVisitSummaryLink ? (
              (() => {
                const vs = visitDocNavItems.find((e) => e.id === "pc_visit_summary");
                if (!vs) return null;
                return (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                      Visit Summary
                    </p>
                    <div className="flex flex-col gap-0.5">
                      <NavLink
                        href={`${base}?tab=visit-summary`}
                        active={activeTab === "visit-summary"}
                        data-testid="tab-visit-summary-embedded"
                      >
                        <ScrollText className="w-4 h-4 shrink-0" /> {vs.label}
                      </NavLink>
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>
        )}
      </div>
    </nav>
  );
}
