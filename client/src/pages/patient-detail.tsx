import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch, Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { getStoredAuthToken } from "@/lib/auth-storage";
import { LAB_ORDER_STATUS_BADGE_CLASSES } from "@/lib/lab-order-status";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useOrgTimeZone } from "@/hooks/use-org-timezone";
import { useTranslation } from "react-i18next";
import {
  Pill, FileText, History, ShieldCheck, ListChecks, Plus, ClipboardList, FileCheck, FlaskConical, ImageIcon, Mic, Sparkles, Pencil, Activity, AlertTriangle, Loader2, LayoutGrid, User, CalendarDays, Phone, PhoneCall, Mail, MapPin, Heart, ChevronLeft, ChevronRight, Trash2, ScrollText, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { Patient, Encounter, Prescription, EncounterMedicationAdministration, LabOrder, PatientProblem, PatientNote, FamilyMember, FamilyMemberCondition, ImagingResult, ImagingOrder, PatientDocument, Vitals, PatientAllergy, Appointment, FollowUpContact } from "@shared/schema";
import { normalizePatientRow } from "@/lib/patient-photo";
import { formatInOrgTimeZone } from "@/lib/org-timezone";
import { PatientRecordTab } from "@/components/patient-record-tab";
import {
  mergeLatestStoryboardVitals,
  storyboardVitalsHasAnyValue,
  storyboardVitalsLatestTimestamp,
} from "@/lib/storyboard-vitals";
import { FAMILY_RELATIONSHIPS, COMMON_INHERITED_CONDITIONS_AFRICA } from "@/lib/family-history-constants";
import { AfricanPatientProblemSelect } from "@/components/african-patient-problem-select";
import { DOSE_OPTIONS, FREQUENCY_OPTIONS, DURATION_OPTIONS } from "@/lib/medication-order-options";
import { COMMON_LAB_TESTS_AFRICA } from "@/lib/common-lab-tests-africa";
import { COMMON_MEDICATIONS_AFRICA } from "@/lib/common-medications-africa";
import { COMMON_IMAGING_AFRICA } from "@/lib/common-imaging-africa";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VisitSummaryTab } from "@/components/visit-summary-tab";
import { AdmissionMedicationTab } from "@/components/admission-documentation/admission-medication-tab";
import { AdmissionOrdersTab } from "@/components/admission-documentation/admission-orders-tab";
import {
  SidebarTabsNavLayout,
  SIDEBAR_TABS_LIST_CLASS,
  SIDEBAR_TABS_TRIGGER_CLASS,
} from "@/components/sidebar-tabs-nav";
import { PatientCallDocumentationForm } from "@/components/patient-call-documentation-form";
import {
  setClinicianVisitDocumentationSession,
  clearClinicianVisitDocumentationSession,
  readClinicianVisitDocumentationSession,
} from "@/lib/clinician-visit-doc-session";
import { cn } from "@/lib/utils";
import {
  getPatientChartReviewNav,
  getPatientChartVisitDocNav,
  visitDocActivityIdToTab,
  reviewTabsAllowedSet,
  visitDocTabsAllowedSet,
  pickFallbackMainTab,
} from "@/lib/patient-chart-activity-ui";
import { PatientChartReviewTabTriggers, PatientChartFormsConsentTab } from "@/components/patient-chart-review-section";
import { PATIENT_CHART_SIDEBAR_TAB_TRIGGER_CLASS } from "@/components/patient-chart-review-constants";
import { apiGetJson, apiPostJson } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { getRecordDocumentTypeId, type PatientDocumentRow } from "@shared/patient-document-normalize";
import { frequencyToIntervalMinutes } from "@/lib/medication-frequency";

const ROUTE_OPTIONS: { id: "oral" | "injection" | "iv" }[] = [{ id: "oral" }, { id: "injection" }, { id: "iv" }];

function routeLabel(id: "oral" | "injection" | "iv", t: (key: string) => string): string {
  switch (id) {
    case "oral":
      return t("pages.patientDetail.routeOral");
    case "injection":
      return t("pages.patientDetail.routeInjection");
    case "iv":
      return t("pages.patientDetail.routeIv");
  }
}

const ALLERGY_REACTION_TYPES = [
  "Anaphylaxis",
  "Angioedema",
  "Rash",
  "Hives / Urticaria",
  "Bronchospasm",
  "Gastrointestinal",
  "Dermatitis",
  "Rhinitis",
  "Conjunctivitis",
  "Other",
  "Not specified",
];

function allergyReactionTypeLabel(raw: string, t: (key: string) => string): string {
  switch (raw) {
    case "Anaphylaxis":
      return t("pages.patientDetail.reactionTypeAnaphylaxis");
    case "Angioedema":
      return t("pages.patientDetail.reactionTypeAngioedema");
    case "Rash":
      return t("pages.patientDetail.reactionTypeRash");
    case "Hives / Urticaria":
      return t("pages.patientDetail.reactionTypeHivesUrticaria");
    case "Bronchospasm":
      return t("pages.patientDetail.reactionTypeBronchospasm");
    case "Gastrointestinal":
      return t("pages.patientDetail.reactionTypeGastrointestinal");
    case "Dermatitis":
      return t("pages.patientDetail.reactionTypeDermatitis");
    case "Rhinitis":
      return t("pages.patientDetail.reactionTypeRhinitis");
    case "Conjunctivitis":
      return t("pages.patientDetail.reactionTypeConjunctivitis");
    case "Other":
      return t("pages.patientDetail.other");
    case "Not specified":
      return t("pages.patientDetail.notSpecified");
    default:
      return raw;
  }
}

const BLOOD_GROUP_OPTIONS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

function safeFormatDateTime(value: unknown, timeZone: string): string {
  if (value == null || value === "") return "—";
  return formatInOrgTimeZone(value as any, "MMM d, yyyy · HH:mm", timeZone);
}

function visitDocSidebarIcon(id: string) {
  switch (id) {
    case "pc_allergy":
      return AlertTriangle;
    case "pc_problems":
      return ListChecks;
    case "pc_vitals":
      return Activity;
    case "pc_medication":
      return Pill;
    case "pc_orders":
      return ClipboardList;
    case "pc_notes":
      return FileText;
    default:
      return FileText;
  }
}

/** Active schedule encounter for this chart (from session). Use at save time — not React state — so documentation links before visitSummaryMeta finishes loading. */
function readScheduleEncounterIdForPatient(patientId: string | undefined): string | null {
  if (typeof window === "undefined" || !patientId) return null;
  const eid = sessionStorage.getItem("ehr_active_encounter_id");
  const pid = sessionStorage.getItem("ehr_active_encounter_patient_id");
  if (!eid || pid !== patientId) return null;
  return eid;
}

