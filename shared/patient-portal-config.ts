import { z } from "zod";

/** What patients may see in the read-only portal (organization-wide, stored on facility). */
export type PatientPortalVisibilityConfig = {
  showOverview: boolean;
  showVisits: boolean;
  showProblems: boolean;
  showMedications: boolean;
  showAllergies: boolean;
  /** Short banner on the portal record header after sign-in (optional). */
  welcomeMessage: string | null;
};

export const DEFAULT_PATIENT_PORTAL_VISIBILITY: PatientPortalVisibilityConfig = {
  showOverview: true,
  showVisits: true,
  showProblems: true,
  showMedications: true,
  showAllergies: true,
  welcomeMessage: null,
};

export const patientPortalConfigPatchSchema = z.object({
  showOverview: z.boolean().optional(),
  showVisits: z.boolean().optional(),
  showProblems: z.boolean().optional(),
  showMedications: z.boolean().optional(),
  showAllergies: z.boolean().optional(),
  welcomeMessage: z.union([z.string().max(2000), z.null()]).optional(),
});

export type PatientPortalConfigPatch = z.infer<typeof patientPortalConfigPatchSchema>;

export function mergePatientPortalConfig(raw: unknown | null | undefined): PatientPortalVisibilityConfig {
  const parsed = patientPortalConfigPatchSchema.safeParse(raw ?? {});
  const p = parsed.success ? parsed.data : {};
  return {
    showOverview: p.showOverview ?? DEFAULT_PATIENT_PORTAL_VISIBILITY.showOverview,
    showVisits: p.showVisits ?? DEFAULT_PATIENT_PORTAL_VISIBILITY.showVisits,
    showProblems: p.showProblems ?? DEFAULT_PATIENT_PORTAL_VISIBILITY.showProblems,
    showMedications: p.showMedications ?? DEFAULT_PATIENT_PORTAL_VISIBILITY.showMedications,
    showAllergies: p.showAllergies ?? DEFAULT_PATIENT_PORTAL_VISIBILITY.showAllergies,
    welcomeMessage:
      p.welcomeMessage === undefined
        ? DEFAULT_PATIENT_PORTAL_VISIBILITY.welcomeMessage
        : p.welcomeMessage === null || String(p.welcomeMessage).trim() === ""
          ? null
          : String(p.welcomeMessage).trim().slice(0, 2000),
  };
}

export function atLeastOnePortalSectionVisible(c: PatientPortalVisibilityConfig): boolean {
  return c.showOverview || c.showVisits || c.showProblems || c.showMedications || c.showAllergies;
}
