/**
 * Application UI customization: activity ordering, labels, visibility (per role).
 * Used by Systems administrator → Application configuration and /api/auth/me → activityUi.
 */

import { NAV_ITEM_CAPABILITY_ID } from "./role-capabilities-registry";

/** Layout contexts stored in `ui_activity_layout`. Primary module links (hdr_*) and secondary row (tb_*) share `toolbar`. */
export const UI_ACTIVITY_CONTEXTS = [
  "toolbar",
  "patient_chart_review",
  "patient_chart_visit_doc",
  "admin_activities",
] as const;
export type UiActivityContext = (typeof UI_ACTIVITY_CONTEXTS)[number];

/** Administration → Administrative section (facilities, beds, forms, audit). Maps to `admin.*` capabilities. */
export const ADMIN_ACTIVITIES_ORDER: {
  id: string;
  defaultLabel: string;
  requiredCapability: string;
  adminSubTab: "facilities" | "beds" | "forms" | "audit";
}[] = [
  { id: "aa_facilities", defaultLabel: "Facilities", requiredCapability: "admin.facilities", adminSubTab: "facilities" },
  {
    id: "aa_bed_management",
    defaultLabel: "Bed management",
    requiredCapability: "admin.beds",
    adminSubTab: "beds",
  },
  {
    id: "aa_forms_consent",
    defaultLabel: "Forms & Consent",
    requiredCapability: "admin.forms",
    adminSubTab: "forms",
  },
  { id: "aa_audit_log", defaultLabel: "Audit log", requiredCapability: "admin.audit", adminSubTab: "audit" },
];

export type AdminSubTabKey = (typeof ADMIN_ACTIVITIES_ORDER)[number]["adminSubTab"];

/** Resolve which Administrative sub-tabs to show (order follows Application configuration). */
export function adminSubTabsFromActivityUi(
  role: string,
  capabilities: Set<string>,
  adminActivitiesNav: { id: string }[] | null | undefined,
): AdminSubTabKey[] {
  if (adminActivitiesNav != null) {
    const idToSub = new Map(ADMIN_ACTIVITIES_ORDER.map((x) => [x.id, x.adminSubTab]));
    return adminActivitiesNav.map((n) => idToSub.get(n.id)).filter((x): x is AdminSubTabKey => x != null);
  }
  const out: AdminSubTabKey[] = [];
  for (const row of ADMIN_ACTIVITIES_ORDER) {
    if (isActivityApplicableForRole(role, "admin_activities", row.id, capabilities)) {
      out.push(row.adminSubTab);
    }
  }
  return out;
}

export type UiActivityLayoutRow = {
  role: string;
  context: UiActivityContext;
  activityId: string;
  labelOverride: string | null;
  sortOrder: number;
  hidden: boolean;
  /** When true, Application configuration locks Hide / Sort / Label / Reset for this row (per role + area). */
  readOnly: boolean;
};

/** Primary Toolbar module link ids (hdr_*) — rendered in AppHeaderNav; paired destinations also have tb_* (deduplicated in unified catalog). */
export const HEADER_NAV_ACTIVITY_ORDER: { id: string; defaultLabel: string; titleKey: string }[] = [
  { id: "hdr_dashboard", defaultLabel: "Dashboard", titleKey: "Dashboard" },
  { id: "hdr_billing", defaultLabel: "Billing", titleKey: "Billing" },
  { id: "hdr_scheduled_appt", defaultLabel: "Scheduled Appointment", titleKey: "Scheduled Appointment" },
  { id: "hdr_patient_followup", defaultLabel: "Patient Follow up", titleKey: "Patient Follow up" },
  { id: "hdr_laboratory", defaultLabel: "Laboratory", titleKey: "Laboratory" },
  { id: "hdr_uploads", defaultLabel: "Uploads", titleKey: "Uploads" },
  { id: "hdr_org_config", defaultLabel: "Organization configuration", titleKey: "Organization configuration" },
  { id: "hdr_user_mgmt", defaultLabel: "User management", titleKey: "User management" },
  { id: "hdr_role_mgmt", defaultLabel: "Role management", titleKey: "Role management" },
  { id: "hdr_administrative", defaultLabel: "Administrative", titleKey: "Administrative" },
];

