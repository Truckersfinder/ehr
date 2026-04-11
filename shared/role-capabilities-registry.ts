/**
 * Canonical catalog of capabilities for role-based access (navigation, admin sections, activities).
 * IDs are stable; labels are shown in Systems Admin → Role Management.
 */

export type CapabilityCategory = "navigation" | "clinical" | "admin" | "operations" | "reports";

export type CapabilityDefinition = {
  id: string;
  label: string;
  description?: string;
  category: CapabilityCategory;
};

/** All assignable capabilities (aligned with current app routes and admin areas). */
export const ROLE_CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  // Navigation (header)
  { id: "nav.dashboard", label: "Dashboard", category: "navigation" },
  { id: "nav.billing", label: "Billing", category: "navigation" },
  { id: "nav.scheduled_appointments", label: "Scheduled appointments", category: "navigation" },
  { id: "nav.patient_follow_up", label: "Patient follow-up", category: "navigation" },
  { id: "nav.laboratory", label: "Laboratory", category: "navigation" },
  { id: "nav.uploads", label: "Uploads", category: "navigation" },
  { id: "nav.admin", label: "Administration (app entry)", category: "admin" },

  // Clinical / chart (high-level; route guards remain on APIs)
  { id: "activity.patient_search", label: "Search & open patient chart", category: "clinical" },
  { id: "activity.schedule", label: "Schedule & appointments workspace", category: "operations" },
  { id: "activity.encounter_documentation", label: "Encounter documentation & visit summary", category: "clinical" },
  { id: "activity.admission_beds", label: "Admissions & bed assignment", category: "operations" },

  // Admin sections (Systems administrator)
  { id: "admin.organization", label: "Admin: Organization configuration", category: "admin" },
  { id: "admin.users", label: "Admin: User management", category: "admin" },
  { id: "admin.roles", label: "Admin: Role & capability management", category: "admin" },
  { id: "admin.facilities", label: "Admin: Facilities directory", category: "admin" },
  { id: "admin.beds", label: "Admin: Bed management", category: "admin" },
  { id: "admin.forms", label: "Admin: Forms & consent templates", category: "admin" },
  { id: "admin.audit", label: "Admin: Audit log", category: "admin" },
];

const DEF_BY_ID = new Map(ROLE_CAPABILITY_DEFINITIONS.map((d) => [d.id, d]));

export function getCapabilityDefinition(id: string): CapabilityDefinition | undefined {
  return DEF_BY_ID.get(id);
}

/** Merge registry defaults with DB overrides (override removes or adds capability). */
export function computeEffectiveCapabilities(
  role: string,
  overrides: { capabilityId: string; allowed: boolean }[],
): string[] {
  const base = defaultCapabilitiesForRole(role);
  for (const o of overrides) {
    if (o.allowed) base.add(o.capabilityId);
    else base.delete(o.capabilityId);
  }
  return Array.from(base).sort();
}

/** Default capabilities per role — mirrors legacy APP_NAV_ITEMS + typical access. */
export function defaultCapabilitiesForRole(role: string): Set<string> {
  const s = new Set<string>();
  const add = (id: string) => s.add(id);
  switch (role) {
    case "super_admin":
      add("nav.dashboard");
      add("nav.billing");
      add("nav.laboratory");
      add("nav.uploads");
      add("activity.patient_search");
      add("activity.schedule");
      add("activity.encounter_documentation");
      add("activity.admission_beds");
      add("admin.organization");
      add("admin.users");
      add("admin.roles");
      add("admin.facilities");
      add("admin.beds");
      add("admin.forms");
      add("admin.audit");
      break;
    case "lab_tech":
      add("nav.dashboard");
      add("nav.laboratory");
      add("nav.uploads");
      add("activity.patient_search");
      break;
    case "reception":
      add("nav.dashboard");
      add("nav.billing");
      add("nav.scheduled_appointments");
      add("nav.patient_follow_up");
      add("activity.patient_search");
      add("activity.schedule");
      break;
    case "clinician":
    case "nurse":
      add("nav.dashboard");
      add("nav.laboratory");
      add("nav.uploads");
      add("activity.patient_search");
      add("activity.schedule");
      add("activity.encounter_documentation");
      add("activity.admission_beds");
      break;
    case "security":
      // Systems administrators: admin toolbar only (no Dashboard / Billing / Laboratory / Uploads module nav).
      add("nav.admin");
      add("activity.patient_search");
      add("activity.schedule");
      add("activity.encounter_documentation");
      add("activity.admission_beds");
      add("admin.organization");
      add("admin.users");
      add("admin.roles");
      add("admin.facilities");
      add("admin.beds");
      add("admin.forms");
      add("admin.audit");
      break;
    default:
      add("activity.patient_search");
  }
  return s;
}

