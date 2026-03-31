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
          "inline-flex w-full items-center justify-start gap-2 rounded-md px-3 py-2 h-auto text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
            <NavLink href={`${base}/demographics`} active={onDemographicsPage} data-testid="tab-demographics-embedded">
              <User className="w-4 h-4 shrink-0" /> Demographics
            </NavLink>
            <NavLink
              href={`${base}?tab=patient-call`}
              active={!onDemographicsPage && activeTab === "patient-call"}
              data-testid="tab-patient-call-embedded"
            >
              <PhoneCall className="w-4 h-4 shrink-0" /> Patient call
            </NavLink>
            <NavLink
              href={`${base}?tab=overview`}
              active={!onDemographicsPage && activeTab === "overview"}
              data-testid="tab-overview-embedded"
            >
              <LayoutGrid className="w-4 h-4 shrink-0" /> Overview
            </NavLink>
            <NavLink
              href={`${base}?tab=history`}
              active={!onDemographicsPage && activeTab === "history"}
              data-testid="tab-history-embedded"
            >
              <History className="w-4 h-4 shrink-0" /> History
            </NavLink>
            <NavLink
              href={`${base}?tab=immunization`}
              active={!onDemographicsPage && activeTab === "immunization"}
              data-testid="tab-immunization-embedded"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" /> Immunization
            </NavLink>
            <NavLink
              href={`${base}?tab=results`}
              active={!onDemographicsPage && activeTab === "results"}
              data-testid="tab-results-embedded"
            >
              <FileCheck className="w-4 h-4 shrink-0" /> Results
            </NavLink>
          </div>
        </div>
        {docSectionVisible && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
              Visit documentation
            </p>
            <div className="flex flex-col gap-0.5">
              <NavLink href={`${base}?tab=allergy`} active={activeTab === "allergy"} data-testid="tab-allergy-embedded">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Allergy
              </NavLink>
              <NavLink href={`${base}?tab=problems`} active={activeTab === "problems"} data-testid="tab-problems-embedded">
                <ListChecks className="w-4 h-4 shrink-0" /> Problems List
              </NavLink>
              <NavLink href={`${base}?tab=vitals`} active={activeTab === "vitals"} data-testid="tab-vitals-embedded">
                <Activity className="w-4 h-4 shrink-0" /> Vitals
              </NavLink>
              <NavLink
                href={`${base}?tab=medication`}
                active={activeTab === "medication"}
                data-testid="tab-medication-embedded"
              >
                <Pill className="w-4 h-4 shrink-0" /> Medication
              </NavLink>
              <NavLink href={`${base}?tab=orders`} active={activeTab === "orders"} data-testid="tab-orders-embedded">
                <ClipboardList className="w-4 h-4 shrink-0" /> Orders
              </NavLink>
              <NavLink href={`${base}?tab=notes`} active={activeTab === "notes"} data-testid="tab-notes-embedded">
                <FileText className="w-4 h-4 shrink-0" /> Notes
              </NavLink>
            </div>
            {showVisitSummaryLink && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Visit Summary</p>
                <div className="flex flex-col gap-0.5">
                  <NavLink
                    href={`${base}?tab=visit-summary`}
                    active={activeTab === "visit-summary"}
                    data-testid="tab-visit-summary-embedded"
                  >
                    <ScrollText className="w-4 h-4 shrink-0" /> Visit Summary
                  </NavLink>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