/** Secondary toolbar row (tb_*). */
export const TOOLBAR_ACTIVITY_ORDER: { id: string; defaultLabel: string }[] = [
  { id: "tb_systems_dashboard", defaultLabel: "Dashboard" },
  { id: "tb_administrative", defaultLabel: "Administrative" },
  { id: "tb_api", defaultLabel: "API" },
  { id: "tb_application_config", defaultLabel: "Application configuration" },
  { id: "tb_organization_config", defaultLabel: "Organization configuration" },
  { id: "tb_patient_portal_config", defaultLabel: "Patient portal configuration" },
  { id: "tb_user_management", defaultLabel: "User management" },
  { id: "tb_role_management", defaultLabel: "Role management" },
  { id: "tb_schedule", defaultLabel: "Schedule" },
  { id: "tb_admin", defaultLabel: "Admin" },
  { id: "tb_bed_management", defaultLabel: "Bed management" },
  { id: "tb_patient_call", defaultLabel: "Patient Call" },
  { id: "tb_reception_appointments", defaultLabel: "Scheduled Appointment" },
  { id: "tb_laboratory", defaultLabel: "Laboratory" },
  { id: "tb_uploads", defaultLabel: "Uploads" },
  { id: "tb_register_patient", defaultLabel: "New Patient" },
];

/**
 * Single Application configuration list: primary module links (hdr_*) plus the secondary row (tb_*) — together these are the Toolbar.
 * Duplicates the same destination (e.g. hdr_laboratory + tb_laboratory) — only tb_* is listed.
 */
export const TOOLBAR_UNIFIED_ACTIVITY_ORDER: { id: string; defaultLabel: string; titleKey?: string }[] = [
  { id: "hdr_dashboard", defaultLabel: "Dashboard", titleKey: "Dashboard" },
  { id: "hdr_billing", defaultLabel: "Billing", titleKey: "Billing" },
  { id: "hdr_patient_followup", defaultLabel: "Patient Follow up", titleKey: "Patient Follow up" },
  ...TOOLBAR_ACTIVITY_ORDER.map((t) => ({ id: t.id, defaultLabel: t.defaultLabel })),
];

export const PATIENT_CHART_REVIEW_ORDER: { id: string; defaultLabel: string }[] = [
  { id: "pc_demographics", defaultLabel: "Demographics" },
  { id: "pc_patient_call", defaultLabel: "Patient call" },
  { id: "pc_patient_record", defaultLabel: "Patient Record" },
  { id: "pc_overview", defaultLabel: "Overview" },
  { id: "pc_history", defaultLabel: "History" },
  { id: "pc_immunization", defaultLabel: "Immunization" },
  { id: "pc_results", defaultLabel: "Results" },
  { id: "pc_forms_consent", defaultLabel: "Forms & Consent" },
];

export const PATIENT_CHART_VISIT_DOC_ORDER: { id: string; defaultLabel: string }[] = [
  { id: "pc_allergy", defaultLabel: "Allergy" },
  { id: "pc_problems", defaultLabel: "Problems List" },
  { id: "pc_vitals", defaultLabel: "Vitals" },
  { id: "pc_medication", defaultLabel: "Medication" },
  { id: "pc_orders", defaultLabel: "Orders" },
  { id: "pc_notes", defaultLabel: "Notes" },
  { id: "pc_visit_summary", defaultLabel: "Visit Summary" },
];

function titleKeyToCapability(titleKey: string): string | undefined {
  return NAV_ITEM_CAPABILITY_ID[titleKey as keyof typeof NAV_ITEM_CAPABILITY_ID];
}

/** Map legacy DB value `header_nav` to `toolbar` (merged configuration area). */
export function normalizeUiActivityLayoutRowContext(context: string): UiActivityContext {
  if (context === "header_nav") return "toolbar";
  return context as UiActivityContext;
}

export function normalizeUiActivityLayoutRows(
  rows: Array<Omit<UiActivityLayoutRow, "context" | "readOnly"> & { context: string; readOnly?: boolean }>,
): UiActivityLayoutRow[] {
  return rows.map((r) => ({
    ...r,
    context: normalizeUiActivityLayoutRowContext(r.context),
    readOnly: r.readOnly ?? false,
  }));
}

/**
 * Whether an activity appears in the **default** UI for a role (capabilities + toolbar rules).
 * Used by Systems administrator → Application configuration to pre-check Hide for items this role cannot use.
 * Systems administrators do not use the module header strip — hdr_* rows are never applicable for `security`.
 */
