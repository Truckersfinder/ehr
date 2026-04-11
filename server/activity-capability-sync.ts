import type { IStorage } from "./storage";
import {
  ADMIN_ACTIVITIES_ORDER,
  isActivityApplicableForRole,
  PATIENT_CHART_REVIEW_ORDER,
  PATIENT_CHART_VISIT_DOC_ORDER,
  TOOLBAR_UNIFIED_ACTIVITY_ORDER,
  toolbarActivityIdsForRole,
  type UiActivityContext,
} from "@shared/application-ui";
import { capabilityOverridesForActivityHidden } from "@shared/activity-capability-sync";
import { computeEffectiveCapabilities } from "@shared/role-capabilities-registry";

/**
 * Rewrites `ui_activity_layout.hidden` for the role so it matches the effective capability matrix
 * (same rules as Role management). Preserves label, sort, and read-only flags per row.
 */
export async function fullSyncActivityLayoutsFromCapabilities(storage: IStorage, role: string): Promise<void> {
  const ov = await storage.getRoleCapabilityOverridesForRole(role);
  const caps = new Set(computeEffectiveCapabilities(role, ov));
  const existing = await storage.listUiActivityLayoutForRole(role);
  const byKey = new Map(existing.map((r) => [`${r.context}:${r.activityId}`, r]));

  const defaultSort = (context: UiActivityContext, activityId: string): number => {
    if (context === "toolbar") {
      const i = TOOLBAR_UNIFIED_ACTIVITY_ORDER.findIndex((e) => e.id === activityId);
      return (i >= 0 ? i : 0) * 10;
    }
    if (context === "patient_chart_review") {
      const i = PATIENT_CHART_REVIEW_ORDER.findIndex((e) => e.id === activityId);
      return (i >= 0 ? i : 0) * 10;
    }
    if (context === "patient_chart_visit_doc") {
      const i = PATIENT_CHART_VISIT_DOC_ORDER.findIndex((e) => e.id === activityId);
      return (i >= 0 ? i : 0) * 10;
    }
    if (context === "admin_activities") {
      const i = ADMIN_ACTIVITIES_ORDER.findIndex((e) => e.id === activityId);
      return (i >= 0 ? i : 0) * 10;
    }
    return 0;
  };

  const upsert = async (context: UiActivityContext, activityId: string) => {
    const k = `${context}:${activityId}`;
    const prev = byKey.get(k);
    if (prev?.readOnly) return;

    const applicable = isActivityApplicableForRole(role, context, activityId, caps);
    const hidden = !applicable;
    const sortOrder = prev?.sortOrder ?? defaultSort(context, activityId);
    await storage.upsertUiActivityLayout({
      role,
      context,
      activityId,
      labelOverride: prev?.labelOverride ?? null,
      sortOrder,
      hidden,
      readOnly: prev?.readOnly ?? false,
    });
  };

  for (const entry of TOOLBAR_UNIFIED_ACTIVITY_ORDER) {
    if (entry.id.startsWith("hdr_")) {
      if (role === "security") continue;
      await upsert("toolbar", entry.id);
    } else if (toolbarActivityIdsForRole(role).includes(entry.id)) {
      await upsert("toolbar", entry.id);
    }
  }

  for (const x of PATIENT_CHART_REVIEW_ORDER) {
    await upsert("patient_chart_review", x.id);
  }
  for (const x of PATIENT_CHART_VISIT_DOC_ORDER) {
    await upsert("patient_chart_visit_doc", x.id);
  }
  for (const x of ADMIN_ACTIVITIES_ORDER) {
    await upsert("admin_activities", x.id);
  }
}

export async function syncCapabilitiesFromActivityLayoutPatch(
  storage: IStorage,
  args: {
    role: string;
    context: UiActivityContext;
    activityId: string;
    hidden: boolean;
  },
): Promise<void> {
  const updates = capabilityOverridesForActivityHidden({
    context: args.context,
    activityId: args.activityId,
    role: args.role,
    hidden: args.hidden,
  });
  for (const u of updates) {
    await storage.upsertRoleCapabilityOverride(args.role, u.capabilityId, u.allowed);
  }
}
