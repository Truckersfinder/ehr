/**
 * Keeps "Role-based capabilities" (role_capability_overrides) and
 * Application configuration → Activities & navigation (ui_activity_layout) aligned.
 */

import type { UiActivityContext } from "./application-ui";
import { ADMIN_ACTIVITIES_ORDER, HEADER_NAV_ACTIVITY_ORDER, toolbarSecondaryRequiredCapabilities } from "./application-ui";
import { NAV_ITEM_CAPABILITY_ID } from "./role-capabilities-registry";

const HDR_ID_TO_CAPABILITY: Record<string, string> = Object.fromEntries(
  HEADER_NAV_ACTIVITY_ORDER.filter((h) => h.titleKey in NAV_ITEM_CAPABILITY_ID).map((h) => [
    h.id,
    NAV_ITEM_CAPABILITY_ID[h.titleKey as keyof typeof NAV_ITEM_CAPABILITY_ID]!,
  ]),
);

/**
 * When the user toggles Hide in Application configuration, which capability overrides to upsert (allowed = !hidden).
 * Server applies these, then recomputes all `ui_activity_layout.hidden` values from the effective matrix.
 */
export function capabilityOverridesForActivityHidden(args: {
  context: UiActivityContext;
  activityId: string;
  role: string;
  hidden: boolean;
}): { capabilityId: string; allowed: boolean }[] {
  const allowed = !args.hidden;
  const { context, activityId, role } = args;

  if (context === "toolbar" && activityId.startsWith("hdr_")) {
    const cap = HDR_ID_TO_CAPABILITY[activityId];
    if (cap) return [{ capabilityId: cap, allowed }];
    return [];
  }
  if (context === "toolbar" && activityId.startsWith("tb_")) {
    const req = toolbarSecondaryRequiredCapabilities(activityId, role);
    if (req.length > 0) return req.map((capabilityId) => ({ capabilityId, allowed }));
    return [];
  }
  if (context === "patient_chart_visit_doc") {
    return [{ capabilityId: "activity.encounter_documentation", allowed }];
  }
  if (context === "patient_chart_review") {
    if (activityId === "pc_immunization") return [{ capabilityId: "nav.laboratory", allowed }];
    if (activityId === "pc_results") return [];
    const patientSearchTabs = new Set([
      "pc_demographics",
      "pc_patient_call",
      "pc_overview",
      "pc_history",
      "pc_forms_consent",
    ]);
    if (patientSearchTabs.has(activityId)) {
      return [{ capabilityId: "activity.patient_search", allowed }];
    }
  }
  if (context === "admin_activities") {
    const meta = ADMIN_ACTIVITIES_ORDER.find((a) => a.id === activityId);
    if (meta) return [{ capabilityId: meta.requiredCapability, allowed }];
  }
  return [];
}