export function isActivityApplicableForRole(
  role: string,
  context: UiActivityContext,
  activityId: string,
  capabilities: Set<string>,
): boolean {
  switch (context) {
    case "toolbar": {
      if (activityId.startsWith("hdr_")) {
        if (role === "security") return false;
        const meta = HEADER_NAV_ACTIVITY_ORDER.find((h) => h.id === activityId);
        if (!meta) return false;
        const cid = titleKeyToCapability(meta.titleKey);
        if (!cid) return false;
        return capabilities.has(cid);
      }
      if (!toolbarActivityIdsForRole(role).includes(activityId)) return false;
      const req = toolbarSecondaryRequiredCapabilities(activityId, role);
      if (req.length > 0) return req.every((c) => capabilities.has(c));
      return true;
    }
    case "patient_chart_review": {
      if (!capabilities.has("activity.patient_search")) return false;
      switch (activityId) {
        case "pc_patient_record":
          return role !== "security";
        case "pc_immunization":
          return capabilities.has("nav.laboratory");
        case "pc_results":
          return capabilities.has("nav.laboratory") || capabilities.has("nav.uploads");
        case "pc_forms_consent":
          return role !== "super_admin" && role !== "security";
        default:
          return true;
      }
    }
    case "patient_chart_visit_doc":
      return capabilities.has("activity.encounter_documentation");
    case "admin_activities": {
      const meta = ADMIN_ACTIVITIES_ORDER.find((a) => a.id === activityId);
      if (!meta) return false;
      if (!capabilities.has(meta.requiredCapability)) return false;
      if (meta.adminSubTab === "beds" && role !== "super_admin" && role !== "security") return false;
      if (meta.adminSubTab === "forms" && role !== "security") return false;
      return true;
    }
    default:
      return false;
  }
}

function mergeRows(
  defaults: { id: string; defaultLabel: string }[],
  context: UiActivityContext,
  role: string,
  rows: UiActivityLayoutRow[],
): { id: string; label: string }[] {
  const relevant = rows.filter((r) => r.role === role && r.context === context);
  const byId = new Map(
    defaults.map((d, i) => [d.id, { id: d.id, label: d.defaultLabel, sort: i, hidden: false }]),
  );
  for (const r of relevant) {
    const cur = byId.get(r.activityId);
    if (!cur) continue;
    if (r.labelOverride && r.labelOverride.trim()) cur.label = r.labelOverride.trim();
    cur.sort = r.sortOrder;
    cur.hidden = r.hidden;
  }
  return Array.from(byId.values())
    .filter((x) => !x.hidden)
    .sort((a, b) => a.sort - b.sort)
    .map(({ id, label }) => ({ id, label }));
}

function buildDefaultUnifiedToolbarItems(role: string, cap: Set<string>): { id: string; defaultLabel: string }[] {
  const tbIds = new Set(toolbarActivityIdsForRole(role));
  const out: { id: string; defaultLabel: string }[] = [];
  for (const entry of TOOLBAR_UNIFIED_ACTIVITY_ORDER) {
    if (entry.id.startsWith("hdr_")) {
      if (role === "security") continue;
      const tk = entry.titleKey;
      if (!tk) continue;
      const cid = titleKeyToCapability(tk);
      if (!cid || !cap.has(cid)) continue;
      out.push({ id: entry.id, defaultLabel: entry.defaultLabel });
    } else if (tbIds.has(entry.id)) {
      const req = toolbarSecondaryRequiredCapabilities(entry.id, role);
      if (req.length > 0 && !req.every((c) => cap.has(c))) continue;
      out.push({ id: entry.id, defaultLabel: entry.defaultLabel });
    }
  }
  return out;
}

/** Which toolbar activity ids apply to which roles (before capability filtering on header). */
export function toolbarActivityIdsForRole(role: string): string[] {
  switch (role) {
    case "security":
      return [
        "tb_systems_dashboard",
        "tb_administrative",
        "tb_application_config",
        "tb_organization_config",
        "tb_patient_portal_config",
        "tb_user_management",
        "tb_role_management",
      ];
    case "super_admin":
      return ["tb_schedule", "tb_admin", "tb_bed_management", "tb_patient_call"];
    case "reception":
      return ["tb_reception_appointments", "tb_patient_call", "tb_register_patient"];
    case "clinician":
    case "nurse":
      return ["tb_schedule", "tb_patient_call", "tb_laboratory", "tb_uploads"];
    case "lab_tech":
      return ["tb_schedule", "tb_patient_call"];
    default:
      return ["tb_schedule", "tb_patient_call"];
  }
}