/** Table keys for column customization (admin UI). */
/** Maps APP_NAV_ITEMS title → capability id (for header filtering). */
export const NAV_ITEM_CAPABILITY_ID: Record<string, string> = {
  Dashboard: "nav.dashboard",
  Billing: "nav.billing",
  "Scheduled Appointment": "nav.scheduled_appointments",
  "Patient Follow up": "nav.patient_follow_up",
  Laboratory: "nav.laboratory",
  Uploads: "nav.uploads",
  /** Systems administrator — granular admin toolbar (replaces single “Admin” link). */
  "Organization configuration": "admin.organization",
  "User management": "admin.users",
  "Role management": "admin.roles",
  Administrative: "admin.facilities",
};

export const ADMIN_TABLE_COLUMN_REGISTRY: Record<
  string,
  {
    label: string;
    /** When false, hidden from Application configuration (Systems admin–only surfaces). */
    includeInApplicationConfig?: boolean;
    columns: { id: string; defaultLabel: string }[];
  }
> = {
  admin_users: {
    label: "User management table",
    includeInApplicationConfig: true,
    columns: [
      { id: "name", defaultLabel: "Name" },
      { id: "username", defaultLabel: "Username" },
      { id: "role", defaultLabel: "Role" },
      { id: "email", defaultLabel: "Email" },
      { id: "phone", defaultLabel: "Phone" },
      { id: "facility", defaultLabel: "Facility" },
      { id: "created", defaultLabel: "Created" },
    ],
  },
  patients_directory: {
    label: "Patients — search & directory",
    includeInApplicationConfig: true,
    columns: [
      { id: "mrn", defaultLabel: "MRN" },
      { id: "name", defaultLabel: "Patient name" },
      { id: "dob", defaultLabel: "Date of birth" },
      { id: "phone", defaultLabel: "Phone" },
      { id: "facility", defaultLabel: "Facility" },
    ],
  },
  schedule_appointments: {
    label: "Schedule — appointments",
    includeInApplicationConfig: true,
    columns: [
      { id: "time", defaultLabel: "Time" },
      { id: "patient", defaultLabel: "Patient" },
      { id: "reason", defaultLabel: "Reason" },
      { id: "provider", defaultLabel: "Provider" },
      { id: "status", defaultLabel: "Status" },
      { id: "meds_admin", defaultLabel: "Meds Admin" },
    ],
  },
  schedule_admitted_patients: {
    label: "Schedule — admitted patients",
    includeInApplicationConfig: true,
    columns: [
      { id: "patient", defaultLabel: "Patient" },
      { id: "mrn", defaultLabel: "MRN" },
      { id: "clinician", defaultLabel: "Clinician" },
      { id: "status", defaultLabel: "Status" },
      { id: "reason", defaultLabel: "Reason for visit" },
      { id: "bed", defaultLabel: "Bed / Room" },
      { id: "admittedAt", defaultLabel: "Admission date" },
      { id: "meds_admin", defaultLabel: "Meds Admin" },
    ],
  },
  laboratory_orders: {
    label: "Laboratory — orders list",
    includeInApplicationConfig: true,
    columns: [
      { id: "ordered", defaultLabel: "Ordered" },
      { id: "test", defaultLabel: "Test" },
      { id: "patient", defaultLabel: "Patient" },
      { id: "status", defaultLabel: "Status" },
      { id: "priority", defaultLabel: "Priority" },
    ],
  },
  billing_visits: {
    label: "Billing — today’s visits",
    includeInApplicationConfig: true,
    columns: [
      { id: "patient", defaultLabel: "Patient" },
      { id: "visit", defaultLabel: "Visit" },
      { id: "charges", defaultLabel: "Charges" },
      { id: "balance", defaultLabel: "Balance" },
      { id: "status", defaultLabel: "Status" },
    ],
  },
  audit_log: {
    label: "Administrative — audit log",
    includeInApplicationConfig: false,
    columns: [
      { id: "when", defaultLabel: "When" },
      { id: "user", defaultLabel: "User" },
      { id: "action", defaultLabel: "Action" },
      { id: "resource", defaultLabel: "Resource" },
      { id: "details", defaultLabel: "Details" },
    ],
  },
};