export default function PatientDetailPage() {
  const [, params] = useRoute("/patients/:id");
  const [location, navigate] = useLocation();
  const urlSearch = useSearch();
  const { user, token } = useAuth();
  const orgTz = useOrgTimeZone();
  const { toast } = useToast();
  const { t } = useTranslation();
  const id = params?.id;
  const authToken = token ?? getStoredAuthToken();

  const [addProblemOpen, setAddProblemOpen] = useState(false);
  const [newProblemText, setNewProblemText] = useState("");
  const [newProblemStartDate, setNewProblemStartDate] = useState("");
  const [newProblemSymptoms, setNewProblemSymptoms] = useState("");
  const [addPastProblemOpen, setAddPastProblemOpen] = useState(false);
  const [newPastProblemText, setNewPastProblemText] = useState("");
  const [newPastProblemStartDate, setNewPastProblemStartDate] = useState("");
  const [newPastProblemResolution, setNewPastProblemResolution] = useState<"current" | "resolved">("resolved");
  const [editProblemOpen, setEditProblemOpen] = useState(false);
  const [editProblem, setEditProblem] = useState<PatientProblem | null>(null);
  const [editProblemForm, setEditProblemForm] = useState({
    problemText: "",
    problemStartDate: "",
    symptoms: "",
    resolution: "resolved" as "current" | "resolved",
  });
  const [addFamilyMemberOpen, setAddFamilyMemberOpen] = useState(false);
  const [newFamilyRelationship, setNewFamilyRelationship] = useState<string>("");
  const [newFamilyRelationshipOther, setNewFamilyRelationshipOther] = useState("");
  const [addConditionOpen, setAddConditionOpen] = useState(false);
  const [addConditionFamilyMember, setAddConditionFamilyMember] = useState<FamilyMember | null>(null);
  const [newConditionSelect, setNewConditionSelect] = useState("");
  const [newConditionOther, setNewConditionOther] = useState("");
  const [newConditionNotes, setNewConditionNotes] = useState("");
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("Progress Note");
  const [editNoteOpen, setEditNoteOpen] = useState(false);
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [notePanelMode, setNotePanelMode] = useState<"new" | "edit" | null>(null);
  const [leaveNotePromptOpen, setLeaveNotePromptOpen] = useState(false);
  const [pendingLeavePath, setPendingLeavePath] = useState<string | null>(null);
  const [viewNoteOpen, setViewNoteOpen] = useState(false);
  const [viewNote, setViewNote] = useState<PatientNote | null>(null);
  const [noteListening, setNoteListening] = useState(false);
  const [notePanelCollapsed, setNotePanelCollapsed] = useState(false);
  const hasOpenNotePanel = newNoteOpen || editNoteOpen;
  const hasMinNoteContent = (text: string) => String(text ?? "").trim().length > 0;
  const newNoteHasMinContent = hasMinNoteContent(newNoteContent);
  const editNoteHasMinContent = hasMinNoteContent(editNoteContent);
  const [vitalsForm, setVitalsForm] = useState({
    temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "",
    heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "",
  });
  const [vitalsBloodGroup, setVitalsBloodGroup] = useState("");
  const [editVitalsOpen, setEditVitalsOpen] = useState(false);
  const [editVitals, setEditVitals] = useState<Vitals | null>(null);
  const [editVitalsForm, setEditVitalsForm] = useState({
    temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "",
    heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "",
    recordedAt: "",
  });
  const [newAllergyOpen, setNewAllergyOpen] = useState(false);
  const [newAllergyForm, setNewAllergyForm] = useState({ allergen: "", severity: "LOW" as "LOW" | "MEDIUM" | "HIGH", reactionType: "Not specified", reactionTypeOther: "" });
  const [allergenSuggestions, setAllergenSuggestions] = useState<string[]>([]);
  const [allergenSuggestLoading, setAllergenSuggestLoading] = useState(false);
  const [allergenSuggestOpen, setAllergenSuggestOpen] = useState(false);
  const allergenSuggestDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const allergenSuggestContainerRef = useRef<HTMLDivElement>(null);
  const [noteAiLoading, setNoteAiLoading] = useState(false);
  const noteRecognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [orderComposerType, setOrderComposerType] = useState<"lab" | "medication" | "imaging" | null>(null);
  const [newOrderForm, setNewOrderForm] = useState({ testName: "", testCode: "", priority: "routine", internalExternal: "internal" as "internal" | "external" });
  const [newImagingOrderForm, setNewImagingOrderForm] = useState({ title: "", modality: "X-Ray", internalExternal: "internal" as "internal" | "external", patientProblemId: "" });
  const [newMedOrderOpen, setNewMedOrderOpen] = useState(false);
  const [newMedOrderForm, setNewMedOrderForm] = useState({
    medicationName: "", dosage: "", frequency: "once daily", duration: "", instructions: "",
    patientProblemId: "",
    orderType: "prescription" as "prescription" | "administered",
    route: "",
    rate: "",
  });
  const [medicationTab, setMedicationTab] = useState<"history" | "administration">("history");
  const [encAdminOpen, setEncAdminOpen] = useState<{ rx: Prescription } | null>(null);
  const [encAdminForm, setEncAdminForm] = useState({ doseGiven: "", notes: "" });
  const [medNowTick, setMedNowTick] = useState(() => Date.now());
  const medDueToastRef = useRef(new Set<string>());
  const [discontinueRxOpen, setDiscontinueRxOpen] = useState(false);
  const [discontinuePrescription, setDiscontinuePrescription] = useState<Prescription | null>(null);
  const [discontinueReason, setDiscontinueReason] = useState("");
  const [mainTab, setMainTab] = useState("overview");
  const isClinicianOrNurse = user?.role === "clinician" || user?.role === "nurse";
  /** Full Navigator only after starting a visit from Schedule (session flag). Browse/search entry = Review only. */
  const [clinVisitDocUnlocked, setClinVisitDocUnlocked] = useState(false);
  /** Admission documentation unlock: clinician/nurse opened an active admission from the admitted list. */
  const [admissionDocUnlocked, setAdmissionDocUnlocked] = useState(false);
  /** Billing / admin opens chart from Billing → Visit Documentation (?visitDocReview=1&encounterId=) */
  const [billingReviewEncounterValid, setBillingReviewEncounterValid] = useState(false);

  const isVisitDocumentationReviewRole = user?.role === "super_admin" || user?.role === "reception";

  /** Prefer window/location query — wouter's useSearch() can be empty right after <Link> navigation. */
  const billingVisitDocReviewParams = useMemo(() => {
    const raw =
      typeof window !== "undefined" && window.location.search && window.location.search.length > 1
        ? window.location.search.slice(1)
        : location.includes("?")
          ? (location.split("?")[1] ?? "")
          : urlSearch || "";
    const sp = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
    if (sp.get("visitDocReview") !== "1") return null;
    const eid = sp.get("encounterId");
    if (!eid) return null;
    return { encounterId: eid };
  }, [location, urlSearch]);

  const documentationReadOnly = billingReviewEncounterValid && isVisitDocumentationReviewRole;

  const showVisitDocumentation =
    (isClinicianOrNurse && (clinVisitDocUnlocked || admissionDocUnlocked) && user?.role !== "reception") ||
    billingReviewEncounterValid;
  const reviewNav = useMemo(() => getPatientChartReviewNav(user), [user?.activityUi]);
  const visitDocNav = useMemo(() => getPatientChartVisitDocNav(user), [user?.activityUi]);
  const reviewSectionTabs = useMemo(() => reviewTabsAllowedSet(reviewNav), [reviewNav]);
  const [patientCallReasonForCall, setPatientCallReasonForCall] = useState("");
  const [patientCallOutcome, setPatientCallOutcome] = useState<"picked_up" | "did_not_pick_up" | "left_message" | "">("");
  const [patientCallDiscussion, setPatientCallDiscussion] = useState("");
  const [visitSummaryMeta, setVisitSummaryMeta] = useState<{ encounterId: string } | null>(null);
  const [encSessionTick, setEncSessionTick] = useState(0);
  /** Signed visit reopened from schedule — ask clinician/nurse before resuming documentation */
  const [reopenVisitPrompt, setReopenVisitPrompt] = useState<{ appointmentId: string } | null>(null);
  const [reopenVisitLoading, setReopenVisitLoading] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setMedNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const documentationTabs = useMemo(
    () => visitDocTabsAllowedSet(visitDocNav, !!visitSummaryMeta),
    [visitDocNav, visitSummaryMeta],
  );

  const activeAdmissionId = admissionDocUnlocked ? sessionStorage.getItem("ehr_active_admission_id") : null;

  const invalidateVisitSummaryForScheduleSession = useCallback(() => {
    const encId = readScheduleEncounterIdForPatient(id);
    if (encId) {
      void queryClient.invalidateQueries({ queryKey: ["/api/encounters", encId, "visit-summary"] });
    }
  }, [id]);

  const replaceTabInUrl = useCallback(
    (tab: string) => {
      if (!id) return;
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.pathname + url.search);
    },
    [id]
  );

  const pushTabInUrl = useCallback(
    (tab: string) => {
      if (!id) return;
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.pushState({}, "", url.pathname + url.search);
    },
    [id]
  );

  const handleMainTabChange = (nextTab: string) => {
    if (nextTab === "visit-summary" && !visitSummaryMeta) {
      const fb = pickFallbackMainTab(reviewSectionTabs, documentationTabs, showVisitDocumentation);
      setMainTab(fb);
      replaceTabInUrl(fb);
      return;
    }
    if (!showVisitDocumentation && documentationTabs.has(nextTab)) {
      const fb = pickFallbackMainTab(reviewSectionTabs, documentationTabs, showVisitDocumentation);
      setMainTab(fb);
      replaceTabInUrl(fb);
      return;
    }
    const allowedReview = reviewSectionTabs.has(nextTab);
    const allowedDoc = showVisitDocumentation && documentationTabs.has(nextTab);
    if (!allowedReview && !allowedDoc) {
      const fb = pickFallbackMainTab(reviewSectionTabs, documentationTabs, showVisitDocumentation);
      setMainTab(fb);
      replaceTabInUrl(fb);
      return;
    }
    setMainTab(nextTab);
    pushTabInUrl(nextTab);
  };

  /** Sync tab from URL (?tab=) when opening chart or using embedded navigator links */
  useEffect(() => {
    if (!id) return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (!t) return;
    const allowed = showVisitDocumentation
      ? reviewSectionTabs.has(t) || documentationTabs.has(t)
      : reviewSectionTabs.has(t);
    if (allowed) {
      setMainTab(t);
    } else {
      const fb = pickFallbackMainTab(reviewSectionTabs, documentationTabs, showVisitDocumentation);
      setMainTab(fb);
      replaceTabInUrl(fb);
    }
  }, [
    id,
    showVisitDocumentation,
    replaceTabInUrl,
    documentationTabs,
    visitSummaryMeta,
    billingReviewEncounterValid,
    reviewSectionTabs,
  ]);

  /** Visit Summary tab: schedule-started encounter only (appointment linked), clinician/nurse */
  useEffect(() => {
    const fn = () => setEncSessionTick((t) => t + 1);
    window.addEventListener("ehr-encounter-session", fn);
    return () => window.removeEventListener("ehr-encounter-session", fn);
  }, []);

  /** Keep UI in sync with session flag (schedule-started visit unlocks full navigator). */
  useEffect(() => {
    if (!isClinicianOrNurse) {
      setClinVisitDocUnlocked(false);
      setAdmissionDocUnlocked(false);
      return;
    }
    setClinVisitDocUnlocked(readClinicianVisitDocumentationSession());
    const pid = sessionStorage.getItem("ehr_active_encounter_patient_id");
    const hasAdmission = !!sessionStorage.getItem("ehr_active_admission_id");
    setAdmissionDocUnlocked(!!id && pid === id && hasAdmission);
  }, [id, isClinicianOrNurse, encSessionTick]);

  /** Patient search / browse entry: Review-only until user starts a visit from Schedule again. */
  useEffect(() => {
    if (!id) return;
    const sp = new URLSearchParams(urlSearch || "");
    const fromSearch = sp.get("fromSearch") === "1";
    const chartBrowse = sp.get("chartEntry") === "browse";
    if (!fromSearch && !chartBrowse) return;
    clearClinicianVisitDocumentationSession();
    setClinVisitDocUnlocked(false);
    sessionStorage.removeItem("ehr_active_admission_id");
    setAdmissionDocUnlocked(false);
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has("fromSearch")) {
      url.searchParams.delete("fromSearch");
      changed = true;
    }
    if (url.searchParams.has("chartEntry")) {
      url.searchParams.delete("chartEntry");
      changed = true;
    }
    if (changed) {
      const q = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (q ? `?${q}` : ""));
    }
  }, [id, urlSearch]);

  /** Validate ?visitDocReview=1&encounterId= for billing / reception review (read-only documentation). */
  useEffect(() => {
    if (!isVisitDocumentationReviewRole || !billingVisitDocReviewParams || !id || !authToken) {
      setBillingReviewEncounterValid(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const enc = await apiGetJson<Encounter>(`/api/encounters/${billingVisitDocReviewParams.encounterId}`, authToken);
        if (cancelled) return;
        if (enc.patientId !== id) {
          setBillingReviewEncounterValid(false);
          toast({
            title: t("pages.patientDetail.invalidLinkTitle"),
            description: t("pages.patientDetail.invalidEncounterLinkDesc"),
            variant: "destructive",
          });
          return;
        }
        sessionStorage.setItem("ehr_active_encounter_id", enc.id);
        sessionStorage.setItem("ehr_active_encounter_patient_id", id);
        setBillingReviewEncounterValid(true);
        window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
      } catch {
        if (!cancelled) {
          setBillingReviewEncounterValid(false);
          toast({
            title: t("pages.patientDetail.couldNotOpenVisitTitle"),
            description: t("pages.patientDetail.couldNotOpenVisitDesc"),
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisitDocumentationReviewRole, billingVisitDocReviewParams?.encounterId, id, authToken, toast]);

  useEffect(() => {
    if (!id || !authToken || !showVisitDocumentation) {
      setVisitSummaryMeta(null);
      return;
    }
    let eid: string | null = null;
    if (billingReviewEncounterValid && billingVisitDocReviewParams?.encounterId) {
      eid = billingVisitDocReviewParams.encounterId;
    } else {
      eid = sessionStorage.getItem("ehr_active_encounter_id");
      const pid = sessionStorage.getItem("ehr_active_encounter_patient_id");
      if (!eid || pid !== id) {
        setVisitSummaryMeta(null);
        return;
      }
    }
    const ac = new AbortController();
    fetch(`/api/encounters/${eid}`, { headers: { Authorization: `Bearer ${authToken}` }, signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((enc: { patientId?: string } | null) => {
        if (enc?.patientId === id) setVisitSummaryMeta({ encounterId: eid! });
        else setVisitSummaryMeta(null);
      })
      .catch(() => setVisitSummaryMeta(null));
    return () => ac.abort();
  }, [
    id,
    authToken,
    showVisitDocumentation,
    location,
    encSessionTick,
    billingReviewEncounterValid,
    billingVisitDocReviewParams?.encounterId,
  ]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "visit-summary" && !visitSummaryMeta) {
      const fb = pickFallbackMainTab(reviewSectionTabs, documentationTabs, showVisitDocumentation);
      setMainTab(fb);
      replaceTabInUrl(fb);
    }
  }, [visitSummaryMeta, replaceTabInUrl, reviewSectionTabs, documentationTabs, showVisitDocumentation]);

  /** Clear schedule-encounter session when switching to a different patient */
  useEffect(() => {
    if (!id) return;
    const storedPid = sessionStorage.getItem("ehr_active_encounter_patient_id");
    if (storedPid && storedPid !== id) {
      sessionStorage.removeItem("ehr_active_encounter_id");
      sessionStorage.removeItem("ehr_active_encounter_patient_id");
      sessionStorage.removeItem("ehr_schedule_appointment_id");
      sessionStorage.removeItem("ehr_active_admission_id");
      clearClinicianVisitDocumentationSession();
      setAdmissionDocUnlocked(false);
      window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
    }
  }, [id]);

  /** Opening chart from Admitted Patients list (?fromAdmission=1&admissionId=) starts or resumes an inpatient encounter. */
  useEffect(() => {
    if (!id || !authToken || !isClinicianOrNurse) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("fromAdmission") !== "1") return;
    const admissionId = sp.get("admissionId");
    if (!admissionId) return;

    const stripAdmissionQueryParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("fromAdmission");
      url.searchParams.delete("admissionId");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    };

    (async () => {
      try {
        const res = await fetch(`/api/patients/${id}/start-from-admission`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ admissionId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || t("pages.patientDetail.couldNotOpenAdmissionDocumentation"));
        }
        const data = (await res.json()) as { encounter: { id: string }; admissionId: string };
        sessionStorage.setItem("ehr_active_encounter_id", data.encounter.id);
        sessionStorage.setItem("ehr_active_encounter_patient_id", id);
        sessionStorage.setItem("ehr_active_admission_id", data.admissionId);
        setAdmissionDocUnlocked(true);
        // Admission documentation is editable for clinical roles (no schedule unlock required).
        setClinVisitDocUnlocked(false);
        clearClinicianVisitDocumentationSession();
        stripAdmissionQueryParams();
        window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
        // Default to the admission documentation area when opened from list.
        const docTab = documentationTabs.has("medication")
          ? "medication"
          : pickFallbackMainTab(reviewSectionTabs, documentationTabs, true);
        setMainTab(docTab);
        pushTabInUrl(docTab);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t("pages.patientDetail.couldNotOpenAdmissionDocumentation");
        toast({ title: t("common.error"), description: msg, variant: "destructive" });
        stripAdmissionQueryParams();
      }
    })();
  }, [id, authToken, isClinicianOrNurse, pushTabInUrl, toast, documentationTabs, reviewSectionTabs]);

  useEffect(() => {
    setReopenVisitPrompt(null);
    setReopenVisitLoading(false);
  }, [id]);

  /** Opening chart from Schedule (?fromSchedule=1&appointmentId=) starts or resumes an encounter */
  useEffect(() => {
    if (!id || !authToken) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("fromSchedule") !== "1") return;
    const appointmentId = sp.get("appointmentId");
    if (!appointmentId) return;

    const existingPid = sessionStorage.getItem("ehr_active_encounter_patient_id");
    const existingEid = sessionStorage.getItem("ehr_active_encounter_id");
    if (existingPid === id && existingEid) {
      setClinicianVisitDocumentationSession();
      setClinVisitDocUnlocked(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("fromSchedule");
      url.searchParams.delete("appointmentId");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
      return;
    }

    const stripScheduleQueryParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("fromSchedule");
      url.searchParams.delete("appointmentId");
      const q = url.searchParams.toString();
      window.history.replaceState({}, "", url.pathname + (q ? `?${q}` : ""));
    };

    let cancelled = false;
    (async () => {
      try {
        let appt: Appointment;
        try {
          appt = await apiGetJson<Appointment>(`/api/appointments/${appointmentId}`, authToken);
        } catch {
          if (!cancelled) {
            toast({
              title: t("pages.patientDetail.couldNotLoadAppointmentTitle"),
              description: t("pages.patientDetail.requestFailed"),
              variant: "destructive",
            });
            stripScheduleQueryParams();
          }
          return;
        }
        if (cancelled) return;
        if (appt.patientId !== id) {
          toast({
            title: t("pages.patientDetail.invalidLinkTitle"),
            description: t("pages.patientDetail.invalidAppointmentLinkDesc"),
            variant: "destructive",
          });
          stripScheduleQueryParams();
          return;
        }

        if (appt.status === "completed") {
          stripScheduleQueryParams();
          if (isClinicianOrNurse) {
            if (!cancelled) setReopenVisitPrompt({ appointmentId });
          } else {
            toast({
              title: t("pages.patientDetail.visitAlreadySignedTitle"),
              description: t("pages.patientDetail.openingChartInReviewModeDesc"),
            });
            clearClinicianVisitDocumentationSession();
            setClinVisitDocUnlocked(false);
            navigate(`/patients/${id}?chartEntry=browse`);
          }
          return;
        }

        let data: { encounter: Encounter; appointmentId: string };
        try {
          data = await apiPostJson<{ encounter: Encounter; appointmentId: string }>(
            `/api/patients/${id}/start-from-schedule`,
            { appointmentId },
            authToken,
          );
        } catch (e) {
          if (!cancelled) {
            const message = e instanceof Error ? e.message : t("pages.patientDetail.requestFailed");
            toast({
              title: t("pages.patientDetail.couldNotStartEncounterTitle"),
              description: message,
              variant: "destructive",
            });
            stripScheduleQueryParams();
          }
          return;
        }
        if (cancelled) return;
        sessionStorage.setItem("ehr_active_encounter_id", data.encounter.id);
        sessionStorage.setItem("ehr_active_encounter_patient_id", id);
        sessionStorage.setItem("ehr_schedule_appointment_id", data.appointmentId);
        setClinicianVisitDocumentationSession();
        setClinVisitDocUnlocked(true);
        window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
        queryClient.invalidateQueries({ queryKey: queryKeys.encounters.root });
        queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root });
        toast({ title: t("pages.patientDetail.encounterStartedTitle"), description: t("pages.patientDetail.visitInProgressDesc") });
        stripScheduleQueryParams();
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : t("pages.patientDetail.failedToStartEncounter");
          toast({ title: t("common.error"), description: message, variant: "destructive" });
          const url = new URL(window.location.href);
          url.searchParams.delete("fromSchedule");
          url.searchParams.delete("appointmentId");
          const q = url.searchParams.toString();
          window.history.replaceState({}, "", url.pathname + (q ? `?${q}` : ""));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authToken, toast, isClinicianOrNurse, navigate]);

  const skipReopenDeclineRef = useRef(false);

  const declineReopenVisit = useCallback(() => {
    setReopenVisitPrompt(null);
    clearClinicianVisitDocumentationSession();
    setClinVisitDocUnlocked(false);
    navigate("/schedule");
  }, [navigate]);

  const confirmReopenVisit = useCallback(async () => {
    if (!id || !authToken || !reopenVisitPrompt) return;
    setReopenVisitLoading(true);
    try {
      const data = await apiPostJson<{ encounter: Encounter; appointmentId: string }>(
        `/api/patients/${id}/reopen-from-schedule`,
        { appointmentId: reopenVisitPrompt.appointmentId },
        authToken,
      );
      sessionStorage.setItem("ehr_active_encounter_id", data.encounter.id);
      sessionStorage.setItem("ehr_active_encounter_patient_id", id);
      sessionStorage.setItem("ehr_schedule_appointment_id", data.appointmentId);
      setClinicianVisitDocumentationSession();
      setClinVisitDocUnlocked(true);
      window.dispatchEvent(new CustomEvent("ehr-encounter-session"));
      queryClient.invalidateQueries({ queryKey: queryKeys.encounters.root });
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root });
      skipReopenDeclineRef.current = true;
      setReopenVisitPrompt(null);
      window.setTimeout(() => {
        skipReopenDeclineRef.current = false;
      }, 0);
      toast({ title: t("pages.patientDetail.visitReopenedTitle"), description: t("pages.patientDetail.canEditVisitDocumentationAgainDesc") });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("pages.patientDetail.couldNotReopenVisit");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setReopenVisitLoading(false);
    }
  }, [id, authToken, reopenVisitPrompt, toast]);

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: id ? queryKeys.patients.detail(id) : queryKeys.patients.root,
    queryFn: async () =>
      normalizePatientRow(await apiGetJson<Patient>(`/api/patients/${id}`, authToken)),
    enabled: !!id && !!authToken,
  });

  useEffect(() => {
    setVitalsBloodGroup(patient?.bloodGroup ?? "");
  }, [patient?.bloodGroup]);

  const { data: encounters = [] } = useQuery<Encounter[]>({
    queryKey: id ? queryKeys.encounters.listByPatient(id) : queryKeys.encounters.root,
    queryFn: () => apiGetJson<Encounter[]>(`/api/encounters?patientId=${id}`, authToken),
    enabled: !!id,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: id ? queryKeys.prescriptions.list(id) : queryKeys.prescriptions.root,
    queryFn: () => apiGetJson<Prescription[]>(`/api/prescriptions?patientId=${id}`, authToken),
    enabled: !!id,
  });

  const activeEncounterId = readScheduleEncounterIdForPatient(id) ?? null;

  const { data: encounterMedicationAdministrations = [] } = useQuery<EncounterMedicationAdministration[]>({
    queryKey: activeEncounterId
      ? ["/api/encounters", activeEncounterId, "medication-administrations"]
      : (["/api/encounters", "medication-administrations", "idle"] as const),
    queryFn: () => apiGetJson<EncounterMedicationAdministration[]>(`/api/encounters/${activeEncounterId}/medication-administrations`, authToken),
    enabled: !!activeEncounterId && !!authToken,
    staleTime: 0,
  });

  const { data: problems = [] } = useQuery<PatientProblem[]>({
    queryKey: ["/api/patients", id, "problems"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/problems`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return res.json();
    },
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery<PatientNote[]>({
    queryKey: ["/api/patients", id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/notes`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return res.json();
    },
    enabled: !!id,
  });

  const { data: vitalsList = [] } = useQuery<Vitals[]>({
    queryKey: ["/api/patients", id, "vitals"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/vitals`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return res.json();
    },
    enabled: !!id,
  });

  const storyboardVitals = useMemo(() => mergeLatestStoryboardVitals(vitalsList), [vitalsList]);

  const { data: patientAllergies = [] } = useQuery<PatientAllergy[]>({
    queryKey: ["/api/patients", id, "allergies"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/allergies`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return res.json();
    },
    enabled: !!id,
  });

  const { data: familyHistory, isLoading: familyHistoryLoading } = useQuery<{ members: FamilyMember[]; conditions: FamilyMemberCondition[] }>({
    queryKey: ["/api/patients", id, "family-history"],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${id}/family-history`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error(t("common.error"));
      return res.json();
    },
    enabled: !!id,
  });
  const familyMembersList = familyHistory?.members ?? [];
  const familyConditionsList = familyHistory?.conditions ?? [];

  const { data: users = [] } = useQuery<{ id: string; fullName: string; username?: string }[]>({
    queryKey: queryKeys.users.root,
    queryFn: () =>
      apiGetJson<{ id: string; fullName: string; username?: string }[]>("/api/users", authToken),
    enabled: !!authToken,
  });
  const prescriberNameById = new Map(users.map((u) => [u.id, u.fullName || u.username || t("pages.patientDetail.unknownUser")]));

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: id ? queryKeys.labOrders.list(id) : queryKeys.labOrders.root,
    queryFn: () => apiGetJson<LabOrder[]>(`/api/lab-orders?patientId=${id}`, authToken),
    enabled: !!id,
  });

  const { data: imagingOrders = [] } = useQuery<ImagingOrder[]>({
    queryKey: id ? queryKeys.imagingOrders.list(id) : queryKeys.imagingOrders.root,
    queryFn: () => apiGetJson<ImagingOrder[]>(`/api/imaging-orders?patientId=${id}`, authToken),
    enabled: !!id,
  });

  const { data: imagingResults = [] } = useQuery<ImagingResult[]>({
    queryKey: id ? queryKeys.imagingResults.list(id) : queryKeys.imagingResults.root,
    queryFn: () => apiGetJson<ImagingResult[]>(`/api/imaging-results?patientId=${id}`, authToken),
    enabled: !!id,
  });

  const { data: patientDocuments = [] } = useQuery<PatientDocument[]>({
    queryKey: id ? queryKeys.patientDocuments.list(id) : queryKeys.patientDocuments.root,
    queryFn: () => apiGetJson<PatientDocument[]>(`/api/patient-documents?patientId=${id}`, authToken),
    enabled: !!id,
  });

  /** Patient documents uploaded as “Vaccination / immunization record” from Uploads */
  const vaccinationImmunizationDocuments = useMemo(
    () =>
      patientDocuments.filter((d) => {
        if (d.documentType !== "patient_document") return false;
        return getRecordDocumentTypeId(d as PatientDocumentRow) === "vaccination_record";
      }),
    [patientDocuments],
  );

  const { data: followUpContacts = [] } = useQuery<FollowUpContact[]>({
    queryKey: id ? queryKeys.followUpContacts.list(id) : queryKeys.followUpContacts.root,
    queryFn: () => apiGetJson<FollowUpContact[]>(`/api/follow-up-contacts?patientId=${id}`, authToken),
    enabled: !!id,
  });

  const addProblemMutation = useMutation({
    mutationFn: async (payload: { problem: string; status?: "active" | "past"; problemStartDate?: string; symptoms?: string; resolution?: "current" | "resolved" }) => {
      const body: Record<string, unknown> = { problem: payload.problem, status: payload.status ?? "active" };
      if (payload.problemStartDate) body.problemStartDate = payload.problemStartDate;
      if (payload.symptoms !== undefined) body.symptoms = payload.symptoms?.trim() || null;
      if (payload.status === "past" && payload.resolution) body.resolution = payload.resolution;
      const res = await fetch(`/api/patients/${id}/problems`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (res.ok && res.status === 201) {
          queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
          return { id: "", problem: payload.problem, status: payload.status ?? "active", createdAt: new Date().toISOString() };
        }
        throw new Error(t("pages.patientDetail.serverErrorSameOrigin", { status: res.status }));
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.requestFailed"));
      return data as { id: string; problem: string; status: string; createdAt: string };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
      toast({ title: variables.status === "past" ? t("pages.patientDetail.pastProblemAdded") : t("pages.patientDetail.problemAdded") });
      setAddProblemOpen(false);
      setNewProblemText("");
      setNewProblemStartDate("");
      setNewProblemSymptoms("");
      setAddPastProblemOpen(false);
      setNewPastProblemText("");
      setNewPastProblemStartDate("");
      setNewPastProblemResolution("resolved");
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateProblemMutation = useMutation({
    mutationFn: async ({ problemId, problem, problemStartDate, symptoms, resolution, status }: { problemId: string; problem: string; problemStartDate?: string; symptoms?: string; resolution?: "current" | "resolved"; status?: "active" | "past" }) => {
      const body: Record<string, unknown> = { problem: problem.trim(), problemStartDate: problemStartDate || null, symptoms: symptoms !== undefined ? (symptoms?.trim() || null) : undefined, resolution: resolution || null };
      if (status !== undefined) body.status = status;
      const res = await fetch(`/api/patients/${id}/problems/${problemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? t("pages.patientDetail.invalidResponse") : t("pages.patientDetail.serverError", { status: res.status }));
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.requestFailed"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
      toast({ title: t("pages.patientDetail.problemUpdated") });
      setEditProblemOpen(false);
      setEditProblem(null);
      setEditProblemForm({ problemText: "", problemStartDate: "", symptoms: "", resolution: "resolved" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const resolveProblemMutation = useMutation({
    mutationFn: async (problemId: string) => {
      const res = await fetch(`/api/patients/${id}/problems/${problemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ status: "past", resolution: "resolved" }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? t("pages.patientDetail.invalidResponse") : t("pages.patientDetail.serverError", { status: res.status }));
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.requestFailed"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "problems"] });
      toast({ title: t("pages.patientDetail.problemResolvedMovedToHistory") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const addFamilyMemberMutation = useMutation({
    mutationFn: async (relationship: string) => {
      const res = await fetch(`/api/patients/${id}/family-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ relationship: relationship.trim() }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          res.ok
            ? t("pages.patientDetail.invalidResponseFromServer")
            : t("pages.patientDetail.serverErrorEnsureSameOrigin", { status: res.status }),
        );
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.requestFailed"));
      return data as { id: string; patientId: string; relationship: string; createdAt: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "family-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "family-history"] });
      toast({ title: t("pages.patientDetail.familyMemberAdded") });
      setAddFamilyMemberOpen(false);
      setNewFamilyRelationship("");
      setNewFamilyRelationshipOther("");
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const addFamilyConditionMutation = useMutation({
    mutationFn: async ({ familyMemberId, condition, notes }: { familyMemberId: string; condition: string; notes?: string }) => {
      const res = await fetch(`/api/family-members/${familyMemberId}/conditions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ condition: condition.trim(), notes: notes?.trim() || undefined }),
      });
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          res.ok ? t("pages.patientDetail.invalidResponse") : t("pages.patientDetail.serverErrorSameOriginShort", { status: res.status }),
        );
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.requestFailed"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "family-history"] });
      toast({ title: t("pages.patientDetail.conditionAdded") });
      setAddConditionOpen(false);
      setAddConditionFamilyMember(null);
      setNewConditionSelect("");
      setNewConditionOther("");
      setNewConditionNotes("");
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const NOTE_TYPES = ["Progress Note", "SOAP Note", "Nursing Note", "H&P", "Discharge Summary", "Consult Note", "Procedure Note", "Admission Note"];

  useEffect(() => {
    if (!newNoteOpen) return;
    const Win = typeof window !== "undefined" ? window : ({} as Window);
    const SR = (Win as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition
      || (Win as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result?.isFinal && result[0]?.transcript) {
          const transcript = result[0].transcript;
          setNewNoteContent((prev) => (prev ? prev + " " + transcript : transcript));
        }
      }
    };
    rec.onend = () => setNoteListening(false);
    rec.onerror = () => setNoteListening(false);
    noteRecognitionRef.current = { start: () => { rec.start(); setNoteListening(true); }, stop: () => { rec.stop(); } };
    return () => {
      try { rec.abort(); } catch { /* ignore */ }
      noteRecognitionRef.current = null;
      setNoteListening(false);
    };
  }, [newNoteOpen]);

  useEffect(() => {
    const onLeaveRequest = (event: Event) => {
      const detail = event as CustomEvent<string>;
      const nextPath = detail.detail;
      if (!hasOpenNotePanel) {
        navigate(nextPath);
        return;
      }
      setPendingLeavePath(nextPath);
      setLeaveNotePromptOpen(true);
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasOpenNotePanel) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("ehr-request-leave", onLeaveRequest as EventListener);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("ehr-request-leave", onLeaveRequest as EventListener);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasOpenNotePanel, navigate]);

  const toggleNoteDictation = () => {
    if (noteListening) {
      noteRecognitionRef.current?.stop();
    } else {
      if (!noteRecognitionRef.current) {
        toast({
          title: t("pages.patientDetail.dictationNotSupportedTitle"),
          description: t("pages.patientDetail.dictationNotSupportedDesc"),
          variant: "destructive",
        });
        return;
      }
      noteRecognitionRef.current.start();
      toast({ title: t("pages.patientDetail.listeningTitle"), description: t("pages.patientDetail.listeningDesc") });
    }
  };

  const openNewNotePanel = () => {
    setNewNoteOpen(true);
    setEditNoteOpen(false);
    setEditNoteId(null);
    setEditNoteContent("");
    setNotePanelMode("new");
  };

  const openEditNotePanel = (noteId: string, content: string) => {
    setEditNoteId(noteId);
    setEditNoteContent(content);
    setNewNoteOpen(false);
    setNotePanelMode("edit");
    setEditNoteOpen(true);
  };

  const closeNotePanel = () => {
    setNewNoteOpen(false);
    setEditNoteOpen(false);
    setEditNoteId(null);
    setEditNoteContent("");
    setNewNoteType("Progress Note");
    setNotePanelMode(null);
    setNoteListening(false);
    setNotePanelCollapsed(false);
  };

  const signAndLeavePending = () => {
    if (newNoteOpen) {
      addNoteMutation.mutate({ content: newNoteContent, noteKind: newNoteType });
      return;
    }
    if (editNoteOpen && editNoteId) {
      updateNoteMutation.mutate({ noteId: editNoteId, content: editNoteContent });
    }
  };

  const promptLeaveIfNoteOpen = (nextPath: string) => {
    if (!hasOpenNotePanel) {
      navigate(nextPath);
      return;
    }
    setPendingLeavePath(nextPath);
    setLeaveNotePromptOpen(true);
  };

  const handleAiSuggestNote = async () => {
    setNoteAiLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-note", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ text: newNoteContent, noteKind: newNoteType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("pages.patientDetail.aiSuggestionFailed"));
      if (data.suggested) setNewNoteContent(data.suggested);
      else
        toast({
          title: t("pages.patientDetail.noSuggestionTitle"),
          description: t("pages.patientDetail.aiDidNotReturnText"),
          variant: "destructive",
        });
    } catch (e) {
      toast({
        title: t("pages.patientDetail.aiHelpUnavailableTitle"),
        description: e instanceof Error ? e.message : t("pages.patientDetail.couldNotGetSuggestion"),
        variant: "destructive",
      });
    } finally {
      setNoteAiLoading(false);
    }
  };

  const addNoteMutation = useMutation({
    mutationFn: async (payload: { content: string; noteKind: string }) => {
      let res: Response;
      try {
        res = await fetch(`/api/patients/${id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            content: payload.content,
            noteKind: payload.noteKind,
            ...(readScheduleEncounterIdForPatient(id) ? { encounterId: readScheduleEncounterIdForPatient(id)! } : {}),
          }),
        });
      } catch (e) {
        const msg = e instanceof Error && e.message === "Failed to fetch"
          ? t("pages.patientDetail.cannotReachServerLong")
          : (e instanceof Error ? e.message : t("pages.patientDetail.networkError"));
        throw new Error(msg);
      }
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? t("pages.patientDetail.invalidResponse") : t("pages.patientDetail.serverError", { status: res.status }));
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.failedToSignNote"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "notes"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.noteSignedAndSaved") });
      closeNotePanel();
      if (pendingLeavePath) {
        const next = pendingLeavePath;
        setPendingLeavePath(null);
        navigate(next);
      }
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (payload: { noteId: string; content: string; signAndSave?: boolean; saveAsIncomplete?: boolean }) => {
      let res: Response;
      try {
        res = await fetch(`/api/patients/${id}/notes/${payload.noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            content: payload.content,
            ...(payload.signAndSave && { signAndSave: true }),
            ...(payload.saveAsIncomplete && { saveAsIncomplete: true }),
            ...(payload.signAndSave && readScheduleEncounterIdForPatient(id)
              ? { encounterId: readScheduleEncounterIdForPatient(id)! }
              : {}),
          }),
        });
      } catch (e) {
        const msg = e instanceof Error && e.message === "Failed to fetch"
          ? t("pages.patientDetail.cannotReachServerShort")
          : (e instanceof Error ? e.message : t("pages.patientDetail.networkError"));
        throw new Error(msg);
      }
      if (!res.ok) {
        let data: { message?: string };
        try {
          data = await res.json();
        } catch {
          throw new Error(t("pages.patientDetail.serverError", { status: res.status }));
        }
        throw new Error(data.message || t("pages.patientDetail.failedToUpdateNote"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "notes"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.noteUpdated") });
      closeNotePanel();
      if (pendingLeavePath) {
        const next = pendingLeavePath;
        setPendingLeavePath(null);
        navigate(next);
      }
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const saveIncompleteNoteMutation = useMutation({
    mutationFn: async (payload: { content: string; noteKind: string } | { noteId: string; content: string }) => {
      const networkErrorMsg = t("pages.patientDetail.cannotReachServerShort");
      if ("noteId" in payload) {
        let res: Response;
        try {
          res = await fetch(`/api/patients/${id}/notes/${payload.noteId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ content: payload.content, saveAsIncomplete: true }),
          });
        } catch (e) {
          throw new Error(e instanceof Error && e.message === "Failed to fetch" ? networkErrorMsg : (e instanceof Error ? e.message : t("pages.patientDetail.networkError")));
        }
        if (!res.ok) {
          let data: { message?: string };
          try {
            data = await res.json();
          } catch {
            throw new Error(t("pages.patientDetail.serverErrorNoStatus"));
          }
          throw new Error(data.message || t("pages.patientDetail.failedToSaveNote"));
        }
        return res.json();
      }
      let res: Response;
      try {
        res = await fetch(`/api/patients/${id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({
            content: payload.content || "(Draft)",
            noteKind: payload.noteKind,
            saveAsIncomplete: true,
            ...(readScheduleEncounterIdForPatient(id) ? { encounterId: readScheduleEncounterIdForPatient(id)! } : {}),
          }),
        });
      } catch (e) {
        throw new Error(e instanceof Error && e.message === "Failed to fetch" ? networkErrorMsg : (e instanceof Error ? e.message : t("pages.patientDetail.networkError")));
      }
      const text = await res.text();
      let data: { message?: string } | unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.ok ? t("pages.patientDetail.invalidResponse") : t("pages.patientDetail.serverErrorNoStatus"));
      }
      if (!res.ok) throw new Error((data as { message?: string }).message || t("pages.patientDetail.failedToSaveNote"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "notes"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.noteSavedAsIncomplete") });
      closeNotePanel();
      if (pendingLeavePath) {
        const next = pendingLeavePath;
        setPendingLeavePath(null);
        navigate(next);
      }
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const recordVitalsMutation = useMutation({
    mutationFn: async (data: typeof vitalsForm) => {
      const res = await fetch(`/api/patients/${id}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          temperature: data.temperature || undefined,
          bloodPressureSystolic: data.bloodPressureSystolic || undefined,
          bloodPressureDiastolic: data.bloodPressureDiastolic || undefined,
          heartRate: data.heartRate || undefined,
          respiratoryRate: data.respiratoryRate || undefined,
          oxygenSaturation: data.oxygenSaturation || undefined,
          weight: data.weight || undefined,
          height: data.height || undefined,
          ...(readScheduleEncounterIdForPatient(id) ? { encounterId: readScheduleEncounterIdForPatient(id)! } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("pages.patientDetail.failedToRecordVitals"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "vitals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "latest-vitals"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.vitalsRecorded") });
      setVitalsForm({ temperature: "", bloodPressureSystolic: "", bloodPressureDiastolic: "", heartRate: "", respiratoryRate: "", oxygenSaturation: "", weight: "", height: "" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateVitalsMutation = useMutation({
    mutationFn: async ({ vitalId, data }: { vitalId: string; data: typeof editVitalsForm }) => {
      const payload: Record<string, unknown> = {};
      if (data.temperature !== "") payload.temperature = data.temperature;
      if (data.bloodPressureSystolic !== "") payload.bloodPressureSystolic = data.bloodPressureSystolic;
      if (data.bloodPressureDiastolic !== "") payload.bloodPressureDiastolic = data.bloodPressureDiastolic;
      if (data.heartRate !== "") payload.heartRate = data.heartRate;
      if (data.respiratoryRate !== "") payload.respiratoryRate = data.respiratoryRate;
      if (data.oxygenSaturation !== "") payload.oxygenSaturation = data.oxygenSaturation;
      if (data.weight !== "") payload.weight = data.weight;
      if (data.height !== "") payload.height = data.height;
      if (data.recordedAt !== "") payload.recordedAt = data.recordedAt;
      const res = await fetch(`/api/patients/${id}/vitals/${vitalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("pages.patientDetail.failedToUpdateVitals"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "vitals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "latest-vitals"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.vitalsUpdated") });
      setEditVitalsOpen(false);
      setEditVitals(null);
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const updateBloodGroupMutation = useMutation({
    mutationFn: async (bloodGroup: string) => {
      const res = await fetch(`/api/patients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ bloodGroup: bloodGroup.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("pages.patientDetail.failedToUpdateBloodGroup"));
      }
      return normalizePatientRow(await res.json());
    },
    onSuccess: (updatedPatient) => {
      queryClient.setQueryData<Patient>(["/api/patients", id], updatedPatient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.patients.root });
      toast({ title: t("pages.patientDetail.bloodGroupUpdated") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const addAllergyMutation = useMutation({
    mutationFn: async (payload: { allergen: string; severity: "LOW" | "MEDIUM" | "HIGH"; reactionType?: string }) => {
      const res = await fetch(`/api/patients/${id}/allergies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ ...payload, reactionType: payload.reactionType === "Not specified" ? undefined : payload.reactionType }),
      });
      if (!res.ok) {
        let message = t("pages.patientDetail.failedToAddAllergy");
        try {
          const err = await res.json();
          if (err && typeof err.message === "string" && err.message) message = err.message;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message);
      }
      try {
        return await res.json();
      } catch {
        throw new Error(t("pages.patientDetail.invalidResponseFromServer"));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "allergies"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.allergyAdded") });
      setNewAllergyOpen(false);
      setNewAllergyForm({ allergen: "", severity: "LOW", reactionType: "Not specified", reactionTypeOther: "" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteAllergyMutation = useMutation({
    mutationFn: async (allergyId: string) => {
      const res = await fetch(`/api/patients/${id}/allergies/${allergyId}`, { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error(t("pages.patientDetail.failedToRemoveAllergy"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients", id, "allergies"] });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.allergyRemoved") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!newAllergyOpen) {
      setAllergenSuggestions([]);
      setAllergenSuggestOpen(false);
      return;
    }
    const q = newAllergyForm.allergen.trim();
    if (q.length < 2) {
      setAllergenSuggestions([]);
      setAllergenSuggestLoading(false);
      return;
    }
    setAllergenSuggestLoading(true);
    if (allergenSuggestDebounceRef.current) clearTimeout(allergenSuggestDebounceRef.current);
    allergenSuggestDebounceRef.current = setTimeout(() => {
      fetch(`/api/allergies/suggest?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${authToken}` } })
        .then((res) => (res.ok ? res.json() : { suggestions: [] }))
        .then((data: { suggestions?: string[] }) => setAllergenSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []))
        .catch(() => setAllergenSuggestions([]))
        .finally(() => setAllergenSuggestLoading(false));
    }, 300);
    return () => {
      if (allergenSuggestDebounceRef.current) clearTimeout(allergenSuggestDebounceRef.current);
    };
  }, [newAllergyOpen, newAllergyForm.allergen, authToken]);

  useEffect(() => {
    if (!allergenSuggestOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = allergenSuggestContainerRef.current;
      if (el && !el.contains(e.target as Node)) setAllergenSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [allergenSuggestOpen]);

  const addOrderMutation = useMutation({
    mutationFn: async (data: { testName: string; testCode: string; priority: string; internalExternal: "internal" | "external" }) => {
      const res = await fetch("/api/lab-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          orderedBy: user?.id,
          testName: data.testName,
          testCode: data.testCode || undefined,
          priority: data.priority,
          internalExternal: data.internalExternal || "internal",
          status: "ordered",
          ...(readScheduleEncounterIdForPatient(id) ? { encounterId: readScheduleEncounterIdForPatient(id)! } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("pages.patientDetail.requestFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labOrders.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.labOrderCreated") });
      setNewOrderOpen(false);
      setOrderComposerType(null);
      setNewOrderForm({ testName: "", testCode: "", priority: "routine", internalExternal: "internal" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const addImagingOrderMutation = useMutation({
    mutationFn: async (data: { title: string; modality: string; internalExternal: "internal" | "external"; patientProblemId?: string }) => {
      const res = await fetch("/api/imaging-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          orderedBy: user?.id,
          title: data.title.trim(),
          modality: data.modality.trim(),
          internalExternal: data.internalExternal || "internal",
          patientProblemId: data.patientProblemId?.trim() || undefined,
          status: "ordered",
          ...(readScheduleEncounterIdForPatient(id) ? { encounterId: readScheduleEncounterIdForPatient(id)! } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("pages.patientDetail.requestFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imagingOrders.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.imagingOrderCreated") });
      setNewOrderOpen(false);
      setOrderComposerType(null);
      setNewImagingOrderForm({ title: "", modality: "X-Ray", internalExternal: "internal", patientProblemId: "" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const recordEncounterMedicationAdministrationMutation = useMutation({
    mutationFn: async (rx: Prescription) => {
      if (!activeEncounterId) throw new Error(t("pages.patientDetail.missingEncounter"));
      const res = await fetch(`/api/encounters/${activeEncounterId}/medication-administrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          encounterId: activeEncounterId,
          prescriptionId: rx.id,
          patientId: id,
          administeredBy: user?.id,
          administeredAt: new Date().toISOString(),
          doseGiven: encAdminForm.doseGiven.trim() || null,
          notes: encAdminForm.notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || t("pages.patientDetail.requestFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/encounters", activeEncounterId, "medication-administrations"] });
      toast({ title: t("pages.patientDetail.administrationRecorded") });
      setEncAdminOpen(null);
      setEncAdminForm({ doseGiven: "", notes: "" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const addPrescriptionMutation = useMutation({
    mutationFn: async (data: typeof newMedOrderForm) => {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          patientId: id,
          prescribedBy: user?.id,
          patientProblemId: data.patientProblemId?.trim() || undefined,
          orderType: data.orderType,
          medicationName: data.medicationName.trim(),
          dosage: data.dosage.trim(),
          frequency: data.frequency.trim(),
          duration: data.orderType === "prescription" ? (data.duration.trim() || undefined) : undefined,
          instructions: data.instructions.trim() || undefined,
          route: data.orderType === "administered" ? (data.route || null) : null,
          rate: data.orderType === "administered" && data.route === "iv" ? (data.rate?.trim() || null) : null,
          status: "active",
          ...(readScheduleEncounterIdForPatient(id) ? { encounterId: readScheduleEncounterIdForPatient(id)! } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("pages.patientDetail.requestFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.medicationOrderCreated") });
      setNewMedOrderOpen(false);
      setNewOrderOpen(false);
      setOrderComposerType(null);
      setNewMedOrderForm({ medicationName: "", dosage: "", frequency: "once daily", duration: "", instructions: "", patientProblemId: "", orderType: "prescription", route: "", rate: "" });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const discontinuePrescriptionMutation = useMutation({
    mutationFn: async ({ prescriptionId, reason }: { prescriptionId: string; reason: string }) => {
      const prescription = prescriptions.find((rx) => rx.id === prescriptionId);
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          status: "cancelled",
          instructions: [prescription?.instructions, `Discontinued reason: ${reason}`].filter(Boolean).join("\n"),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || t("pages.patientDetail.requestFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.medicationDiscontinued") });
      setDiscontinueRxOpen(false);
      setDiscontinuePrescription(null);
      setDiscontinueReason("");
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deletePrescriptionMutation = useMutation({
    mutationFn: async (prescriptionId: string) => {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("pages.patientDetail.failedToDeleteMedication"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prescriptions.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.medicationDeleted") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteLabOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/lab-orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("pages.patientDetail.failedToDeleteLabOrder"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.labOrders.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.orderDeleted") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const deleteImagingOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/imaging-orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || t("pages.patientDetail.failedToDeleteImagingOrder"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imagingOrders.list(id!) });
      invalidateVisitSummaryForScheduleSession();
      toast({ title: t("pages.patientDetail.orderDeleted") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const role = user?.role?.toLowerCase?.() ?? "";
  const isClinician = role === "clinician";
  const canOrder = role === "clinician" || role === "nurse";
  const canAddNote = role === "clinician" || role === "nurse";
  /** No visit-documentation tabs (e.g. reception, or browse entry): Navigator + overview links stay in Review only. */
  const reviewOnlyNavigator = !showVisitDocumentation;
  const pathOnly = location.split("?")[0];
  const onDemographicsPage = id ? pathOnly === `/patients/${id}/demographics` : false;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("pages.patientDetail.patientNotFound")}</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    ...LAB_ORDER_STATUS_BADGE_CLASSES,
    completed: "bg-chart-3/10 text-chart-3",
    in_progress: "bg-chart-4/10 text-chart-4",
    scheduled: "bg-accent text-accent-foreground",
    cancelled: "bg-destructive/10 text-destructive",
    active: "bg-chart-3/10 text-chart-3",
    dispensed: "bg-primary/10 text-primary",
    paid: "bg-chart-3/10 text-chart-3",
    pending: "bg-chart-4/10 text-chart-4",
    partial: "bg-chart-5/10 text-chart-5",
  };

  return (
    <div className="flex h-screen min-h-0 flex-1 overflow-hidden" data-testid="patient-detail-page">
      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        {documentationReadOnly ? (
          <div
            className="shrink-0 border-b border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground"
            role="status"
            data-testid="billing-visit-doc-readonly-banner"
          >
            <span className="font-medium text-foreground">{t("pages.patientDetail.viewOnlyLabel")}</span>{" "}
            — {t("pages.patientDetail.viewOnlyDesc")}
          </div>
        ) : null}
        <Tabs value={mainTab} onValueChange={handleMainTabChange} className="flex flex-1 min-w-0 overflow-hidden">
          <nav className="w-52 flex-shrink-0 border border-border rounded-lg bg-muted/30 flex flex-col overflow-y-auto py-4">
          <div className="px-3 space-y-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                {t("pages.patientDetail.reviewSectionLabel")}
              </p>
              <div className="flex flex-col gap-0.5">
                {reviewNav.some((e) => e.id === "pc_demographics") ? (
                  <Link href={`/patients/${id}/demographics`} className="block w-full min-w-0">
                    <a
                      className={cn(
                        "flex w-full min-w-0 items-center justify-start gap-2 rounded-md px-3 py-2 h-auto text-sm font-medium text-left ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "bg-transparent hover:bg-accent text-foreground",
                        onDemographicsPage && "bg-accent",
                      )}
                      data-testid="nav-review-demographics"
                    >
                      <User className="w-4 h-4 shrink-0" />{" "}
                      {reviewNav.find((e) => e.id === "pc_demographics")?.label ?? t("pages.patientDetail.navDemographicsFallback")}
                    </a>
                  </Link>
                ) : null}
                <TabsList className="flex flex-col gap-0.5 h-auto p-0 bg-transparent rounded-none">
                  <PatientChartReviewTabTriggers items={reviewNav} />
                </TabsList>
              </div>
            </div>
            {showVisitDocumentation && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                  {admissionDocUnlocked
                    ? t("pages.patientDetail.docSectionAdmission")
                    : t("pages.patientDetail.docSectionVisit")}
                </p>
                <TabsList className="flex flex-col gap-0.5 h-auto p-0 bg-transparent rounded-none">
                  {visitDocNav
                    .filter((e) => e.id !== "pc_visit_summary")
                    .map((entry) => {
                      const tab = visitDocActivityIdToTab(entry.id);
                      const Icon = visitDocSidebarIcon(entry.id);
                      return (
                        <TabsTrigger
                          key={entry.id}
                          value={tab}
                          data-testid={`tab-${tab}`}
                          className={PATIENT_CHART_SIDEBAR_TAB_TRIGGER_CLASS}
                        >
                          <Icon className="w-4 h-4 shrink-0" /> {entry.label}
                        </TabsTrigger>
                      );
                    })}
                </TabsList>
                {visitSummaryMeta && visitDocNav.some((e) => e.id === "pc_visit_summary") ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                      {t("pages.patientDetail.visitSummarySection")}
                    </p>
                    <TabsList className="flex flex-col gap-0.5 h-auto p-0 bg-transparent rounded-none">
                      <TabsTrigger
                        value="visit-summary"
                        data-testid="tab-visit-summary"
                        className={PATIENT_CHART_SIDEBAR_TAB_TRIGGER_CLASS}
                      >
                        <ScrollText className="w-4 h-4 shrink-0" />{" "}
                        {visitDocNav.find((e) => e.id === "pc_visit_summary")?.label ??
                          t("pages.patientDetail.visitSummarySection")}
                      </TabsTrigger>
                    </TabsList>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </nav>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
        <TabsContent value="overview" className="mt-0 data-[state=inactive]:hidden">
          <div className="p-4 space-y-6 max-w-6xl">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t("pages.patientDetail.chartOverviewTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("pages.patientDetail.chartOverviewDesc")}</p>
            </div>

            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                {reviewOnlyNavigator ? (
                  <div className="w-full text-left font-semibold text-foreground flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 shrink-0" />
                    {t("pages.patientDetail.vitalsTitle")}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleMainTabChange("vitals")}
                    className="w-full text-left font-semibold text-primary hover:underline underline-offset-2 flex items-center gap-2 mb-3"
                  >
                    <Activity className="w-4 h-4 shrink-0" />
                    {t("pages.patientDetail.vitalsTitle")}
                  </button>
                )}
                {vitalsList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientDetail.noVitalsRecordedHint")}</p>
                ) : !(storyboardVitals && storyboardVitalsHasAnyValue(storyboardVitals)) ? (
                  <p className="text-sm text-muted-foreground">{t("pages.patientDetail.noVitalMeasurementsYet")}</p>
                ) : (
                  <>
                    <div className="mb-4 space-y-2 text-sm">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t("pages.patientDetail.mostRecentValues")}
                      </p>
                      {(() => {
                        const latest = storyboardVitalsLatestTimestamp(storyboardVitals);
                        return (
                          <p className="text-xs text-muted-foreground">
                            {latest ? format(latest, "MMM d, yyyy · HH:mm") : ""}
                          </p>
                        );
                      })()}
                      <ul className="space-y-1.5">
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.temperatureLabel")}</span>
                          <span>
                            {storyboardVitals.temperature != null ? `${storyboardVitals.temperature} °C` : "—"}
                          </span>
                        </li>
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.bloodPressureLabel")}</span>
                          <span>
                            {storyboardVitals.bloodPressureSystolic != null || storyboardVitals.bloodPressureDiastolic != null
                              ? `${storyboardVitals.bloodPressureSystolic ?? "—"} / ${storyboardVitals.bloodPressureDiastolic ?? "—"} mmHg`
                              : "—"}
                          </span>
                        </li>
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.pulseRateLabel")}</span>
                          <span>{storyboardVitals.pulseRate != null ? `${storyboardVitals.pulseRate} bpm` : "—"}</span>
                        </li>
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.respirationRateLabel")}</span>
                          <span>{storyboardVitals.respiratoryRate != null ? `${storyboardVitals.respiratoryRate} /min` : "—"}</span>
                        </li>
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.oxygenSaturationLabel")}</span>
                          <span>
                            {storyboardVitals.oxygenSaturation != null ? `${storyboardVitals.oxygenSaturation}%` : "—"}
                          </span>
                        </li>
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.weightLabel")}</span>
                          <span>{storyboardVitals.weight != null ? `${storyboardVitals.weight} kg` : "—"}</span>
                        </li>
                        <li className="flex flex-wrap gap-x-2">
                          <span className="font-medium text-foreground">{t("pages.patientDetail.heightLabel")}</span>
                          <span>{storyboardVitals.height != null ? `${storyboardVitals.height} cm` : "—"}</span>
                        </li>
                      </ul>
                    </div>
                    {vitalsList.length >= 2 && (() => {
                      const num = (v: unknown) => {
                        if (v == null || v === "") return null;
                        const n = typeof v === "string" ? parseFloat(v) : Number(v);
                        return Number.isFinite(n) ? n : null;
                      };
                      const chartData = [...vitalsList.slice(0, 3)].reverse().map((v) => ({
                        date: v.recordedAt ? formatInOrgTimeZone(v.recordedAt, "MMM d", orgTz) : "",
                        systolic: v.bloodPressureSystolic != null ? Number(v.bloodPressureSystolic) : null,
                        diastolic: v.bloodPressureDiastolic != null ? Number(v.bloodPressureDiastolic) : null,
                        heartRate: v.heartRate != null ? Number(v.heartRate) : null,
                        respiratoryRate: v.respiratoryRate != null ? Number(v.respiratoryRate) : null,
                        temperature: num(v.temperature),
                        oxygenSaturation: v.oxygenSaturation != null ? Number(v.oxygenSaturation) : null,
                        weight: num(v.weight),
                        height: num(v.height),
                      }));
                      const hasBp = chartData.some((d) => d.systolic != null || d.diastolic != null);
                      const hasHr = chartData.some((d) => d.heartRate != null);
                      const hasRr = chartData.some((d) => d.respiratoryRate != null);
                      const hasTemp = chartData.some((d) => d.temperature != null);
                      const hasSpo2 = chartData.some((d) => d.oxygenSaturation != null);
                      const hasWt = chartData.some((d) => d.weight != null);
                      const hasHt = chartData.some((d) => d.height != null);
                      return (
                        <div className="h-[240px] w-full">
                          <p className="text-xs text-muted-foreground mb-2">{t("pages.patientDetail.trendLast3")}</p>
                          <ChartContainer
                            config={{
                              systolic: { label: t("pages.patientDetail.chartBpSystolic"), color: "hsl(var(--chart-1))" },
                              diastolic: { label: t("pages.patientDetail.chartBpDiastolic"), color: "hsl(var(--chart-2))" },
                              heartRate: { label: t("pages.patientDetail.chartPulseRate"), color: "hsl(var(--chart-3))" },
                              respiratoryRate: { label: t("pages.patientDetail.chartRespirationRate"), color: "hsl(var(--chart-4))" },
                              temperature: { label: t("pages.patientDetail.chartTempC"), color: "hsl(var(--chart-5))" },
                              oxygenSaturation: { label: t("pages.patientDetail.chartSpo2"), color: "hsl(var(--primary))" },
                              weight: { label: t("pages.patientDetail.chartWeightKg"), color: "hsl(var(--chart-5))" },
                              height: { label: t("pages.patientDetail.chartHeightCm"), color: "hsl(var(--chart-2))" },
                            }}
                            className="h-full w-full"
                          >
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                              <YAxis tick={{ fontSize: 10 }} width={28} />
                              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value: number) => [value, ""]} />
                              <Legend verticalAlign="bottom" height={52} wrapperStyle={{ fontSize: 10 }} iconType="line" iconSize={8} />
                              {hasBp && <Line type="monotone" dataKey="systolic" name={t("pages.patientDetail.chartBpSystolic")} stroke="var(--color-systolic)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasBp && <Line type="monotone" dataKey="diastolic" name={t("pages.patientDetail.chartBpDiastolic")} stroke="var(--color-diastolic)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasHr && <Line type="monotone" dataKey="heartRate" name={t("pages.patientDetail.chartPulseRate")} stroke="var(--color-heartRate)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasRr && <Line type="monotone" dataKey="respiratoryRate" name={t("pages.patientDetail.chartRespirationRate")} stroke="var(--color-respiratoryRate)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasTemp && <Line type="monotone" dataKey="temperature" name={t("pages.patientDetail.chartTempC")} stroke="var(--color-temperature)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasSpo2 && <Line type="monotone" dataKey="oxygenSaturation" name={t("pages.patientDetail.chartSpo2")} stroke="var(--color-oxygenSaturation)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasWt && <Line type="monotone" dataKey="weight" name="Weight kg" stroke="var(--color-weight)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                              {hasHt && <Line type="monotone" dataKey="height" name="Height cm" stroke="var(--color-height)" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
                            </LineChart>
                          </ChartContainer>
                        </div>
                      );
                    })()}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => handleMainTabChange("history")}
                    className="w-full text-left font-semibold text-primary hover:underline underline-offset-2 flex items-center gap-2 mb-3"
                  >
                    <History className="w-4 h-4 shrink-0" />
                    History
                  </button>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {(() => {
                      const current = problems.filter((p) => p.status !== "past");
                      const past = problems.filter((p) => p.status === "past");
                      return (
                        <>
                          {current.length > 0 && (
                            <p>{t("pages.patientDetail.currentProblems", { list: current.map((p) => p.problem).join(", ") })}</p>
                          )}
                          {past.length > 0 && <p>{t("pages.patientDetail.pastProblemsCount", { count: past.length })}</p>}
                          {familyMembersList.length > 0 && (
                            <p>{t("pages.patientDetail.familyHistoryCount", { count: familyMembersList.length })}</p>
                          )}
                          {current.length === 0 && past.length === 0 && familyMembersList.length === 0 && (
                            <p>{t("pages.patientDetail.noHistoryRecorded")}</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  {reviewOnlyNavigator ? (
                    <div className="w-full text-left font-semibold text-foreground flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {t("pages.patientDetail.allergyTitle")}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMainTabChange("allergy")}
                      className="w-full text-left font-semibold text-primary hover:underline underline-offset-2 flex items-center gap-2 mb-3"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {t("pages.patientDetail.allergyTitle")}
                    </button>
                  )}
                  <div className="text-sm text-muted-foreground">
                    {patientAllergies.length > 0 ? (
                      <ul className="space-y-1">
                        {patientAllergies.map((a) => (
                          <li key={a.id} className={a.severity === "HIGH" ? "text-destructive font-medium" : ""}>
                            {a.allergen} {a.severity && <span className="text-muted-foreground">({a.severity})</span>}
                          </li>
                        ))}
                      </ul>
                    ) : patient?.allergies ? (
                      <p className="whitespace-pre-wrap">{patient.allergies}</p>
                    ) : (
                      <p>{t("pages.patientDetail.noAllergiesDocumentedShort")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => handleMainTabChange("results")}
                    className="w-full text-left font-semibold text-primary hover:underline underline-offset-2 flex items-center gap-2 mb-3"
                  >
                    <FileCheck className="w-4 h-4 shrink-0" />
                    {t("pages.patientDetail.resultsTitle")}
                  </button>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {(() => {
                      const labResulted = labOrders.filter((o) => o.status === "resulted" || o.status === "completed");
                      const labDocs = patientDocuments.filter((d) => d.documentType === "lab_result");
                      const hasLabs = labResulted.length > 0 || labDocs.length > 0;
                      return (
                        <>
                          {hasLabs && (
                            <p>{t("pages.patientDetail.labsResultsCount", { count: labResulted.length + labDocs.length })}</p>
                          )}
                          {imagingResults.length > 0 && <p>{t("pages.patientDetail.imagingResultsCount", { count: imagingResults.length })}</p>}
                          {!hasLabs && imagingResults.length === 0 && <p>{t("pages.patientDetail.noResultsYet")}</p>}
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => handleMainTabChange("immunization")}
                    className="w-full text-left font-semibold text-primary hover:underline underline-offset-2 flex items-center gap-2 mb-3"
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    Immunization
                  </button>
                  <p className="text-sm text-muted-foreground">
                    {vaccinationImmunizationDocuments.length > 0
                      ? `${vaccinationImmunizationDocuments.length} uploaded vaccination / immunization document(s). Open for details or attachments.`
                      : "Vaccination and immunization records uploaded from Uploads appear here."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="problems" className="space-y-3 mt-0 data-[state=inactive]:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Documented problems for this patient</span>
            {canAddNote && (
              <Button
                size="sm"
                onClick={() => {
                  setNewProblemText("");
                  setAddProblemOpen(true);
                }}
                data-testid="button-add-problem"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Problem
              </Button>
            )}
          </div>
          {(() => {
            const activeProblems = problems.filter((p) => p.status !== "past");
            return activeProblems.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No active problems. {canAddNote ? "Use Add Problem to add one. Resolved problems appear in History → Medical history." : ""}</CardContent></Card>
            ) : (
              <ul className="space-y-2">
                {activeProblems.map((p) => {
                  const startDate = (p as PatientProblem & { problemStartDate?: string | null }).problemStartDate;
                  const symptoms = (p as PatientProblem & { symptoms?: string | null }).symptoms;
                  return (
                    <Card key={p.id}>
                      <CardContent className="py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {canAddNote ? (
                            <button
                              type="button"
                              className="text-sm text-primary underline underline-offset-2 hover:no-underline text-left font-medium"
                              onClick={() => {
                                setEditProblem(p);
                                setEditProblemForm({
                                  problemText: p.problem,
                                  problemStartDate: startDate ? String(startDate).slice(0, 10) : "",
                                  symptoms: symptoms ? String(symptoms) : "",
                                  resolution: "current",
                                });
                                setEditProblemOpen(true);
                              }}
                            >
                              {p.problem}
                            </button>
                          ) : (
                            <span className="text-sm font-medium">{p.problem}</span>
                          )}
                          {(startDate || symptoms) && (
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              {startDate && <p>Started: {formatInOrgTimeZone(startDate, "MMM d, yyyy", orgTz)}</p>}
                              {symptoms && <p className="whitespace-pre-wrap">Symptoms: {symptoms}</p>}
                            </div>
                          )}
                        </div>
                        {canAddNote && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="secondary" className="text-[10px] bg-chart-3/20 text-chart-3">
                              Active
                            </Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => resolveProblemMutation.mutate(p.id)}
                              disabled={resolveProblemMutation.isPending}
                              data-testid={`button-resolve-problem-${p.id}`}
                            >
                              Resolve
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </ul>
            );
          })()}
        </TabsContent>

        <TabsContent value="vitals" className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("pages.patientDetail.documentOfficeVisitVitals")}</span>
          </div>
          <Card>
            <CardContent className="p-2.5 space-y-2">
              <h4 className="text-sm font-medium">{t("pages.patientDetail.bloodGroupTitle")}</h4>
              <p className="text-xs text-muted-foreground">
                {t("pages.patientDetail.bloodGroupHelp")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={vitalsBloodGroup || "__none"}
                  onValueChange={(v) => setVitalsBloodGroup(v === "__none" ? "" : v)}
                  disabled={!canAddNote || updateBloodGroupMutation.isPending}
                >
                  <SelectTrigger className="w-[12rem] h-8 text-xs">
                    <SelectValue placeholder={t("pages.patientDetail.notSpecified")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{t("pages.patientDetail.notSpecifiedOption")}</SelectItem>
                    {BLOOD_GROUP_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canAddNote && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={() => updateBloodGroupMutation.mutate(vitalsBloodGroup)}
                    disabled={updateBloodGroupMutation.isPending || (vitalsBloodGroup || "") === (patient?.bloodGroup || "")}
                    data-testid="button-save-vitals-blood-group"
                  >
                    {updateBloodGroupMutation.isPending ? t("pages.patientDetail.saving") : t("pages.patientDetail.saveBloodGroup")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          {canAddNote && (
            <Card>
              <CardContent className="p-2.5">
                <h4 className="text-sm font-medium mb-2">{t("pages.patientDetail.recordVitalsTitle")}</h4>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    recordVitalsMutation.mutate(vitalsForm);
                  }}
                  className="space-y-2"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.vitalsTempLabel")}</Label>
                      <Input type="number" step="0.1" className="h-7 px-2 text-xs" value={vitalsForm.temperature} onChange={(e) => setVitalsForm((f) => ({ ...f, temperature: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.vitalsBpSystolicLabel")}</Label>
                      <Input type="number" className="h-7 px-2 text-xs" value={vitalsForm.bloodPressureSystolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bloodPressureSystolic: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.vitalsBpDiastolicLabel")}</Label>
                      <Input type="number" className="h-7 px-2 text-xs" value={vitalsForm.bloodPressureDiastolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bloodPressureDiastolic: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.heartRateLabel")}</Label>
                      <Input type="number" className="h-7 px-2 text-xs" value={vitalsForm.heartRate} onChange={(e) => setVitalsForm((f) => ({ ...f, heartRate: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.respRateLabel")}</Label>
                      <Input type="number" className="h-7 px-2 text-xs" value={vitalsForm.respiratoryRate} onChange={(e) => setVitalsForm((f) => ({ ...f, respiratoryRate: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.spo2Label")}</Label>
                      <Input type="number" className="h-7 px-2 text-xs" value={vitalsForm.oxygenSaturation} onChange={(e) => setVitalsForm((f) => ({ ...f, oxygenSaturation: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.vitalsWeightLabel")}</Label>
                      <Input type="number" step="0.1" className="h-7 px-2 text-xs" value={vitalsForm.weight} onChange={(e) => setVitalsForm((f) => ({ ...f, weight: e.target.value }))} />
                    </div>
                    <div className="space-y-1 max-w-[11.5rem]">
                      <Label className="text-[11px]">{t("pages.patientDetail.vitalsHeightLabel")}</Label>
                      <Input type="number" step="0.1" className="h-7 px-2 text-xs" value={vitalsForm.height} onChange={(e) => setVitalsForm((f) => ({ ...f, height: e.target.value }))} />
                    </div>
                  </div>
                  <Button type="submit" size="sm" className="h-8 px-3 text-xs" disabled={recordVitalsMutation.isPending}>
                    {recordVitalsMutation.isPending ? t("pages.patientDetail.recording") : t("pages.patientDetail.recordVitalsCta")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
          {vitalsList.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("pages.patientDetail.recentVitalsTitle")}</h4>
              <div className="space-y-2">
                {vitalsList.slice(0, 5).map((v) => (
                  <Card key={v.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {canAddNote ? (
                          <button
                            type="button"
                            className="text-primary underline underline-offset-2 hover:no-underline font-medium text-left"
                            onClick={() => {
                              setEditVitals(v);
                              const d = v.recordedAt ? new Date(v.recordedAt) : new Date();
                              const recordedAtStr =
                                formatInOrgTimeZone(d, "yyyy-MM-dd", orgTz) + "T" + formatInOrgTimeZone(d, "HH:mm", orgTz);
                              setEditVitalsForm({
                                temperature: v.temperature != null ? String(v.temperature) : "",
                                bloodPressureSystolic: v.bloodPressureSystolic != null ? String(v.bloodPressureSystolic) : "",
                                bloodPressureDiastolic: v.bloodPressureDiastolic != null ? String(v.bloodPressureDiastolic) : "",
                                heartRate: v.heartRate != null ? String(v.heartRate) : "",
                                respiratoryRate: v.respiratoryRate != null ? String(v.respiratoryRate) : "",
                                oxygenSaturation: v.oxygenSaturation != null ? String(v.oxygenSaturation) : "",
                                weight: v.weight != null ? String(v.weight) : "",
                                height: v.height != null ? String(v.height) : "",
                                recordedAt: recordedAtStr,
                              });
                              setEditVitalsOpen(true);
                            }}
                          >
                            {v.recordedAt ? formatInOrgTimeZone(v.recordedAt, "MMM d, yyyy HH:mm", orgTz) : t("pages.patientDetail.editVitalsTitle")}
                          </button>
                        ) : v.recordedAt ? (
                          <span className="text-muted-foreground">
                            {formatInOrgTimeZone(v.recordedAt, "MMM d, yyyy HH:mm", orgTz)}
                          </span>
                        ) : null}
                        {v.temperature != null && <span>{t("pages.patientDetail.vitalsInlineTemp", { value: v.temperature })}</span>}
                        {(v.bloodPressureSystolic != null || v.bloodPressureDiastolic != null) && (
                          <span>{t("pages.patientDetail.vitalsInlineBp", { sys: v.bloodPressureSystolic ?? "—", dia: v.bloodPressureDiastolic ?? "—" })}</span>
                        )}
                        {v.heartRate != null && <span>{t("pages.patientDetail.vitalsInlineHr", { value: v.heartRate })}</span>}
                        {v.respiratoryRate != null && <span>{t("pages.patientDetail.vitalsInlineRr", { value: v.respiratoryRate })}</span>}
                        {v.oxygenSaturation != null && <span>{t("pages.patientDetail.vitalsInlineSpo2", { value: v.oxygenSaturation })}</span>}
                        {v.weight != null && <span>{t("pages.patientDetail.vitalsInlineWeight", { value: v.weight })}</span>}
                        {v.height != null && <span>{t("pages.patientDetail.vitalsInlineHeight", { value: v.height })}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <Dialog open={editVitalsOpen} onOpenChange={(open) => { setEditVitalsOpen(open); if (!open) setEditVitals(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("pages.patientDetail.editVitalsTitle")}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editVitals) updateVitalsMutation.mutate({ vitalId: editVitals.id, data: editVitalsForm });
                }}
                className="space-y-3 py-2"
              >
                <div className="space-y-2">
                  <Label className="text-xs">{t("pages.patientDetail.dateTimeLabel")}</Label>
                  <Input
                    type="datetime-local"
                    value={editVitalsForm.recordedAt}
                    onChange={(e) => setEditVitalsForm((f) => ({ ...f, recordedAt: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.vitalsTempLabel")}</Label>
                    <Input type="number" step="0.1" className="h-8 text-sm" value={editVitalsForm.temperature} onChange={(e) => setEditVitalsForm((f) => ({ ...f, temperature: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.vitalsBpSystolicLabel")}</Label>
                    <Input type="number" className="h-8 text-sm" value={editVitalsForm.bloodPressureSystolic} onChange={(e) => setEditVitalsForm((f) => ({ ...f, bloodPressureSystolic: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.vitalsBpDiastolicLabel")}</Label>
                    <Input type="number" className="h-8 text-sm" value={editVitalsForm.bloodPressureDiastolic} onChange={(e) => setEditVitalsForm((f) => ({ ...f, bloodPressureDiastolic: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.heartRateLabel")}</Label>
                    <Input type="number" className="h-8 text-sm" value={editVitalsForm.heartRate} onChange={(e) => setEditVitalsForm((f) => ({ ...f, heartRate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.respRateLabel")}</Label>
                    <Input type="number" className="h-8 text-sm" value={editVitalsForm.respiratoryRate} onChange={(e) => setEditVitalsForm((f) => ({ ...f, respiratoryRate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.spo2Label")}</Label>
                    <Input type="number" className="h-8 text-sm" value={editVitalsForm.oxygenSaturation} onChange={(e) => setEditVitalsForm((f) => ({ ...f, oxygenSaturation: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.vitalsWeightLabel")}</Label>
                    <Input type="number" step="0.1" className="h-8 text-sm" value={editVitalsForm.weight} onChange={(e) => setEditVitalsForm((f) => ({ ...f, weight: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("pages.patientDetail.vitalsHeightLabel")}</Label>
                    <Input type="number" step="0.1" className="h-8 text-sm" value={editVitalsForm.height} onChange={(e) => setEditVitalsForm((f) => ({ ...f, height: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditVitalsOpen(false)}>{t("common.cancel")}</Button>
                  <Button type="submit" disabled={updateVitalsMutation.isPending}>
                    {updateVitalsMutation.isPending ? t("pages.patientDetail.saving") : t("pages.patientDetail.saveChanges")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="medication" className="space-y-3 mt-4">
          {admissionDocUnlocked && activeAdmissionId ? (
            <AdmissionMedicationTab admissionId={activeAdmissionId} patientId={id!} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("pages.patientDetail.medicationsAndPrescriptions")}</span>
                {canOrder && (
                  <Button size="sm" onClick={() => setNewMedOrderOpen(true)} data-testid="button-new-med-order">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> {t("pages.patientDetail.newOrderCta")}
                  </Button>
                )}
              </div>
              <Tabs value={medicationTab} onValueChange={(v) => setMedicationTab(v as any)}>
                <TabsList>
          <TabsTrigger value="history">{t("pages.patientDetail.medicationHistoryTab")}</TabsTrigger>
          <TabsTrigger value="administration">{t("pages.patientDetail.medicationAdministrationTab")}</TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="mt-3 space-y-3">
                  {prescriptions.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        {t("pages.patientDetail.noMedicationsOnRecord")}{" "}
                        {canOrder ? t("pages.patientDetail.useNewOrderToAddMedication") : ""}
                      </CardContent>
                    </Card>
                  ) : prescriptions.map((rx) => {
                    const linkedProblem = (rx as Prescription & { patientProblemId?: string | null }).patientProblemId
                      ? problems.find((p) => p.id === (rx as Prescription & { patientProblemId?: string }).patientProblemId)
                      : null;
                    return (
                      <Card key={rx.id} data-testid={`card-rx-${rx.id}`}>
                        <CardContent className="py-3 px-4">
                          <div className={`flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm ${rx.status === "cancelled" ? "line-through opacity-60" : ""}`}>
                            <span className="font-medium shrink-0">{rx.medicationName}</span>
                            <span className="shrink-0">{rx.dosage}</span>
                            <span className="text-muted-foreground shrink-0">{rx.frequency}</span>
                            {rx.duration && <span className="text-muted-foreground shrink-0">· {rx.duration}</span>}
                            {linkedProblem && <span className="text-muted-foreground shrink-0">· For: {linkedProblem.problem}</span>}
                            {rx.instructions && <span className="text-muted-foreground shrink-0">· {rx.instructions}</span>}
                            <Badge variant="secondary" className={`text-[10px] ${statusColors[rx.status] || ""} shrink-0`}>
                              {rx.status === "cancelled" ? "discontinued" : rx.status}
                            </Badge>
                            {canOrder && (
                              <div className="ml-auto flex items-center gap-2 shrink-0">
                                {rx.status !== "cancelled" && (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-2.5 text-xs"
                                      onClick={() => {
                                        setNewMedOrderForm({
                                          medicationName: rx.medicationName,
                                          dosage: rx.dosage,
                                          frequency: rx.frequency,
                                          duration: rx.duration ?? "",
                                          instructions: rx.instructions ?? "",
                                          patientProblemId: rx.patientProblemId ?? "",
                                          orderType: ((rx as any).orderType === "administered" ? "administered" : "prescription"),
                                          route: (rx as any).route ?? "",
                                          rate: (rx as any).rate ?? "",
                                        });
                                        setOrderComposerType("medication");
                                        setNewOrderOpen(true);
                                        setNewMedOrderOpen(true);
                                      }}
                                    >
                                      Reorder
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="destructive"
                                      className="h-8 px-2.5 text-xs"
                                      onClick={() => {
                                        setDiscontinuePrescription(rx);
                                        setDiscontinueReason("");
                                        setDiscontinueRxOpen(true);
                                      }}
                                    >
                                      Discontinue
                                    </Button>
                                  </>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  title="Do NOT delete unless documentation was completed in error"
                                  onClick={() => {
                                    const ok = window.confirm("Do NOT delete unless documentation was completed in error.\n\nDelete this medication?");
                                    if (!ok) return;
                                    deletePrescriptionMutation.mutate(rx.id);
                                  }}
                                  disabled={deletePrescriptionMutation.isPending}
                                  data-testid={`button-delete-medication-${rx.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                            Ordered {formatInOrgTimeZone(rx.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                            {" · "}
                            By {prescriberNameById.get(rx.prescribedBy) ?? rx.prescribedBy ?? "Unknown user"}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>

                <TabsContent value="administration" className="mt-3 space-y-3">
                  {!activeEncounterId ? (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        Start a visit from Schedule to administer medications.
                      </CardContent>
                    </Card>
                  ) : (
                    (() => {
                      const medsToAdmin = prescriptions.filter((rx) => (rx as any).orderType === "administered" && rx.status !== "cancelled" && (rx as any).encounterId === activeEncounterId);
                      const nextDueByRxId = new Map<string, number>();
                      for (const rx of medsToAdmin) {
                        const intervalMin = frequencyToIntervalMinutes(rx.frequency);
                        if (!intervalMin) continue;
                        const last = encounterMedicationAdministrations
                          .filter((a) => a.prescriptionId === rx.id)
                          .sort((a, b) => new Date(b.administeredAt ?? 0).getTime() - new Date(a.administeredAt ?? 0).getTime())[0];
                        if (!last?.administeredAt) continue;
                        nextDueByRxId.set(rx.id, new Date(last.administeredAt).getTime() + intervalMin * 60_000);
                      }
                      for (const [rxId, dueAt] of Array.from(nextDueByRxId.entries())) {
                        if (dueAt <= medNowTick && !medDueToastRef.current.has(rxId)) {
                          medDueToastRef.current.add(rxId);
                          toast({
                            title: t("pages.patientDetail.medicationDoseDueTitle"),
                            description: t("pages.patientDetail.medicationDoseDueDesc"),
                          });
                        }
                      }

                      return medsToAdmin.length === 0 ? (
                        <Card>
                          <CardContent className="p-8 text-center text-muted-foreground">
                            {t("pages.patientDetail.noMedicationsToAdminister")}
                          </CardContent>
                        </Card>
                      ) : (
                        <div className="space-y-3">
                          {medsToAdmin.map((rx) => {
                            const dueAt = nextDueByRxId.get(rx.id);
                            const msLeft = dueAt != null ? dueAt - medNowTick : null;
                            const isOverdue = msLeft != null && msLeft <= 0;
                            const dueAtLabel = dueAt != null ? formatInOrgTimeZone(dueAt, "h:mm a", orgTz) : null;
                            return (
                              <Card key={rx.id} data-testid={`med-admin-${rx.id}`}>
                                <CardContent className="py-3 px-4">
                                  <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                                    <span className="font-medium shrink-0">{rx.medicationName}</span>
                                    <span className="shrink-0">{rx.dosage}</span>
                                    <span className="text-muted-foreground shrink-0">{rx.frequency}</span>
                                    {dueAt != null ? (
                                      <Badge variant={isOverdue ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                                        {isOverdue
                                          ? t("pages.patientDetail.dueWasDueAt", { time: dueAtLabel })
                                          : t("pages.patientDetail.nextDoseAt", { time: dueAtLabel })}
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px] shrink-0">{t("pages.patientDetail.notStarted")}</Badge>
                                    )}
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="ml-auto h-8 px-2.5 text-xs shrink-0"
                                      onClick={() => {
                                        setEncAdminOpen({ rx });
                                        setEncAdminForm({ doseGiven: rx.dosage ?? "", notes: "" });
                                      }}
                                    >
                                      {t("pages.patientDetail.administer")}
                                    </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 px-2.5 text-xs shrink-0"
                                  onClick={() => {
                                    setDiscontinuePrescription(rx);
                                    setDiscontinueReason("");
                                    setDiscontinueRxOpen(true);
                                    setMedicationTab("history");
                                  }}
                                >
                                  {t("pages.patientDetail.discontinue")}
                                </Button>
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                                    Ordered {formatInOrgTimeZone(rx.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}

                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("pages.patientDetail.administrationLog")}</p>
                            {encounterMedicationAdministrations.length === 0 ? (
                              <Card>
                                <CardContent className="p-6 text-sm text-muted-foreground">{t("pages.patientDetail.noAdministrationsYet")}</CardContent>
                              </Card>
                            ) : (
                              <div className="space-y-2">
                                {encounterMedicationAdministrations.slice(0, 25).map((a) => (
                                  <Card key={a.id}>
                                    <CardContent className="py-2.5 px-4">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                        <span className="font-medium">
                                          {prescriptions.find((rx) => rx.id === a.prescriptionId)?.medicationName ?? "Medication"}{" "}
                                          {a.doseGiven || ""}
                                        </span>
                                        <span className="text-muted-foreground">
                                          · {formatInOrgTimeZone(a.administeredAt, "MMM d, yyyy · HH:mm", orgTz)}
                                          {" · "}By {a.administeredBy ? (prescriberNameById.get(a.administeredBy) ?? a.administeredBy) : "Unknown user"}
                                        </span>
                                      </div>
                                      {a.notes ? <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.notes}</p> : null}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </TabsContent>

        <Dialog open={!!encAdminOpen} onOpenChange={(open) => (!open ? setEncAdminOpen(null) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record administration</DialogTitle>
            </DialogHeader>
            {encAdminOpen ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{encAdminOpen.rx.medicationName}</p>
                  <p className="text-xs text-muted-foreground">{encAdminOpen.rx.frequency}</p>
                </div>
                <div className="space-y-2">
                  <Label>Dose given</Label>
                  <Input value={encAdminForm.doseGiven} onChange={(e) => setEncAdminForm((s) => ({ ...s, doseGiven: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={encAdminForm.notes}
                    onChange={(e) => setEncAdminForm((s) => ({ ...s, notes: e.target.value }))}
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" onClick={() => setEncAdminOpen(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={recordEncounterMedicationAdministrationMutation.isPending}
                    onClick={() => recordEncounterMedicationAdministrationMutation.mutate(encAdminOpen.rx)}
                  >
                    {recordEncounterMedicationAdministrationMutation.isPending ? "Saving…" : "Record dose"}
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={discontinueRxOpen} onOpenChange={(open) => { setDiscontinueRxOpen(open); if (!open) { setDiscontinuePrescription(null); setDiscontinueReason(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Discontinue medication</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <p className="text-sm text-muted-foreground">
                {discontinuePrescription ? `Please provide a reason to discontinue ${discontinuePrescription.medicationName}.` : "Please provide a reason to discontinue this medication."}
              </p>
              <Label htmlFor="discontinue-reason">Reason</Label>
              <Textarea
                id="discontinue-reason"
                value={discontinueReason}
                onChange={(e) => setDiscontinueReason(e.target.value)}
                placeholder="Enter reason for discontinuation"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDiscontinueRxOpen(false)}>{t("common.cancel")}</Button>
              <Button
                variant="destructive"
                disabled={!discontinuePrescription || !discontinueReason.trim() || discontinuePrescriptionMutation.isPending}
                onClick={() => {
                  if (discontinuePrescription) {
                    discontinuePrescriptionMutation.mutate({
                      prescriptionId: discontinuePrescription.id,
                      reason: discontinueReason.trim(),
                    });
                  }
                }}
              >
                {discontinuePrescriptionMutation.isPending ? t("pages.patientDetail.saving") : t("pages.patientDetail.discontinue")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TabsContent value="orders" className="space-y-3 mt-4">
          {admissionDocUnlocked && activeAdmissionId ? (
            <AdmissionOrdersTab admissionId={activeAdmissionId} patientId={id!} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("pages.patientDetail.labAndClinicalOrders")}</span>
                {canOrder && (
                  <Button size="sm" onClick={() => setNewOrderOpen(true)} data-testid="button-new-order">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> {t("pages.patientDetail.newOrderCta")}
                  </Button>
                )}
              </div>
              {labOrders.length === 0 && imagingOrders.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">{t("pages.patientDetail.noOrders")} {canOrder ? t("pages.patientDetail.useNewOrderToAddOne") : ""}</CardContent></Card>
              ) : (
                <div className="space-y-3">
              {labOrders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                      <a href="/laboratory" className="font-medium text-primary underline underline-offset-2 hover:no-underline shrink-0">
                        {order.testName}
                      </a>
                      {(order as LabOrder & { documentUrl?: string }).documentUrl &&
                        (order.status === "resulted" || order.status === "completed") && (
                          <a
                            href={(order as LabOrder & { documentUrl?: string }).documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-primary hover:text-primary/80"
                            title={t("pages.patientDetail.viewAttachedExternalResult")}
                            aria-label={t("pages.patientDetail.viewAttachedExternalResult")}
                          >
                            <Paperclip className="w-4 h-4" />
                          </a>
                        )}
                      {order.testCode && <span className="text-muted-foreground shrink-0">{order.testCode}</span>}
                      <span className="text-muted-foreground shrink-0">{order.priority}</span>
                      {(order as LabOrder & { internalExternal?: string }).internalExternal === "external" && (
                        <span className="text-muted-foreground shrink-0">External</span>
                      )}
                      {order.result && <span className="text-muted-foreground shrink-0">{order.result}</span>}
                      <Badge variant="secondary" className={`text-[10px] ${statusColors[order.status] || ""} shrink-0`}>{order.status}</Badge>
                      {canOrder && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0"
                          title="Do NOT delete unless documentation was completed in error"
                          onClick={() => {
                            const ok = window.confirm("Do NOT delete unless documentation was completed in error.\n\nDelete this order?");
                            if (!ok) return;
                            deleteLabOrderMutation.mutate(order.id);
                          }}
                          disabled={deleteLabOrderMutation.isPending}
                          data-testid={`button-delete-lab-order-${order.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                      Ordered {formatInOrgTimeZone(order.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                      {" · "}
                      By {prescriberNameById.get(order.orderedBy) ?? order.orderedBy ?? "Unknown user"}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {imagingOrders.map((order) => (
                <Card key={order.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                      <a href="/upload-results" className="font-medium text-primary underline underline-offset-2 hover:no-underline shrink-0">
                        {order.title}
                      </a>
                      {order.documentUrl && order.status === "completed" && (
                        <a
                          href={order.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-primary hover:text-primary/80"
                          title={t("pages.patientDetail.viewAttachedExternalResult")}
                          aria-label={t("pages.patientDetail.viewAttachedExternalResult")}
                        >
                          <Paperclip className="w-4 h-4" />
                        </a>
                      )}
                      <span className="text-muted-foreground shrink-0">{order.modality}</span>
                      {order.internalExternal === "external" && <span className="text-muted-foreground shrink-0">External</span>}
                      <Badge variant="secondary" className={`text-[10px] ${order.status === "completed" ? "bg-chart-3/10 text-chart-3" : ""} shrink-0`}>
                        {order.status === "completed" ? "resulted" : order.status}
                      </Badge>
                      {canOrder && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0"
                          title="Do NOT delete unless documentation was completed in error"
                          onClick={() => {
                            const ok = window.confirm("Do NOT delete unless documentation was completed in error.\n\nDelete this order?");
                            if (!ok) return;
                            deleteImagingOrderMutation.mutate(order.id);
                          }}
                          disabled={deleteImagingOrderMutation.isPending}
                          data-testid={`button-delete-imaging-order-${order.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                      Ordered {formatInOrgTimeZone(order.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                      {" · "}
                      By {prescriberNameById.get(order.orderedBy) ?? order.orderedBy ?? "Unknown user"}
                    </div>
                  </CardContent>
                </Card>
              ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-3 mt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Clinical notes</span>
            {canAddNote && (
              <Button size="sm" onClick={openNewNotePanel} data-testid="button-new-note">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> New Note
              </Button>
            )}
          </div>
          {(() => {
            const incompleteNotes = notes.filter((n) => (n as PatientNote & { status?: string }).status === "incomplete");
            const signedNotes = notes.filter((n) => (n as PatientNote & { status?: string }).status !== "incomplete");
            const visibleSignedNotes = hasOpenNotePanel ? signedNotes.slice(0, 4) : signedNotes;
            const renderNoteCard = (note: PatientNote) => (
              <Card key={note.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {(note as PatientNote & { noteKind?: string }).noteKind ?? "Progress Note"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {note.authorRole === "nursing" ? "Nursing" : "Clinician"}
                      </Badge>
                      {(note as PatientNote & { status?: string }).status === "incomplete" && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400">Incomplete</Badge>
                      )}
                      {(note as PatientNote & { status?: string }).status === "signed" && (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">Signed</Badge>
                      )}
                      {(note as PatientNote & { status?: string }).status === "edited" && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-400">Edited</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {(note as PatientNote & { status?: string }).status === "incomplete"
                          ? `Saved ${formatInOrgTimeZone(note.createdAt, "MMM d, yyyy · HH:mm", orgTz)} · By ${note.authorId ? (prescriberNameById.get(note.authorId) ?? note.authorId) : "Unknown user"}`
                          : `Signed ${formatInOrgTimeZone(note.signedAt, "MMM d, yyyy · HH:mm", orgTz)} · By ${note.authorId ? (prescriberNameById.get(note.authorId) ?? note.authorId) : "Unknown user"}`}
                      </span>
                      {canAddNote && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => openEditNotePanel(note.id, note.content)}
                          title="Edit note"
                          data-testid={`button-edit-note-${note.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-left w-full text-sm whitespace-pre-wrap text-muted-foreground line-clamp-2 underline-offset-2 hover:underline"
                    onClick={() => {
                      (note as PatientNote & { status?: string }).status === "incomplete"
                        ? openEditNotePanel(note.id, note.content)
                        : (setViewNote(note), setViewNoteOpen(true));
                    }}
                    title={(note as PatientNote & { status?: string }).status === "incomplete" ? "Open to continue editing" : "Open full note"}
                    data-testid={`button-view-note-${note.id}`}
                  >
                    {note.content.length > 180 ? `${note.content.slice(0, 180)}...` : note.content}
                  </button>
                </CardContent>
              </Card>
            );
            return (
              <div className="space-y-6">
                {incompleteNotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Incomplete notes</p>
                    <div className="space-y-3">
                      {incompleteNotes.map((note) => renderNoteCard(note))}
                    </div>
                  </div>
                )}
                {signedNotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Signed notes</p>
                    <div className="space-y-3">
                      {visibleSignedNotes.map((note) => renderNoteCard(note))}
                    </div>
                  </div>
                )}
                {notes.length === 0 && (
                  <Card><CardContent className="p-8 text-center text-muted-foreground">No notes. {canAddNote ? "Use New Note to add a note, or Save to keep a draft." : ""}</CardContent></Card>
                )}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="visit-summary" className="mt-4 data-[state=inactive]:hidden">
          {visitSummaryMeta && (
            <VisitSummaryTab
              encounterId={visitSummaryMeta.encounterId}
              authToken={authToken}
              prescriberNameById={prescriberNameById}
              readOnly={documentationReadOnly}
            />
          )}
        </TabsContent>

        <TabsContent value="patient-record" className="mt-0 data-[state=inactive]:hidden">
          <PatientRecordTab
            token={authToken ?? null}
            patient={patient}
            prescriptions={prescriptions}
            problems={problems}
            allergies={patientAllergies}
            users={users}
            prescriberNameById={prescriberNameById}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
          <Tabs defaultValue="medical" className="w-full">
            <SidebarTabsNavLayout
              sidebar={
                <TabsList className={SIDEBAR_TABS_LIST_CLASS}>
                  <TabsTrigger value="medical" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                    {t("pages.patientDetail.historyMedicalTab")}
                  </TabsTrigger>
                  <TabsTrigger value="family" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                    {t("pages.patientDetail.historyFamilyTab")}
                  </TabsTrigger>
                  <TabsTrigger value="social" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                    {t("pages.patientDetail.historySocialTab")}
                  </TabsTrigger>
                </TabsList>
              }
            >
            <TabsContent value="medical" className="mt-0 space-y-3 focus-visible:outline-none">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("pages.patientDetail.currentAndPastProblems")}</span>
                {canAddNote && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewPastProblemText("");
                      setAddPastProblemOpen(true);
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> {t("pages.patientDetail.addPastProblem")}
                  </Button>
                )}
              </div>
              {(() => {
                const current = problems.filter((p) => p.status !== "past");
                const past = problems.filter((p) => p.status === "past");
                return (
                  <div className="space-y-4">
                    {current.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Current problems</p>
                        <ul className="space-y-2">
                          {current.map((p) => (
                            <Card key={p.id}><CardContent className="py-3"><span className="text-sm">{p.problem}</span></CardContent></Card>
                          ))}
                        </ul>
                      </div>
                    )}
                    {past.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Past problems</p>
                        <ul className="space-y-2">
                          {past.map((p) => {
                            const startDate = (p as PatientProblem & { problemStartDate?: string | null }).problemStartDate;
                            const resolution = (p as PatientProblem & { resolution?: string | null }).resolution;
                            const sym = (p as PatientProblem & { symptoms?: string | null }).symptoms;
                            return (
                              <Card key={p.id}>
                                <CardContent className="py-3">
                                  {canAddNote ? (
                                    <button
                                      type="button"
                                      className="text-sm text-primary underline underline-offset-2 hover:no-underline text-left font-medium"
                                      onClick={() => {
                                        setEditProblem(p);
                                        setEditProblemForm({
                                          problemText: p.problem,
                                          problemStartDate: startDate ? String(startDate).slice(0, 10) : "",
                                          symptoms: sym ? String(sym) : "",
                                          resolution: (resolution === "current" ? "current" : "resolved") as "current" | "resolved",
                                        });
                                        setEditProblemOpen(true);
                                      }}
                                    >
                                      {p.problem}
                                    </button>
                                  ) : (
                                    <span className="text-sm">{p.problem}</span>
                                  )}
                                  {(startDate || resolution || sym) && (
                                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                      {startDate && <p>Started: {formatInOrgTimeZone(startDate, "MMM d, yyyy", orgTz)}</p>}
                                      {resolution && <p>{resolution === "current" ? "Still current" : "Resolved"}</p>}
                                      {sym && <p className="whitespace-pre-wrap">Symptoms: {sym}</p>}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {current.length === 0 && past.length === 0 && (
                      <Card><CardContent className="p-8 text-center text-muted-foreground">No current or past problems recorded. {canAddNote ? "Add a past problem above." : ""}</CardContent></Card>
                    )}
                  </div>
                );
              })()}
            </TabsContent>
            <TabsContent value="family" className="mt-0 space-y-3 focus-visible:outline-none">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Family members and inherited/familial conditions</span>
                {canAddNote && (
                  <Button size="sm" onClick={() => setAddFamilyMemberOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add family member
                  </Button>
                )}
              </div>
              {familyHistoryLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : familyMembersList.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">No family members added. {canAddNote ? "Add a family member to record conditions." : ""}</CardContent></Card>
              ) : (
                <div className="space-y-4">
                  {familyMembersList.map((member) => {
                    const conditions = familyConditionsList.filter((c) => c.familyMemberId === member.id);
                    return (
                      <Card key={member.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="font-medium">{member.relationship}</p>
                            {canAddNote && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setAddConditionFamilyMember(member);
                                  setNewConditionSelect("");
                                  setNewConditionOther("");
                                  setNewConditionNotes("");
                                  setAddConditionOpen(true);
                                }}
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Add condition
                              </Button>
                            )}
                          </div>
                          {conditions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No conditions recorded</p>
                          ) : (
                            <ul className="space-y-1">
                              {conditions.map((c) => (
                                <li key={c.id} className="text-sm flex items-center gap-2">
                                  <span>{c.condition}</span>
                                  {c.notes && <span className="text-muted-foreground">— {c.notes}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
            <TabsContent value="social" className="mt-0 focus-visible:outline-none">
              <Card><CardContent className="p-8 text-center text-muted-foreground">Social history. Records can be added when this section is enabled.</CardContent></Card>
            </TabsContent>
            </SidebarTabsNavLayout>
          </Tabs>
        </TabsContent>

        <TabsContent value="immunization" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Records filed as <span className="font-medium text-foreground">Vaccination / immunization record</span> from{" "}
            <Link href="/upload-results" className="text-primary underline underline-offset-2 hover:no-underline">
              Uploads
            </Link>{" "}
            are listed below with any attached file.
          </p>
          {vaccinationImmunizationDocuments.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No vaccination or immunization documents yet. Upload from Uploads and choose &quot;Vaccination / immunization record&quot; as the document type.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {vaccinationImmunizationDocuments.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                      <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                      <span className="font-medium shrink-0">{doc.title}</span>
                      {doc.documentUrl && (
                        <a
                          href={doc.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-primary hover:text-primary/80"
                          title="View uploaded record"
                          aria-label="View uploaded record"
                        >
                          <Paperclip className="w-4 h-4" />
                        </a>
                      )}
                      <span className="text-muted-foreground shrink-0">Vaccination / immunization record</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                      Uploaded {formatInOrgTimeZone(doc.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                      {" · "}
                      By {doc.uploadedBy ? (prescriberNameById.get(doc.uploadedBy) ?? doc.uploadedBy) : "Unknown user"}
                    </div>
                    {doc.documentUrl && (
                      <a
                        href={doc.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline mt-2 inline-flex items-center gap-1.5"
                      >
                        <Paperclip className="w-3.5 h-3.5" /> View document
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="patient-call" className="mt-4 space-y-4 data-[state=inactive]:hidden">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight">Document patient call</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Record call outcome and discussion notes for this patient.
                </p>
              </div>
              {id && !documentationReadOnly ? (
                <PatientCallDocumentationForm
                  token={authToken ?? null}
                  userId={user?.id}
                  patientId={id}
                  reasonForCall={patientCallReasonForCall}
                  outcome={patientCallOutcome}
                  discussion={patientCallDiscussion}
                  onReasonForCallChange={setPatientCallReasonForCall}
                  onOutcomeChange={setPatientCallOutcome}
                  onDiscussionChange={setPatientCallDiscussion}
                  onSaved={() => {
                    setPatientCallReasonForCall("");
                    setPatientCallOutcome("");
                    setPatientCallDiscussion("");
                    void queryClient.invalidateQueries({ queryKey: queryKeys.followUpContacts.list(id!) });
                  }}
                  saveLabel="Save call note"
                />
              ) : documentationReadOnly ? (
                <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                  New patient calls cannot be documented in view-only mode. Use the chart from your usual workflow to add
                  call notes.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h3 className="text-base font-semibold tracking-tight">Documented calls</h3>
            {followUpContacts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No patient calls documented yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {followUpContacts.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          {c.outcome.replaceAll("_", " ")}
                        </Badge>
                        <span>{safeFormatDateTime(c.createdAt, orgTz)}</span>
                        <span>•</span>
                        <span>By {c.contactedBy ? (prescriberNameById.get(c.contactedBy) ?? c.contactedBy) : "Unknown user"}</span>
                      </div>
                      <p className="mt-1 text-sm leading-snug">
                        <span className="text-muted-foreground">Reason: </span>
                        <span>{c.reasonForCall?.trim() ? c.reasonForCall : "—"}</span>
                        <span className="text-muted-foreground"> • </span>
                        <span>{c.discussion?.trim() ? c.discussion : "No discussion notes provided."}</span>
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="allergy" className="space-y-4 mt-4 data-[state=inactive]:hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("pages.patientDetail.allergiesHint")}</span>
            {canAddNote && (
              <Button onClick={() => setNewAllergyOpen(true)} size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> {t("pages.patientDetail.newAllergyCta")}
              </Button>
            )}
          </div>
          <Dialog open={newAllergyOpen} onOpenChange={setNewAllergyOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("pages.patientDetail.newAllergyTitle")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>{t("pages.patientDetail.allergenLabel")}</Label>
                  {/*
                    Avoid Radix Popover inside Dialog — nested portals/focus guards can throw at runtime.
                    Inline dropdown stays in the dialog layer.
                  */}
                  <div className="relative" ref={allergenSuggestContainerRef}>
                    <Input
                      value={newAllergyForm.allergen}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewAllergyForm((f) => ({ ...f, allergen: v }));
                        if (v.trim().length >= 2) setAllergenSuggestOpen(true);
                      }}
                      onFocus={() => {
                        if (newAllergyForm.allergen.trim().length >= 2) setAllergenSuggestOpen(true);
                      }}
                      placeholder={t("pages.patientDetail.allergenPlaceholder")}
                      autoComplete="off"
                    />
                    {allergenSuggestOpen && newAllergyForm.allergen.trim().length >= 2 ? (
                      <div className="absolute z-[200] top-full left-0 right-0 mt-1 max-h-[200px] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md py-1">
                        {allergenSuggestLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : allergenSuggestions.length > 0 ? (
                          <ul className="py-0">
                            {allergenSuggestions.map((s, i) => (
                              <li key={`${s}-${i}`}>
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted focus:bg-muted outline-none"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setNewAllergyForm((f) => ({ ...f, allergen: s }));
                                    setAllergenSuggestOpen(false);
                                  }}
                                >
                                  {s}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                        <p className="py-4 px-3 text-sm text-muted-foreground text-center">
                          {t("pages.patientDetail.noSuggestionsYouCanEnterYourOwn")}
                        </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("pages.patientDetail.severityLabel")}</Label>
                  <Select
                    value={newAllergyForm.severity}
                    onValueChange={(v) => setNewAllergyForm((f) => ({ ...f, severity: v as "LOW" | "MEDIUM" | "HIGH" }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">{t("pages.patientDetail.severityLow")}</SelectItem>
                      <SelectItem value="MEDIUM">{t("pages.patientDetail.severityMedium")}</SelectItem>
                      <SelectItem value="HIGH">{t("pages.patientDetail.severityHigh")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("pages.patientDetail.reactionTypeLabel")}</Label>
                  <Select
                    value={newAllergyForm.reactionType}
                    onValueChange={(v) => setNewAllergyForm((f) => ({ ...f, reactionType: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALLERGY_REACTION_TYPES.map((r) => (
                        <SelectItem key={r} value={r}>{allergyReactionTypeLabel(r, t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newAllergyForm.reactionType === "Other" && (
                    <div className="pt-1">
                      <Label className="text-xs text-muted-foreground">{t("pages.patientDetail.describeReactionOptional")}</Label>
                      <Input
                        value={newAllergyForm.reactionTypeOther}
                        onChange={(e) => setNewAllergyForm((f) => ({ ...f, reactionTypeOther: e.target.value }))}
                        placeholder={t("pages.patientDetail.describeReactionPlaceholder")}
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewAllergyOpen(false)}>{t("common.cancel")}</Button>
                <Button
                  onClick={() => {
                    const reactionType =
                      newAllergyForm.reactionType === "Other" && newAllergyForm.reactionTypeOther.trim()
                        ? newAllergyForm.reactionTypeOther.trim()
                        : newAllergyForm.reactionType === "Not specified"
                          ? undefined
                          : newAllergyForm.reactionType;
                    addAllergyMutation.mutate({
                      allergen: newAllergyForm.allergen.trim(),
                      severity: newAllergyForm.severity,
                      reactionType,
                    });
                  }}
                  disabled={!newAllergyForm.allergen.trim() || addAllergyMutation.isPending}
                >
                  {addAllergyMutation.isPending ? t("pages.patientDetail.adding") : t("pages.patientDetail.addAllergyCta")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {patientAllergies.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t("pages.patientDetail.documentedAllergiesTitle")}</h4>
              <ul className="space-y-2">
                {patientAllergies.map((a) => (
                  <Card key={a.id} className={a.severity === "HIGH" ? "border-destructive/50" : ""}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {a.severity === "HIGH" && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                          <span className={a.severity === "HIGH" ? "text-destructive font-medium" : ""}>{a.allergen}</span>
                          <Badge variant={a.severity === "HIGH" ? "destructive" : "secondary"} className="text-[10px]">{a.severity}</Badge>
                          {a.reactionType && (
                            <span className="text-xs text-muted-foreground">{a.reactionType}</span>
                          )}
                        </div>
                        {canAddNote && (
                          <Button size="sm" variant="ghost" onClick={() => deleteAllergyMutation.mutate(a.id)} disabled={deleteAllergyMutation.isPending}>
                            {t("pages.patientDetail.remove")}
                          </Button>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                        {t("pages.patientDetail.documentedAt", { date: safeFormatDateTime(a.createdAt, orgTz) })}
                        {" · "}
                        By {a.addedBy ? (prescriberNameById.get(a.addedBy) ?? a.addedBy) : "Unknown user"}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </ul>
            </div>
          ) : null}
          {patient?.allergies && patientAllergies.length === 0 && (
            <Card className="border-muted">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Legacy allergies (from patient record)</p>
                <p className="text-sm whitespace-pre-wrap">{patient.allergies}</p>
                <p className="text-xs text-muted-foreground mt-2">Add allergies above with severity so HIGH severity ones show in the demographics section.</p>
              </CardContent>
            </Card>
          )}
          {patientAllergies.length === 0 && !patient?.allergies && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t("pages.patientDetail.noAllergiesDocumented")} {canAddNote ? t("pages.patientDetail.addAllergyAbove") : ""}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-4 mt-4 data-[state=inactive]:hidden">
          <Tabs defaultValue="labs" className="w-full">
            <SidebarTabsNavLayout
              sidebar={
                <TabsList className={SIDEBAR_TABS_LIST_CLASS}>
                  <TabsTrigger value="labs" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                    <FlaskConical className="w-3.5 h-3.5 shrink-0" /> Labs
                  </TabsTrigger>
                  <TabsTrigger value="imaging" className={SIDEBAR_TABS_TRIGGER_CLASS}>
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" /> Imaging
                  </TabsTrigger>
                </TabsList>
              }
            >
            <TabsContent value="labs" className="mt-0 space-y-3 focus-visible:outline-none">
              <p className="text-sm text-muted-foreground">{t("pages.patientDetail.completedLabResultsHint")}</p>
              {labOrders.filter((o) => o.status === "resulted" || o.status === "completed").length === 0 && patientDocuments.filter((d) => d.documentType === "lab_result").length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    {t("pages.patientDetail.noLabResultsYet")}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {labOrders.filter((o) => o.status === "resulted" || o.status === "completed").map((order) => (
                    <Card key={order.id}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                          <span className="font-medium text-foreground shrink-0">{order.testName}</span>
                          {(order as LabOrder & { documentUrl?: string }).documentUrl && (
                            <a
                              href={(order as LabOrder & { documentUrl?: string }).documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-primary hover:text-primary/80"
                              title={t("pages.patientDetail.viewAttachedExternalResult")}
                              aria-label={t("pages.patientDetail.viewAttachedExternalResult")}
                            >
                              <Paperclip className="w-4 h-4" />
                            </a>
                          )}
                          {order.testCode && <span className="text-muted-foreground shrink-0">{order.testCode}</span>}
                          <span className="text-muted-foreground shrink-0">Resulted</span>
                          {order.result && <span className="text-muted-foreground shrink-0">{order.result}</span>}
                          {order.isCritical && <Badge variant="destructive" className="text-[10px] shrink-0">Critical</Badge>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                          Resulted {formatInOrgTimeZone(order.completedAt, "MMM d, yyyy · HH:mm", orgTz)}
                          {" · "}
                          By {prescriberNameById.get(order.orderedBy) ?? order.orderedBy ?? "Unknown user"}
                          {order.resultValue ? ` · Values: ${order.resultValue}` : ""}
                          {order.referenceRange ? ` · Ref: ${order.referenceRange}` : ""}
                        </div>
                        {(order as LabOrder & { documentUrl?: string }).documentUrl && (
                          <a
                            href={(order as LabOrder & { documentUrl?: string }).documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary underline mt-2 inline-flex items-center gap-1.5"
                          >
                            <Paperclip className="w-3.5 h-3.5" /> View document
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {patientDocuments.filter((d) => d.documentType === "lab_result").map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                          <span className="font-medium text-foreground shrink-0">{doc.title}</span>
                          <span className="text-muted-foreground shrink-0">Uploaded lab result</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                          Uploaded {formatInOrgTimeZone(doc.createdAt, "MMM d, yyyy · HH:mm", orgTz)}
                          {" · "}
                          By {doc.uploadedBy ? (prescriberNameById.get(doc.uploadedBy) ?? doc.uploadedBy) : "Unknown user"}
                        </div>
                        {doc.documentUrl && (
                          <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5" /> View document
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="imaging" className="mt-0 space-y-3 focus-visible:outline-none">
              <p className="text-sm text-muted-foreground">{t("pages.patientDetail.imagingHint")}</p>
              {imagingResults.length === 0 && imagingOrders.filter((o) => o.status === "completed" && o.documentUrl).length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    {t("pages.patientDetail.noImagingResultsYet")}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {imagingOrders
                    .filter((o) => o.status === "completed" && o.documentUrl)
                    .map((o) => (
                      <Card key={`order-${o.id}`}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                            <span className="font-medium shrink-0">{o.title}</span>
                            <a
                              href={o.documentUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-primary hover:text-primary/80"
                              title={t("pages.patientDetail.viewAttachedExternalResult")}
                              aria-label={t("pages.patientDetail.viewAttachedExternalResult")}
                            >
                              <Paperclip className="w-4 h-4" />
                            </a>
                            <span className="text-muted-foreground shrink-0">{o.modality}</span>
                            <span className="text-muted-foreground shrink-0">{t("pages.patientDetail.completedStatus")}</span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                            {t("pages.patientDetail.completedAtBy", {
                              date: formatInOrgTimeZone(o.completedAt, "MMM d, yyyy · HH:mm", orgTz),
                              by: prescriberNameById.get(o.orderedBy) ?? o.orderedBy ?? t("pages.patientDetail.unknownUser"),
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  {imagingResults.map((img) => (
                    <Card key={img.id}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0 overflow-x-auto whitespace-nowrap text-sm">
                          <span className="font-medium shrink-0">{img.title}</span>
                          {img.documentUrl && (
                            <a
                              href={img.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-primary hover:text-primary/80"
                              title={t("pages.patientDetail.viewAttachedResult")}
                              aria-label={t("pages.patientDetail.viewAttachedResult")}
                            >
                              <Paperclip className="w-4 h-4" />
                            </a>
                          )}
                          <span className="text-muted-foreground shrink-0">{img.modality}</span>
                          {img.description && <span className="text-muted-foreground shrink-0">{img.description}</span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-nowrap overflow-x-auto">
                          Performed {formatInOrgTimeZone(img.performedAt, "MMM d, yyyy · HH:mm", orgTz)}
                          {" · "}
                          By {img.uploadedBy ? (prescriberNameById.get(img.uploadedBy) ?? img.uploadedBy) : "Unknown user"}
                        </div>
                        {img.documentUrl && (
                          <a href={img.documentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5" /> View document
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            </SidebarTabsNavLayout>
          </Tabs>
        </TabsContent>

        <TabsContent value="forms-consent" className="mt-4 space-y-4 data-[state=inactive]:hidden">
          {id ? <PatientChartFormsConsentTab patientId={id} /> : null}
        </TabsContent>
          </div>
        </div>
      </Tabs>
      </div>

      <Dialog
        open={addProblemOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNewProblemStartDate("");
            setNewProblemSymptoms("");
            setNewProblemText("");
          }
          setAddProblemOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Add Problem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Problem</Label>
              <AfricanPatientProblemSelect
                value={newProblemText}
                onChange={setNewProblemText}
                data-testid="input-problem"
              />
            </div>
            <div className="space-y-2">
              <Label>Date problem started</Label>
              <Input
                type="date"
                value={newProblemStartDate}
                onChange={(e) => setNewProblemStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Symptoms</Label>
              <Textarea
                value={newProblemSymptoms}
                onChange={(e) => setNewProblemSymptoms(e.target.value)}
                placeholder="Describe symptoms the patient is having..."
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddProblemOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addProblemMutation.mutate({
                problem: newProblemText,
                status: "active",
                problemStartDate: newProblemStartDate.trim() || undefined,
                symptoms: newProblemSymptoms.trim() || undefined,
              })}
              disabled={!newProblemText.trim() || addProblemMutation.isPending}
              data-testid="button-submit-problem"
            >
              {addProblemMutation.isPending ? "Adding..." : "Add Problem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addPastProblemOpen}
        onOpenChange={(open) => {
          setAddPastProblemOpen(open);
          if (!open) {
            setNewPastProblemStartDate("");
            setNewPastProblemResolution("resolved");
            setNewPastProblemText("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages.patientDetail.addPastProblem")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("pages.patientDetail.pastProblemFieldLabel")}</Label>
              <AfricanPatientProblemSelect
                value={newPastProblemText}
                onChange={setNewPastProblemText}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.patientDetail.pastProblemDateStartedLabel")}</Label>
              <Input
                type="date"
                value={newPastProblemStartDate}
                onChange={(e) => setNewPastProblemStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.patientDetail.pastProblemStatusLabel")}</Label>
              <Select value={newPastProblemResolution} onValueChange={(v) => setNewPastProblemResolution(v as "current" | "resolved")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">{t("pages.patientDetail.problemStatusStillCurrent")}</SelectItem>
                  <SelectItem value="resolved">{t("pages.patientDetail.problemStatusResolvedLabel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddPastProblemOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => addProblemMutation.mutate({
                problem: newPastProblemText,
                status: "past",
                problemStartDate: newPastProblemStartDate.trim() || undefined,
                resolution: newPastProblemResolution,
              })}
              disabled={!newPastProblemText.trim() || addProblemMutation.isPending}
            >
              {addProblemMutation.isPending ? t("pages.patientDetail.adding") : t("pages.patientDetail.addPastProblem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editProblemOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditProblem(null);
            setEditProblemForm({ problemText: "", problemStartDate: "", symptoms: "", resolution: "resolved" });
          }
          setEditProblemOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Edit problem</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Problem</Label>
              <AfricanPatientProblemSelect
                value={editProblemForm.problemText}
                onChange={(v) => setEditProblemForm((f) => ({ ...f, problemText: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Date problem started</Label>
              <Input
                type="date"
                value={editProblemForm.problemStartDate}
                onChange={(e) => setEditProblemForm((f) => ({ ...f, problemStartDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Symptoms</Label>
              <Textarea
                value={editProblemForm.symptoms}
                onChange={(e) => setEditProblemForm((f) => ({ ...f, symptoms: e.target.value }))}
                placeholder="Symptoms the patient is having..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editProblemForm.resolution} onValueChange={(v) => setEditProblemForm((f) => ({ ...f, resolution: v as "current" | "resolved" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Still current</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditProblemOpen(false)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => editProblem && updateProblemMutation.mutate({
                problemId: editProblem.id,
                problem: editProblemForm.problemText,
                problemStartDate: editProblemForm.problemStartDate.trim() || undefined,
                symptoms: editProblemForm.symptoms,
                resolution: editProblemForm.resolution,
                status: editProblemForm.resolution === "resolved" ? "past" : undefined,
              })}
              disabled={!editProblem || !editProblemForm.problemText.trim() || updateProblemMutation.isPending}
            >
              {updateProblemMutation.isPending ? t("pages.patientDetail.saving") : t("pages.patientDetail.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addFamilyMemberOpen} onOpenChange={setAddFamilyMemberOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add family member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select value={newFamilyRelationship} onValueChange={setNewFamilyRelationship}>
                <SelectTrigger>
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  {FAMILY_RELATIONSHIPS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newFamilyRelationship === "Other" && (
              <div className="space-y-2">
                <Label>Specify relationship</Label>
                <Input
                  value={newFamilyRelationshipOther}
                  onChange={(e) => setNewFamilyRelationshipOther(e.target.value)}
                  placeholder="e.g. Grandmother, Uncle"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddFamilyMemberOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addFamilyMemberMutation.mutate(newFamilyRelationship === "Other" ? newFamilyRelationshipOther.trim() : newFamilyRelationship)}
              disabled={
                !newFamilyRelationship ||
                (newFamilyRelationship === "Other" ? !newFamilyRelationshipOther.trim() : false) ||
                addFamilyMemberMutation.isPending
              }
            >
              {addFamilyMemberMutation.isPending ? "Adding..." : "Add family member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addConditionOpen} onOpenChange={(open) => { if (!open) setAddConditionFamilyMember(null); setAddConditionOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add condition for {addConditionFamilyMember?.relationship}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={newConditionSelect} onValueChange={setNewConditionSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_INHERITED_CONDITIONS_AFRICA.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newConditionSelect === "Other" && (
              <div className="space-y-2">
                <Label>Specify condition</Label>
                <Input
                  value={newConditionOther}
                  onChange={(e) => setNewConditionOther(e.target.value)}
                  placeholder="Enter condition"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={newConditionNotes}
                onChange={(e) => setNewConditionNotes(e.target.value)}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddConditionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addConditionFamilyMember && addFamilyConditionMutation.mutate({
                familyMemberId: addConditionFamilyMember.id,
                condition: newConditionSelect === "Other" ? newConditionOther.trim() : newConditionSelect,
                notes: newConditionNotes.trim() || undefined,
              })}
              disabled={
                !addConditionFamilyMember ||
                !newConditionSelect ||
                (newConditionSelect === "Other" ? !newConditionOther.trim() : false) ||
                addFamilyConditionMutation.isPending
              }
            >
              {addFamilyConditionMutation.isPending ? "Adding..." : "Add condition"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(newNoteOpen || editNoteOpen) && (
        <aside className={`flex-shrink-0 h-full border-l border-border bg-background flex overflow-hidden transition-[width] ${notePanelCollapsed ? "w-7" : "w-[min(28rem,90vw)]"}`}>
          {notePanelCollapsed ? (
            <div className="relative w-full h-full">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setNotePanelCollapsed(false)}
                title="Expand note panel"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full p-0 border border-border/60 bg-muted/40 hover:bg-muted/70"
                data-testid="button-expand-note"
              >
                <ChevronLeft className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <>
          <div className="relative shrink-0 w-6 h-full border-r border-border bg-muted/30">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotePanelCollapsed(true)}
              title="Collapse note panel"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full p-0 border border-border/60 bg-background hover:bg-muted/50"
              data-testid="button-collapse-note"
            >
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
          <div className="flex flex-1 flex-col min-w-0">
          <div className="border-b px-6 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold truncate">{newNoteOpen ? "New Note" : "Edit note"}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {newNoteOpen
                    ? `Save as draft or sign when ready.`
                    : "Save as incomplete or sign to finalize."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
            {newNoteOpen ? (
              <>
                <div className="space-y-2">
                  <Label>Note type</Label>
                  <div className="flex flex-wrap gap-2">
                    {NOTE_TYPES.map((type) => (
                      <Button key={type} type="button" variant={newNoteType === type ? "default" : "outline"} size="sm" onClick={() => setNewNoteType(type)} data-testid={`note-type-${type.replace(/\s+/g, "-").toLowerCase()}`}>
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Note content</Label>
                    <Button type="button" variant="outline" size="sm" disabled={noteAiLoading} onClick={handleAiSuggestNote} className="gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      {noteAiLoading ? "Improving..." : "Improve with AI"}
                    </Button>
                  </div>
                  <div className="relative w-full rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 flex flex-col flex-1 min-h-0">
                    <Textarea
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Enter note content... Use the microphone to dictate."
                      className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 pr-14 pb-14 block w-full flex-1 min-h-0"
                      data-testid="input-note-content"
                    />
                    <div className="absolute inset-0 pointer-events-none flex items-end justify-end p-3">
                      <Button type="button" variant={noteListening ? "default" : "outline"} size="icon" className="pointer-events-auto h-9 w-9 rounded-full shrink-0 z-10" onClick={toggleNoteDictation} title={noteListening ? "Stop dictation" : "Start dictation"} data-testid="button-note-dictation">
                        <Mic className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2 flex flex-col flex-1 min-h-0">
                <Label>Note content</Label>
                <div className="relative w-full flex flex-1 flex-col rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 min-h-[min(45vh,18rem)]">
                  <Textarea
                    value={editNoteContent}
                    onChange={(e) => setEditNoteContent(e.target.value)}
                    placeholder="Enter note content..."
                    className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 block min-h-0 w-full flex-1"
                    data-testid="input-edit-note-content"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="border-t px-3 py-1.5">
            <DialogFooter className="flex-wrap gap-1">
              <Button variant="secondary" size="sm" className="h-8 px-2.5 text-xs" onClick={closeNotePanel}>Exit</Button>
              <Button
                variant="outline"
                onClick={() => newNoteOpen ? saveIncompleteNoteMutation.mutate({ content: newNoteContent, noteKind: newNoteType }) : editNoteId && saveIncompleteNoteMutation.mutate({ noteId: editNoteId, content: editNoteContent })}
                disabled={saveIncompleteNoteMutation.isPending || (newNoteOpen ? false : !editNoteId)}
                data-testid="button-save-incomplete-note"
                size="sm"
                className="h-8 px-2.5 text-xs"
              >
                {saveIncompleteNoteMutation.isPending ? t("pages.patientDetail.saving") : t("common.save")}
              </Button>
              {newNoteOpen ? (
                <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => addNoteMutation.mutate({ content: newNoteContent, noteKind: newNoteType })} disabled={!newNoteHasMinContent || addNoteMutation.isPending} data-testid="button-sign-note">
                  {addNoteMutation.isPending ? t("pages.patientDetail.signing") : t("pages.patientDetail.signNote")}
                </Button>
              ) : (() => {
                const editingNote = notes.find((n) => n.id === editNoteId);
                const isIncomplete = (editingNote as PatientNote & { status?: string })?.status === "incomplete";
                return isIncomplete ? (
                  <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => editNoteId && updateNoteMutation.mutate({ noteId: editNoteId, content: editNoteContent, signAndSave: true })} disabled={!editNoteHasMinContent || updateNoteMutation.isPending || !editNoteId} data-testid="button-sign-note">
                    {updateNoteMutation.isPending ? t("pages.patientDetail.signing") : t("pages.patientDetail.signNote")}
                  </Button>
                ) : (
                  <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => editNoteId && updateNoteMutation.mutate({ noteId: editNoteId, content: editNoteContent })} disabled={!editNoteHasMinContent || updateNoteMutation.isPending || !editNoteId} data-testid="button-save-edited-note">
                    {updateNoteMutation.isPending ? t("pages.patientDetail.saving") : t("pages.patientDetail.saveChanges")}
                  </Button>
                );
              })()}
            </DialogFooter>
          </div>
          </div>
            </>
          )}
        </aside>
      )}

      <Dialog open={viewNoteOpen} onOpenChange={(open) => { setViewNoteOpen(open); if (!open) setViewNote(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages.patientDetail.reviewNoteTitle")}</DialogTitle>
          </DialogHeader>
          {viewNote && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">
                  {(viewNote as PatientNote & { noteKind?: string }).noteKind ?? t("pages.patientDetail.progressNote")}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {viewNote.authorRole === "nursing" ? t("pages.patientDetail.authorRoleNursing") : t("pages.patientDetail.authorRoleClinician")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {t("pages.patientDetail.signedAtBy", {
                    date: formatInOrgTimeZone(viewNote.signedAt, "MMM d, yyyy · HH:mm", orgTz),
                    by: viewNote.authorId ? (prescriberNameById.get(viewNote.authorId) ?? viewNote.authorId) : t("pages.patientDetail.unknownUser"),
                  })}
                </span>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-sm whitespace-pre-wrap">{viewNote.content}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={leaveNotePromptOpen} onOpenChange={setLeaveNotePromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pages.patientDetail.finishOpenNoteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("pages.patientDetail.finishOpenNoteDesc")}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLeaveNotePromptOpen(false); setPendingLeavePath(null); }}>
              {t("pages.patientDetail.stayHere")}
            </Button>
            <Button
              onClick={() => {
                setLeaveNotePromptOpen(false);
                signAndLeavePending();
              }}
              disabled={addNoteMutation.isPending || updateNoteMutation.isPending}
            >
              {t("pages.patientDetail.signNoteLower")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!reopenVisitPrompt}
        onOpenChange={(open) => {
          if (!open && !skipReopenDeclineRef.current) {
            declineReopenVisit();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.patientDetail.visitAlreadySignedTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pages.patientDetail.reopenVisitPromptDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reopenVisitLoading}>{t("pages.patientDetail.noBackToSchedule")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={reopenVisitLoading}
              onClick={(e) => {
                e.preventDefault();
                void confirmReopenVisit();
              }}
            >
              {reopenVisitLoading ? t("pages.patientDetail.opening") : t("pages.patientDetail.yesEditDocumentation")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newOrderOpen} onOpenChange={(open) => { setNewOrderOpen(open); if (!open) setOrderComposerType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {orderComposerType === null
                ? t("pages.patientDetail.newOrderTitle")
                : orderComposerType === "lab"
                  ? t("pages.patientDetail.newLabOrderTitle")
                  : orderComposerType === "imaging"
                    ? t("pages.patientDetail.newImagingOrderTitle")
                    : t("pages.patientDetail.newMedicationOrderTitle")}
            </DialogTitle>
          </DialogHeader>
          {orderComposerType === null ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">{t("pages.patientDetail.chooseOrderTypeDesc")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" onClick={() => setOrderComposerType("lab")}>
                  <span className="font-medium">{t("pages.patientDetail.orderTypeLab")}</span>
                  <span className="text-xs text-muted-foreground">{t("pages.patientDetail.orderTypeLabHint")}</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" onClick={() => setOrderComposerType("imaging")}>
                  <span className="font-medium">{t("pages.patientDetail.orderTypeImaging")}</span>
                  <span className="text-xs text-muted-foreground">{t("pages.patientDetail.orderTypeImagingHint")}</span>
                </Button>
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" onClick={() => setOrderComposerType("medication")}>
                  <span className="font-medium">{t("pages.patientDetail.orderTypeMedication")}</span>
                  <span className="text-xs text-muted-foreground">{t("pages.patientDetail.orderTypeMedicationHint")}</span>
                </Button>
              </div>
            </div>
          ) : orderComposerType === "lab" ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("pages.patientDetail.testLabelRequired")}</Label>
                  <Select
                    value={COMMON_LAB_TESTS_AFRICA.some((t) => t.testName === newOrderForm.testName && t.testCode === newOrderForm.testCode) ? newOrderForm.testName : "other"}
                    onValueChange={(v) => {
                      if (v === "other") {
                        setNewOrderForm((f) => ({ ...f, testName: "", testCode: "" }));
                      } else {
                        const t = COMMON_LAB_TESTS_AFRICA.find((x) => x.testName === v);
                        if (t) setNewOrderForm((f) => ({ ...f, testName: t.testName, testCode: t.testCode }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select common lab test" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_LAB_TESTS_AFRICA.map((t) => (
                        <SelectItem key={t.testCode} value={t.testName}>{t.testName}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter below)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(newOrderForm.testName === "" || !COMMON_LAB_TESTS_AFRICA.some((t) => t.testName === newOrderForm.testName)) && (
                  <>
                    <div className="space-y-2">
                      <Label>Test name</Label>
                      <Input
                        value={newOrderForm.testName}
                        onChange={(e) => setNewOrderForm((f) => ({ ...f, testName: e.target.value }))}
                        placeholder="e.g. CBC, BMP"
                        data-testid="input-order-test-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Test code</Label>
                      <Input
                        value={newOrderForm.testCode}
                        onChange={(e) => setNewOrderForm((f) => ({ ...f, testCode: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3"
                    value={newOrderForm.priority}
                    onChange={(e) => setNewOrderForm((f) => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">Stat</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Where will this be done?</Label>
                  <Select
                    value={newOrderForm.internalExternal}
                    onValueChange={(v) => setNewOrderForm((f) => ({ ...f, internalExternal: v as "internal" | "external" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal (in-facility lab)</SelectItem>
                      <SelectItem value="external">External (outside lab)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOrderComposerType(null)}>Back</Button>
                <Button
                  onClick={() => addOrderMutation.mutate(newOrderForm)}
                  disabled={!newOrderForm.testName.trim() || addOrderMutation.isPending}
                  data-testid="button-submit-order"
                >
                  {addOrderMutation.isPending ? "Creating..." : "Create lab order"}
                </Button>
              </DialogFooter>
            </>
          ) : orderComposerType === "imaging" ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Associated problem</Label>
                  <Select
                    value={newImagingOrderForm.patientProblemId || "none"}
                    onValueChange={(v) => setNewImagingOrderForm((f) => ({ ...f, patientProblemId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select problem (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {problems.filter((p) => p.status !== "past").map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.problem}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Link this imaging order to an active problem</p>
                </div>
                <div className="space-y-2">
                  <Label>Imaging study *</Label>
                  <Select
                    value={COMMON_IMAGING_AFRICA.some((i) => i.title === newImagingOrderForm.title && i.modality === newImagingOrderForm.modality) ? newImagingOrderForm.title : "other"}
                    onValueChange={(v) => {
                      if (v === "other") {
                        setNewImagingOrderForm((f) => ({ ...f, title: "", modality: "X-Ray" }));
                      } else {
                        const item = COMMON_IMAGING_AFRICA.find((x) => x.title === v);
                        if (item) setNewImagingOrderForm((f) => ({ ...f, title: item.title, modality: item.modality }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select common imaging" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_IMAGING_AFRICA.filter((i) => i.title !== "Other").map((item) => (
                        <SelectItem key={item.title} value={item.title}>{item.title} ({item.modality})</SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter below)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(!newImagingOrderForm.title || !COMMON_IMAGING_AFRICA.some((i) => i.title === newImagingOrderForm.title)) && (
                  <>
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={newImagingOrderForm.title}
                        onChange={(e) => setNewImagingOrderForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. Chest X-Ray"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Modality</Label>
                      <Select
                        value={newImagingOrderForm.modality}
                        onValueChange={(v) => setNewImagingOrderForm((f) => ({ ...f, modality: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="X-Ray">X-Ray</SelectItem>
                          <SelectItem value="CT">CT</SelectItem>
                          <SelectItem value="MRI">MRI</SelectItem>
                          <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Where will this be done?</Label>
                  <Select
                    value={newImagingOrderForm.internalExternal}
                    onValueChange={(v) => setNewImagingOrderForm((f) => ({ ...f, internalExternal: v as "internal" | "external" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal (in-facility)</SelectItem>
                      <SelectItem value="external">External (outside facility)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOrderComposerType(null)}>Back</Button>
                <Button
                  onClick={() => addImagingOrderMutation.mutate(newImagingOrderForm)}
                  disabled={!newImagingOrderForm.title.trim() || addImagingOrderMutation.isPending}
                  data-testid="button-submit-imaging-order"
                >
                  {addImagingOrderMutation.isPending ? "Creating..." : "Create imaging order"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Associated problem</Label>
                  <Select
                    value={newMedOrderForm.patientProblemId || "none"}
                    onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, patientProblemId: v === "none" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select problem (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {problems.filter((p) => p.status !== "past").map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.problem}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Link this order to a problem on the patient&apos;s list</p>
                </div>
                <div className="space-y-2">
                  <Label>Medication name *</Label>
                  <Select
                    value={COMMON_MEDICATIONS_AFRICA.includes(newMedOrderForm.medicationName) ? newMedOrderForm.medicationName : (newMedOrderForm.medicationName ? "other" : "")}
                    onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, medicationName: v === "other" ? "" : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select or type below" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_MEDICATIONS_AFRICA.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                      <SelectItem value="other">Other (enter below)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={newMedOrderForm.medicationName}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, medicationName: e.target.value }))}
                    placeholder="e.g. Amoxicillin"
                    data-testid="input-med-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Dose *</Label>
                    <Select
                      value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? newMedOrderForm.dosage : "Other"}
                      onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, dosage: v === "Other" ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dose" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOSE_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!newMedOrderForm.dosage || newMedOrderForm.dosage === "Other" || !DOSE_OPTIONS.includes(newMedOrderForm.dosage as any)) && (
                      <Input
                        value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? "" : newMedOrderForm.dosage}
                        onChange={(e) => setNewMedOrderForm((f) => ({ ...f, dosage: e.target.value }))}
                        placeholder="e.g. 500mg"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Frequency *</Label>
                    <Select
                      value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? newMedOrderForm.frequency : "Other"}
                      onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, frequency: v === "Other" ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((fr) => (
                          <SelectItem key={fr} value={fr}>{fr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!newMedOrderForm.frequency || newMedOrderForm.frequency === "Other" || !FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any)) && (
                      <Input
                        value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? "" : newMedOrderForm.frequency}
                        onChange={(e) => setNewMedOrderForm((f) => ({ ...f, frequency: e.target.value }))}
                        placeholder="e.g. twice daily"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Order type *</Label>
                  <Select
                    value={newMedOrderForm.orderType}
                    onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, orderType: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select order type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="administered">Clinic/Hospital Administered</SelectItem>
                      <SelectItem value="prescription">Prescription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newMedOrderForm.orderType === "administered" ? (
                  <div className="space-y-2">
                    <Label>Route *</Label>
                    <Select
                      value={newMedOrderForm.route}
                      onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, route: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select route" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUTE_OPTIONS.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {routeLabel(r.id, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {newMedOrderForm.orderType === "administered" && newMedOrderForm.route === "iv" ? (
                  <div className="space-y-2">
                    <Label>Rate *</Label>
                    <Input
                      value={newMedOrderForm.rate}
                      onChange={(e) => setNewMedOrderForm((f) => ({ ...f, rate: e.target.value }))}
                      placeholder="e.g. 100 mL/hr"
                    />
                  </div>
                ) : null}

                {newMedOrderForm.orderType === "prescription" ? (
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={DURATION_OPTIONS.includes(newMedOrderForm.duration as any) ? newMedOrderForm.duration : (newMedOrderForm.duration ? "Other" : "none")}
                      onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, duration: v === "Other" || v === "none" ? "" : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {DURATION_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(newMedOrderForm.duration && !DURATION_OPTIONS.includes(newMedOrderForm.duration as any)) && (
                      <Input
                        value={newMedOrderForm.duration}
                        onChange={(e) => setNewMedOrderForm((f) => ({ ...f, duration: e.target.value }))}
                        placeholder="e.g. 7 days"
                      />
                    )}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea
                    value={newMedOrderForm.instructions}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, instructions: e.target.value }))}
                    placeholder="Take with food, etc."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setOrderComposerType(null)}>Back</Button>
                <Button
                  onClick={() => addPrescriptionMutation.mutate(newMedOrderForm)}
                  disabled={
                    !newMedOrderForm.medicationName.trim() ||
                    !newMedOrderForm.dosage.trim() ||
                    !newMedOrderForm.frequency.trim() ||
                    (newMedOrderForm.orderType === "administered" && !newMedOrderForm.route) ||
                    (newMedOrderForm.orderType === "administered" && newMedOrderForm.route === "iv" && !newMedOrderForm.rate.trim()) ||
                    addPrescriptionMutation.isPending
                  }
                  data-testid="button-submit-med-order"
                >
                  {addPrescriptionMutation.isPending ? "Creating..." : "Create order"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={newMedOrderOpen} onOpenChange={setNewMedOrderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New medication order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Associated problem</Label>
              <Select
                value={newMedOrderForm.patientProblemId || "none"}
                onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, patientProblemId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select problem (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {problems.filter((p) => p.status !== "past").map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.problem}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Link this order to a problem on the patient&apos;s list</p>
            </div>
            <div className="space-y-2">
              <Label>Medication name *</Label>
              <Select
                value={COMMON_MEDICATIONS_AFRICA.includes(newMedOrderForm.medicationName) ? newMedOrderForm.medicationName : (newMedOrderForm.medicationName ? "other" : "")}
                onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, medicationName: v === "other" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select or type below" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_MEDICATIONS_AFRICA.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="other">Other (enter below)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newMedOrderForm.medicationName}
                onChange={(e) => setNewMedOrderForm((f) => ({ ...f, medicationName: e.target.value }))}
                placeholder="e.g. Amoxicillin"
                data-testid="input-med-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dose *</Label>
                <Select
                  value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? newMedOrderForm.dosage : "Other"}
                  onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, dosage: v === "Other" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dose" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSE_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!newMedOrderForm.dosage || newMedOrderForm.dosage === "Other" || !DOSE_OPTIONS.includes(newMedOrderForm.dosage as any)) && (
                  <Input
                    value={DOSE_OPTIONS.includes(newMedOrderForm.dosage as any) ? "" : newMedOrderForm.dosage}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, dosage: e.target.value }))}
                    placeholder="e.g. 500mg"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Frequency *</Label>
                <Select
                  value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? newMedOrderForm.frequency : "Other"}
                  onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, frequency: v === "Other" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((fr) => (
                      <SelectItem key={fr} value={fr}>{fr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!newMedOrderForm.frequency || newMedOrderForm.frequency === "Other" || !FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any)) && (
                  <Input
                    value={FREQUENCY_OPTIONS.includes(newMedOrderForm.frequency as any) ? "" : newMedOrderForm.frequency}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, frequency: e.target.value }))}
                    placeholder="e.g. twice daily"
                  />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Order type *</Label>
              <Select
                value={newMedOrderForm.orderType}
                onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, orderType: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select order type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administered">Clinic/Hospital Administered</SelectItem>
                  <SelectItem value="prescription">Prescription</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newMedOrderForm.orderType === "administered" ? (
              <div className="space-y-2">
                <Label>Route *</Label>
                <Select
                  value={newMedOrderForm.route}
                  onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, route: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTE_OPTIONS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {routeLabel(r.id, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {newMedOrderForm.orderType === "administered" && newMedOrderForm.route === "iv" ? (
              <div className="space-y-2">
                <Label>Rate *</Label>
                <Input
                  value={newMedOrderForm.rate}
                  onChange={(e) => setNewMedOrderForm((f) => ({ ...f, rate: e.target.value }))}
                  placeholder="e.g. 100 mL/hr"
                />
              </div>
            ) : null}

            {newMedOrderForm.orderType === "prescription" ? (
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select
                  value={DURATION_OPTIONS.includes(newMedOrderForm.duration as any) ? newMedOrderForm.duration : (newMedOrderForm.duration ? "Other" : "none")}
                  onValueChange={(v) => setNewMedOrderForm((f) => ({ ...f, duration: v === "Other" || v === "none" ? "" : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(newMedOrderForm.duration && !DURATION_OPTIONS.includes(newMedOrderForm.duration as any)) && (
                  <Input
                    value={newMedOrderForm.duration}
                    onChange={(e) => setNewMedOrderForm((f) => ({ ...f, duration: e.target.value }))}
                    placeholder="e.g. 7 days"
                  />
                )}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={newMedOrderForm.instructions}
                onChange={(e) => setNewMedOrderForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Take with food, etc."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewMedOrderOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addPrescriptionMutation.mutate(newMedOrderForm)}
              disabled={
                !newMedOrderForm.medicationName.trim() ||
                !newMedOrderForm.dosage.trim() ||
                !newMedOrderForm.frequency.trim() ||
                (newMedOrderForm.orderType === "administered" && !newMedOrderForm.route) ||
                addPrescriptionMutation.isPending
              }
              data-testid="button-submit-med-order"
            >
              {addPrescriptionMutation.isPending ? "Creating..." : "Create order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