/**
 * Secondary toolbar (tb_*): required capabilities (ALL must be granted) for the item to appear.
 * Must stay aligned with Role management capability matrix and Application configuration sync.
 */
export function toolbarSecondaryRequiredCapabilities(activityId: string, role: string): string[] {
  const t: Record<string, Record<string, string[]>> = {
    tb_systems_dashboard: { security: ["nav.admin"] },
    tb_administrative: { security: ["admin.facilities"] },
    tb_application_config: { security: ["admin.organization"] },
    tb_organization_config: { security: ["admin.organization"] },
    tb_patient_portal_config: { security: ["admin.organization"] },
    tb_user_management: { security: ["admin.users"] },
    tb_role_management: { security: ["admin.roles"] },
    tb_schedule: {
      super_admin: ["activity.schedule"],
      clinician: ["activity.schedule"],
      nurse: ["activity.schedule"],
      reception: ["activity.schedule"],
      lab_tech: ["activity.schedule"],
      security: ["activity.schedule"],
    },
    tb_admin: { super_admin: ["admin.users"] },
    tb_bed_management: {
      super_admin: ["activity.admission_beds"],
      clinician: ["activity.admission_beds"],
      nurse: ["activity.admission_beds"],
      security: ["activity.admission_beds"],
    },
    tb_patient_call: {
      super_admin: ["activity.patient_search"],
      clinician: ["activity.patient_search"],
      nurse: ["activity.patient_search"],
      reception: ["activity.patient_search"],
      lab_tech: ["activity.patient_search"],
      security: ["activity.patient_search"],
    },
    tb_reception_appointments: { reception: ["nav.scheduled_appointments"] },
    tb_laboratory: {
      super_admin: ["nav.laboratory"],
      clinician: ["nav.laboratory"],
      nurse: ["nav.laboratory"],
      lab_tech: ["nav.laboratory"],
    },
    tb_uploads: {
      super_admin: ["nav.uploads"],
      clinician: ["nav.uploads"],
      nurse: ["nav.uploads"],
      lab_tech: ["nav.uploads"],
    },
    tb_register_patient: { reception: ["activity.patient_search"] },
  };
  return t[activityId]?.[role] ?? [];
}

export function computeActivityUiForRole(
  role: string,
  capabilities: string[],
  layoutRows: UiActivityLayoutRow[],
): {
  headerNav: { id: string; label: string }[];
  toolbar: { id: string; label: string }[];
  patientChartReview: { id: string; label: string }[];
  patientChartVisitDoc: { id: string; label: string }[];
  /** Administration → Administrative sub-sections (Facilities, Audit, …). */
  adminActivities: { id: string; label: string }[];
} {
  const cap = new Set(capabilities);
  const normalizedRows = normalizeUiActivityLayoutRows(layoutRows);

  const unifiedDefaults = buildDefaultUnifiedToolbarItems(role, cap);
  const mergedToolbarStrip = mergeRows(unifiedDefaults, "toolbar", role, normalizedRows);

  const reviewDefaults = PATIENT_CHART_REVIEW_ORDER.map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));
  const visitDefaults = PATIENT_CHART_VISIT_DOC_ORDER.map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));
  const adminDefaults = ADMIN_ACTIVITIES_ORDER.filter((x) =>
    isActivityApplicableForRole(role, "admin_activities", x.id, cap),
  ).map((x) => ({ id: x.id, defaultLabel: x.defaultLabel }));

  return {
    /** Primary module links (hdr_*) — empty for Systems administrator. */
    headerNav: role === "security" ? [] : mergedToolbarStrip.filter((x) => x.id.startsWith("hdr_")),
    /** Secondary row (tb_*). */
    toolbar: mergedToolbarStrip.filter((x) => x.id.startsWith("tb_")),
    patientChartReview: mergeRows(reviewDefaults, "patient_chart_review", role, normalizedRows),
    patientChartVisitDoc: mergeRows(visitDefaults, "patient_chart_visit_doc", role, normalizedRows),
    adminActivities: mergeRows(adminDefaults, "admin_activities", role, normalizedRows),
  };
}