/** Table keys exposed in Application configuration → Tables (must match `includeInApplicationConfig`). */
export function configurableTableKeys(): string[] {
  return Object.entries(ADMIN_TABLE_COLUMN_REGISTRY)
    .filter(([, v]) => v.includeInApplicationConfig !== false)
    .map(([k]) => k);
}

/**
 * Minimum capability required to show a table’s column settings for a role.
 * If the role lacks the capability, that table is omitted from the selector.
 */
export const TABLE_KEY_MIN_CAPABILITY: Record<string, string> = {
  admin_users: "admin.users",
  patients_directory: "activity.patient_search",
  schedule_appointments: "activity.schedule",
  schedule_admitted_patients: "activity.admission_beds",
  laboratory_orders: "nav.laboratory",
  billing_visits: "nav.billing",
};

/** Which configurable tables apply for a set of effective capability ids (used by Systems admin UI). */
export function tableKeysForCapabilities(capabilityIds: string[]): string[] {
  const c = new Set(capabilityIds);
  const out: string[] = [];
  for (const key of configurableTableKeys()) {
    const req = TABLE_KEY_MIN_CAPABILITY[key];
    if (!req || c.has(req)) out.push(key);
  }
  return out;
}

export type UiTableColumnOverrideRow = {
  role: string;
  tableKey: string;
  columnId: string;
  hidden: boolean;
  label: string | null;
  sortOrder: number | null;
};

export type TableColumnLayoutRow = {
  id: string;
  defaultLabel: string;
  label: string;
  hidden: boolean;
  sortOrder: number;
  isCustom: boolean;
};

/** Full column list for admin UI (order, rename, hide, custom columns). */
export function computeTableColumnLayoutForAdmin(
  tableKey: string,
  role: string,
  overrides: UiTableColumnOverrideRow[],
): TableColumnLayoutRow[] {
  const reg = ADMIN_TABLE_COLUMN_REGISTRY[tableKey];
  if (!reg) return [];
  const forRole = overrides.filter((o) => o.tableKey === tableKey && o.role === role);
  const rows: TableColumnLayoutRow[] = [];

  reg.columns.forEach((col, index) => {
    const o = forRole.find((x) => x.columnId === col.id);
    const label =
      o?.label != null && String(o.label).trim() !== "" ? String(o.label).trim() : col.defaultLabel;
    const sortOrder = o?.sortOrder ?? index * 10;
    rows.push({
      id: col.id,
      defaultLabel: col.defaultLabel,
      label,
      hidden: o?.hidden ?? false,
      sortOrder,
      isCustom: false,
    });
  });

  for (const o of forRole) {
    if (!o.columnId.startsWith("custom_")) continue;
    const sortOrder = o.sortOrder ?? rows.length * 10 + 10;
    const disp = o.label?.trim() || "Custom column";
    rows.push({
      id: o.columnId,
      defaultLabel: disp,
      label: disp,
      hidden: o.hidden,
      sortOrder,
      isCustom: true,
    });
  }

  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows;
}

/** Resolve labels, visibility, and order for a signed-in role (registry + DB overrides). */
export function computeEffectiveTableColumns(
  tableKey: string,
  role: string,
  overrides: UiTableColumnOverrideRow[],
): { id: string; label: string; hidden: boolean }[] {
  return computeTableColumnLayoutForAdmin(tableKey, role, overrides)
    .filter((r) => !r.hidden)
    .map(({ id, label }) => ({ id, label, hidden: false }));
}
