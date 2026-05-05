import express, { type Express } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { ensureUploadsDir } from "./uploads-dir";
import { storage } from "./storage";
import { authMiddleware, comparePassword, generateToken, hashPassword, requireRole, type AuthRequest } from "./auth";
import {
  loginSchema,
  createUserBodySchema,
  resetUserPasswordBodySchema,
  createClinicalFormBodySchema,
  updateClinicalFormBodySchema,
  type ClinicalFormField,
  insertPatientSchema,
  type User,
  insertEncounterSchema,
  insertVitalsSchema,
  insertAppointmentSchema,
  createBedBodySchema,
  bedStatusReasonBodySchema,
  bedRestoreBodySchema,
  insertLabOrderSchema,
  insertImagingOrderSchema,
  insertImagingResultSchema,
  insertPatientDocumentSchema,
  insertPrescriptionSchema,
  insertMedicationAdministrationSchema,
  insertEncounterMedicationAdministrationSchema,
  insertInvoiceSchema,
  insertFollowUpContactSchema,
  patchBillingChargeCatalogBodySchema,
  createBillingChargeCatalogBodySchema,
  addManualVisitChargeBodySchema,
  clinicalFormSubmitAnswersBodySchema,
  patchOrganizationSettingsBodySchema,
  patchRoleCapabilityBodySchema,
  patchUiTableColumnBodySchema,
  postUiTableCustomColumnBodySchema,
  putUiTableColumnOrderBodySchema,
  deleteUiTableColumnQuerySchema,
  patchUiActivityLayoutBodySchema,
  createIntegrationApiKeyBodySchema,
} from "@shared/schema";
import {
  inferClinicalFormPrefill,
  validateAndNormalizeClinicalFormAnswers,
  formatPatientDateOfBirthForFormPrefill,
} from "@shared/clinical-form-fill";
import { mergeSystemFieldsIntoClinicalFormTemplate } from "@shared/clinical-form-system-fields";
import { clinicalTemplateKindFromRow, normalizeClinicalFormTemplateKind } from "@shared/clinical-form-template-kind";
import {
  validateConsentPatientSignature,
  fieldsForPublicConsentQrValidation,
  excludeLegacyPatientSignOffFieldsFromQrConsent,
  legacyPatientSignOffFieldIds,
  isLegacyPatientSignOffTemplateField,
} from "@shared/consent-patient-signature";
import {
  computeEffectiveCapabilities,
  computeEffectiveTableColumns,
  computeTableColumnLayoutForAdmin,
  ROLE_CAPABILITY_DEFINITIONS,
  ADMIN_TABLE_COLUMN_REGISTRY,
  tableKeysForCapabilities,
} from "@shared/role-capabilities-registry";
import {
  ADMIN_ACTIVITIES_ORDER,
  computeActivityUiForRole,
  normalizeUiActivityLayoutRowContext,
  TOOLBAR_UNIFIED_ACTIVITY_ORDER,
  PATIENT_CHART_REVIEW_ORDER,
  PATIENT_CHART_VISIT_DOC_ORDER,
} from "@shared/application-ui";
import {
  fullSyncActivityLayoutsFromCapabilities,
  syncCapabilitiesFromActivityLayoutPatch,
} from "./activity-capability-sync";
import { getMedsAdminCounts } from "./meds-admin-counts";
import { mergePatientPortalConfig, atLeastOnePortalSectionVisible } from "@shared/patient-portal-config";
import { registerPatientPortalRoutes } from "./patient-portal-routes";
import { registerIntegrationRoutes } from "./integration/register-integration-routes";
import { emitIntegrationWebhookEvent } from "./integration/webhook-delivery";
import { issuePortalInviteAndSendEmail } from "./patient-portal-invite";

/** Create patient: never take legacy free-text `allergies` from the request (autofill / stray JSON). Use structured patient_allergies + clinical workflow instead. */
const insertPatientCreateSchema = insertPatientSchema.omit({ allergies: true, profilePhotoUrl: true });
import { seedDatabase, ensureSecurityUser, ensureDoctorScheduleDemoAppointments } from "./seed";
import { getCountriesList } from "./countries";
import { getStatesForCountry } from "./states";
import { getEmergencyContactRelationships } from "./emergency-contact-relationships";
import { getPatientCallReasons } from "./patient-call-reasons";
import { PATIENT_RECORD_DOCUMENT_TYPES, isValidPatientRecordDocumentTypeId } from "@shared/patient-record-document-types";
import {
  getRecordDocumentTypeId,
  normalizePatientDocumentRow,
  type PatientDocumentRow,
} from "@shared/patient-document-normalize";
import { isBillingChargeCategory, parseBillingChargeXlsxBuffer } from "./billing-charge-xlsx";
import { patchFacilityBillingBodySchema } from "@shared/billing-currencies";
import {
  applyImagingOrderCharge,
  applyLabOrderCharge,
  applyPrescriptionCharge,
  applyVisitTypeCharge,
  removeImagingOrderVisitCharge,
  removeLabOrderVisitCharge,
  removePrescriptionVisitCharge,
  syncImagingOrderVisitCharge,
  syncLabOrderVisitCharge,
  syncPrescriptionVisitCharge,
  applyManualCatalogCharge,
} from "./visit-charge-service";
const MEDICATION_ROUTES = ["oral", "injection", "iv"] as const;
type MedicationRouteId = (typeof MEDICATION_ROUTES)[number];

const uploadsDir = ensureUploadsDir();

function mapAdminClinicalFormBodyFieldsToStored(
  parsedFields: z.infer<typeof createClinicalFormBodySchema>["fields"],
  kind: z.infer<typeof createClinicalFormBodySchema>["kind"],
): ClinicalFormField[] {
  const raw: ClinicalFormField[] = parsedFields.map((f) => ({
    id: f.id?.trim() || `f_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    label: f.label.trim(),
    type: f.type,
    required: f.required ?? false,
    ...(f.type === "select" && f.options?.length ? { options: f.options.map((o) => o.trim()) } : {}),
  }));
  return mergeSystemFieldsIntoClinicalFormTemplate(normalizeClinicalFormTemplateKind(kind), raw);
}

function mergeStoredClinicalFormFieldsForApi(
  fields: ClinicalFormField[] | undefined,
  kind: "form" | "consent",
): ClinicalFormField[] {
  return mergeSystemFieldsIntoClinicalFormTemplate(kind, Array.isArray(fields) ? fields : []);
}

const chargeCatalogUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || "").toLowerCase();
    const ok =
      /\.(xlsx|xls)$/i.test(name) ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel";
    cb(null, ok);
  },
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safe = (file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const profilePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext) ? ext : ".jpg";
      cb(null, `patient-profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, or WebP images are allowed"));
  },
});

async function buildAuthUserResponse(user: User) {
  const { password, ...safeUser } = user;
  const overrides = await storage.getRoleCapabilityOverridesForRole(user.role);
  const capabilities = computeEffectiveCapabilities(user.role, overrides);
  const activityLayoutRows = await storage.listUiActivityLayoutForRole(user.role);
  const activityUi = computeActivityUiForRole(user.role, capabilities, activityLayoutRows);
  let organization: {
    facilityId: string;
    name: string;
    patientIdentifierLabel: string;
    defaultCountry: string;
    billingCurrency: string;
    logoUrl: string | null;
    timeZone: string;
  } | null = null;
  if (user.facilityId) {
    const fac = await storage.getFacility(user.facilityId);
    if (fac) {
      organization = {
        facilityId: fac.id,
        name: fac.name,
        patientIdentifierLabel: fac.patientIdentifierLabel ?? "MRN",
        defaultCountry: fac.country ?? "KE",
        billingCurrency: fac.billingCurrency ?? "KES",
        logoUrl: fac.logoUrl ?? null,
        timeZone: (fac as any).timeZone ?? (fac as any).time_zone ?? "UTC",
      };
    }
  }
  return { ...safeUser, capabilities, organization, activityUi };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();
  await ensureSecurityUser();
  await ensureDoctorScheduleDemoAppointments();
  await storage.ensureCommonVisitReasonsSeeded();
  await storage.ensureBillingChargeCatalogSeeded();
  await storage.ensureLabOrderBillingChargesSyncedFromCommonList();
  await storage.ensureVisitChargeCatalogKeys();
  await storage.ensureVisitChargeLineKindManualEnum();
  await storage.ensureEncounterChargeFinalizationColumns();
  await storage.ensurePrescriptionRouteColumn();
  await storage.ensurePrescriptionRateColumn();
  await storage.ensureEncounterMedicationAdministrationsTable();
  await storage.ensureBedsAndBedAssignmentsTables();
  await storage.ensureClinicalFormsTable();
  await storage.ensureFacilityOrganizationAndRoleTables();
  await storage.ensureIntegrationTables();

  registerIntegrationRoutes(app);

  app.get("/api/meds-admin-counts", authMiddleware as any, async (req: any, res) => {
    try {
      const appointmentIds = String(req.query.appointmentIds ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const admissionIds = String(req.query.admissionIds ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const data = await getMedsAdminCounts({ appointmentIds, admissionIds });
      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Base URL for patient-facing form links (QR). Set `APP_BASE_URL` in production. */
  const patientFillAppBaseUrl = (req: any) => {
    const env = process.env.APP_BASE_URL?.replace(/\/$/, "");
    if (env) return env;
    const host = req.get("x-forwarded-host") || req.get("host");
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    return `${proto}://${host}`;
  };

  /** Published forms & consent templates for point-of-care (read-only list; any authenticated staff). */
  app.get("/api/clinical-form-templates", authMiddleware as any, async (_req: any, res: any) => {
    try {
      const rows = (await storage.getClinicalForms()).filter((r: any) => (r as any).isActive !== false);
      return res.json(
        rows.map((r) => {
          const kind = clinicalTemplateKindFromRow(r as { templateKind?: unknown; template_kind?: unknown });
          const fieldCount = mergeStoredClinicalFormFieldsForApi(
            (r as { fields?: ClinicalFormField[] }).fields,
            kind,
          ).length;
          return {
            id: r.id,
            title: r.title,
            description: r.description ?? null,
            fieldCount,
            kind,
            updatedAt: r.updatedAt ?? null,
          };
        }),
      );
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/patients/:patientId/clinical-form-completions",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const { patientId } = req.params;
        const p = await storage.getPatient(patientId);
        if (!p) return res.status(404).json({ message: "Patient not found" });
        const rows = await storage.listCompletedClinicalFormsForPatient(patientId);
        return res.json(
          rows.map((r) => ({
            ...r,
            completedAt: r.completedAt.toISOString(),
            createdAt: r.createdAt?.toISOString() ?? null,
          })),
        );
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/patients/:patientId/procedure-consents/pending-patient-signature",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const { patientId } = req.params;
        const p = await storage.getPatient(patientId);
        if (!p) return res.status(404).json({ message: "Patient not found" });
        const rows = await storage.listProcedureConsentsNeedingPatientSignature(patientId);
        return res.json(
          rows.map((r) => ({
            ...r,
            clinicianSignedAt: r.clinicianSignedAt.toISOString(),
            createdAt: r.createdAt?.toISOString() ?? null,
          })),
        );
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/patients/:patientId/procedure-consents/:completionId/qr-session",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const { patientId, completionId } = req.params;
        const p = await storage.getPatient(patientId);
        if (!p) return res.status(404).json({ message: "Patient not found" });
        const existing = await storage.getClinicalFormCompletionForPatientById(patientId, completionId);
        if (!existing) return res.status(404).json({ message: "Completion not found" });
        if (!existing.completion.providerSignedAt) {
          return res.status(400).json({ message: "Clinician signature is required before patient signature." });
        }
        if (existing.completion.completedAt) {
          return res.status(400).json({ message: "This consent is already completed." });
        }
        const created = await storage.createProcedureConsentPatientQrSession({ patientId, completionId });
        if (!created) return res.status(404).json({ message: "Could not create QR session." });
        const base = patientFillAppBaseUrl(req);
        const fillUrl = `${base}/p/clinical-form/${encodeURIComponent(created.token)}`;
        return res.json({
          token: created.token,
          fillUrl,
          expiresAt: created.expiresAt.toISOString(),
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/patients/:patientId/clinical-form-completions/:completionId",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const { patientId, completionId } = req.params;
        const patient = await storage.getPatient(patientId);
        if (!patient) return res.status(404).json({ message: "Patient not found" });
        const result = await storage.getCompletedClinicalFormCompletionForPatient(patientId, completionId);
        if (!result) return res.status(404).json({ message: "Completion not found" });
        const { completion, form } = result;
        const templateKind = (form as { templateKind?: string }).templateKind === "consent" ? "consent" : "form";
        const fields = mergeStoredClinicalFormFieldsForApi(form.fields, templateKind);
        return res.json({
          completion: {
            id: completion.id,
            completedAt: completion.completedAt!.toISOString(),
            completionMode: completion.completionMode,
            answers: completion.answers ?? {},
          },
          form: {
            id: form.id,
            title: form.title,
            description: form.description,
            fields,
            templateKind,
          },
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/patients/:patientId/clinical-forms/:formId/fill-context",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const { patientId, formId } = req.params;
        const patient = await storage.getPatient(patientId);
        if (!patient) return res.status(404).json({ message: "Patient not found" });
        const form = await storage.getClinicalFormById(formId);
        if (!form) return res.status(404).json({ message: "Form not found" });
        const templateKind = (form as { templateKind?: string }).templateKind === "consent" ? "consent" : "form";
        const fields = mergeStoredClinicalFormFieldsForApi(form.fields, templateKind);
        const dob = formatPatientDateOfBirthForFormPrefill(patient.dateOfBirth);
        const prefill = inferClinicalFormPrefill(fields, {
          patientIdentifier: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: dob,
        });
        return res.json({
          form: {
            id: form.id,
            title: form.title,
            description: form.description,
            fields,
            templateKind,
          },
          patient: {
            id: patient.id,
            patientIdentifierLabel: "MRN",
            patientIdentifier: patient.mrn,
            firstName: patient.firstName,
            lastName: patient.lastName,
            dateOfBirth: dob,
          },
          prefill,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/patients/:patientId/clinical-forms/:formId/submit",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const parsed = clinicalFormSubmitAnswersBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        }
        const { patientId, formId } = req.params;
        const patient = await storage.getPatient(patientId);
        if (!patient) return res.status(404).json({ message: "Patient not found" });
        const form = await storage.getClinicalFormById(formId);
        if (!form) return res.status(404).json({ message: "Form not found" });
        const templateKind = (form as { templateKind?: string }).templateKind === "consent" ? "consent" : "form";
        let fields = mergeStoredClinicalFormFieldsForApi(form.fields, templateKind);
        // Patient sign-off fields are only collected on the patient QR step for Procedure Consents.
        if (templateKind === "consent") {
          const role = String(req.user?.role ?? "");
          const isClinician = role === "clinician" || role === "nurse";
          fields = fields.map((f) => {
            if (f.id === "sys_provider_attestation") return { ...f, required: false };
            if (isLegacyPatientSignOffTemplateField(f)) return { ...f, required: false };
            return f;
          });
        }
        const norm = validateAndNormalizeClinicalFormAnswers(fields, parsed.data.answers);
        if (!norm.ok) return res.status(400).json({ message: norm.message });
        if (templateKind === "consent") {
          const role = String(req.user?.role ?? "");
          const isClinician = role === "clinician" || role === "nurse";
          if (isClinician) {
            const ct = String(norm.answers["sys_consent_type"] ?? "");
            if (ct === "Procedure Consent") {
              const procedureName = String(norm.answers["sys_procedure_name"] ?? "").trim();
              const performingClinician = String(norm.answers["sys_performing_clinician"] ?? "").trim();
              const risks = String(norm.answers["sys_procedure_risks_benefits"] ?? "").trim();
              if (!procedureName) return res.status(400).json({ message: "Procedure Name is required." });
              if (!performingClinician) return res.status(400).json({ message: "Performing Clinician is required." });
              if (!risks) return res.status(400).json({ message: "Procedure Risk and Benefits is required." });
            } else {
              // Administrative Consent: do not store procedure-only clinician fields.
              delete norm.answers["sys_procedure_name"];
              delete norm.answers["sys_performing_clinician"];
              delete norm.answers["sys_procedure_risks_benefits"];
            }
            // Patient sign-off is collected later; clear it if it came in.
            delete norm.answers["sys_provider_attestation"];
            delete (norm.answers as any)["sys_patient_signature"];
            const created = await storage.createClinicianSignedProcedureConsentCompletion({
              patientId,
              formId,
              answers: norm.answers,
              clinicianUserId: req.user.id,
            });
            return res.status(201).json({
              id: created.id,
              providerSignedAt: created.providerSignedAt ? created.providerSignedAt.toISOString() : undefined,
            });
          }
        }

        // Regular form/consent completion (staff-assisted).
        if (templateKind === "consent") {
          delete norm.answers["sys_procedure_name"];
          delete norm.answers["sys_performing_clinician"];
          delete norm.answers["sys_procedure_risks_benefits"];
          delete norm.answers["sys_provider_attestation"];
          delete (norm.answers as any)["sys_patient_signature"];
          // Also remove any legacy/template patient sign-off fields from being stored on staff-assisted completion.
          for (const f of fields) {
            if (isLegacyPatientSignOffTemplateField(f)) {
              delete (norm.answers as any)[f.id];
            }
          }
        }
        const created = await storage.createStaffAssistedClinicalFormCompletion({
          patientId,
          formId,
          answers: norm.answers,
          completedByUserId: req.user.id,
        });
        return res.status(201).json({
          id: created.id,
          completedAt: created.completedAt ? created.completedAt.toISOString() : undefined,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/patients/:patientId/clinical-forms/:formId/qr-session",
    authMiddleware as any,
    async (req: any, res: any) => {
      try {
        const { patientId, formId } = req.params;
        const patient = await storage.getPatient(patientId);
        if (!patient) return res.status(404).json({ message: "Patient not found" });
        const form = await storage.getClinicalFormById(formId);
        if (!form) return res.status(404).json({ message: "Form not found" });
        await storage.deletePendingQrCompletionsForPatientForm(patientId, formId);
        const { token, expiresAt } = await storage.createPendingQrFormCompletion({ patientId, formId });
        const base = patientFillAppBaseUrl(req);
        const fillUrl = `${base}/p/clinical-form/${encodeURIComponent(token)}`;
        return res.json({
          token,
          fillUrl,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get("/api/public/clinical-form-session/:token", async (req: any, res: any) => {
    try {
      const token = req.params.token as string;
      const row = await storage.getClinicalFormCompletionByQrToken(token);
      if (!row) return res.status(404).json({ message: "Invalid or expired link" });
      if (row.completedAt) return res.status(410).json({ message: "This form has already been submitted" });
      if (row.qrExpiresAt && new Date(row.qrExpiresAt).getTime() < Date.now()) {
        return res.status(410).json({ message: "This link has expired" });
      }
      const form = await storage.getClinicalFormById(row.formId);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const patient = await storage.getPatient(row.patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const templateKind = (form as { templateKind?: string }).templateKind === "consent" ? "consent" : "form";
      const fieldsMerged = mergeStoredClinicalFormFieldsForApi(form.fields, templateKind);
      const legacySignOffIds =
        templateKind === "consent" ? legacyPatientSignOffFieldIds(fieldsMerged) : [];
      const fields =
        templateKind === "consent"
          ? excludeLegacyPatientSignOffFieldsFromQrConsent(fieldsMerged)
          : fieldsMerged;
      const dob = formatPatientDateOfBirthForFormPrefill(patient.dateOfBirth);
      const prefill = inferClinicalFormPrefill(fieldsMerged, {
        patientIdentifier: patient.mrn,
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: dob,
      });
      // Carry clinician/staff-entered answers into the patient QR experience.
      // (Patient sign-off fields remain editable; client will disable the rest.)
      const carried = (row.answers ?? {}) as Record<string, string | number | boolean>;
      const mergedPrefill = { ...prefill, ...carried } as Record<string, string | number | boolean>;
      for (const id of legacySignOffIds) {
        delete mergedPrefill[id];
      }
      return res.json({
        sessionId: row.id,
        patientId: patient.id,
        form: {
          id: form.id,
          title: form.title,
          description: form.description,
          fields,
          templateKind,
        },
        patient: {
          patientIdentifierLabel: "MRN",
          patientIdentifier: patient.mrn,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: dob,
        },
        prefill: mergedPrefill,
        expiresAt: row.qrExpiresAt ? new Date(row.qrExpiresAt).toISOString() : null,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/public/clinical-form-session/:token/submit", async (req: any, res: any) => {
    try {
      const token = req.params.token as string;
      const parsed = clinicalFormSubmitAnswersBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const row = await storage.getClinicalFormCompletionByQrToken(token);
      if (!row) return res.status(404).json({ message: "Invalid or expired link" });
      if (row.completedAt) return res.status(410).json({ message: "This form has already been submitted" });
      if (row.qrExpiresAt && new Date(row.qrExpiresAt).getTime() < Date.now()) {
        return res.status(410).json({ message: "This link has expired" });
      }
      const form = await storage.getClinicalFormById(row.formId);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const templateKind = (form as { templateKind?: string }).templateKind === "consent" ? "consent" : "form";
      const fields = mergeStoredClinicalFormFieldsForApi(form.fields, templateKind);
      const validationFields: ClinicalFormField[] =
        templateKind === "consent" ? fieldsForPublicConsentQrValidation(fields) : fields;
      const norm = validateAndNormalizeClinicalFormAnswers(validationFields, parsed.data.answers);
      if (!norm.ok) return res.status(400).json({ message: norm.message });
      if (templateKind === "consent") {
        const sigOk = validateConsentPatientSignature(norm.answers as any);
        if (!sigOk.ok) return res.status(400).json({ message: sigOk.message });
        // Patient cannot change clinician-only fields.
        delete norm.answers["sys_procedure_name"];
        delete norm.answers["sys_performing_clinician"];
        delete norm.answers["sys_procedure_risks_benefits"];
      }
      const updated = await storage.completeClinicalFormPatientCompletion(row.id, {
        answers: norm.answers,
        completedByUserId: null,
      });
      if (!updated) return res.status(500).json({ message: "Could not save submission" });
      return res.json({
        id: updated.id,
        completedAt: updated.completedAt ? updated.completedAt.toISOString() : undefined,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/admin/forms",
    authMiddleware as any,
    requireRole("security", "super_admin") as any,
    async (_req: any, res: any) => {
    try {
      const rows = await storage.getClinicalForms();
      return res.json(
        rows.map((r) => ({
          ...r,
          templateKind: clinicalTemplateKindFromRow(r as { templateKind?: unknown; template_kind?: unknown }),
          fields: mergeStoredClinicalFormFieldsForApi(
            (r as { fields?: ClinicalFormField[] }).fields,
            clinicalTemplateKindFromRow(r as { templateKind?: unknown; template_kind?: unknown }),
          ),
        })),
      );
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/admin/forms",
    authMiddleware as any,
    requireRole("security", "super_admin") as any,
    async (req: any, res: any) => {
    try {
      const parsed = createClinicalFormBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid form definition", errors: parsed.error.flatten() });
      }
      const fields = mapAdminClinicalFormBodyFieldsToStored(parsed.data.fields, parsed.data.kind);
      const created = await storage.createClinicalForm({
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || null,
        fields,
        templateKind: normalizeClinicalFormTemplateKind(parsed.data.kind),
        createdByUserId: req.user.id,
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "CREATE_CLINICAL_FORM",
        resource: "clinical_form",
        resourceId: created.id,
        details: `Created ${parsed.data.kind} template "${created.title}" (${fields.length} field(s))`,
      });
      return res.status(201).json({
        ...created,
        templateKind: clinicalTemplateKindFromRow(created as { templateKind?: unknown; template_kind?: unknown }),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/forms/:id", authMiddleware as any, requireRole("security") as any, async (req: any, res: any) => {
    try {
      const form = await storage.getClinicalFormById(String(req.params.id || ""));
      if (!form) return res.status(404).json({ message: "Not found" });
      return res.json({
        ...form,
        templateKind: clinicalTemplateKindFromRow(form as { templateKind?: unknown; template_kind?: unknown }),
        fields: mergeStoredClinicalFormFieldsForApi(
          form.fields,
          clinicalTemplateKindFromRow(form as { templateKind?: unknown; template_kind?: unknown }),
        ),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/admin/forms/:id",
    authMiddleware as any,
    requireRole("security") as any,
    async (req: any, res: any) => {
      try {
        const id = String(req.params.id || "");
        const existing = await storage.getClinicalFormById(id);
        if (!existing) return res.status(404).json({ message: "Not found" });
        const parsed = updateClinicalFormBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid form definition", errors: parsed.error.flatten() });
        }
        const fields = mapAdminClinicalFormBodyFieldsToStored(parsed.data.fields, parsed.data.kind);
        const updated = await storage.updateClinicalForm(id, {
          title: parsed.data.title.trim(),
          description: parsed.data.description?.trim() || null,
          fields,
          templateKind: normalizeClinicalFormTemplateKind(parsed.data.kind),
        });
        if (!updated) return res.status(404).json({ message: "Not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "UPDATE_CLINICAL_FORM",
          resource: "clinical_form",
          resourceId: updated.id,
          details: `Updated ${parsed.data.kind} template "${updated.title}" (${fields.length} field(s))`,
        });
        return res.json({
          ...updated,
          templateKind: clinicalTemplateKindFromRow(updated as { templateKind?: unknown; template_kind?: unknown }),
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  const setClinicalFormStatusBodySchema = z.object({ isActive: z.boolean() });

  app.patch(
    "/api/admin/forms/:id/status",
    authMiddleware as any,
    requireRole("security", "super_admin") as any,
    async (req: any, res: any) => {
      try {
        const id = String(req.params.id || "");
        const existing = await storage.getClinicalFormById(id);
        if (!existing) return res.status(404).json({ message: "Not found" });
        const parsed = setClinicalFormStatusBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        }
        const updated = await storage.setClinicalFormActive(id, parsed.data.isActive);
        if (!updated) return res.status(404).json({ message: "Not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: parsed.data.isActive ? "ACTIVATE_CLINICAL_FORM" : "DEACTIVATE_CLINICAL_FORM",
          resource: "clinical_form",
          resourceId: updated.id,
          details: `${parsed.data.isActive ? "Activated" : "Deactivated"} template "${updated.title}"`,
        });
        return res.json({
          ...updated,
          templateKind: clinicalTemplateKindFromRow(updated as { templateKind?: unknown; template_kind?: unknown }),
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post("/api/upload", authMiddleware as any, upload.single("file"), (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const url = `/uploads/${req.file.filename}`;
      return res.json({ url });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/ai/suggest-note", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res: any) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "AI suggestions are not configured. Set OPENAI_API_KEY to enable." });
      }
      const { text = "", noteKind = "Progress Note" } = req.body || {};
      const prompt = `You are a clinical documentation assistant. Improve and expand the following ${noteKind} note into clear, professional clinical language. Keep the same meaning and add relevant structure (e.g. headings, bullet points) where appropriate. Output only the improved note text, no preamble.\n\nCurrent note:\n${String(text).slice(0, 4000)}`;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ message: err || "AI request failed" });
      }
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const suggested = data?.choices?.[0]?.message?.content?.trim() ?? "";
      return res.json({ suggested });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message ?? "AI suggestion failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid credentials format" });
      }
      const user = await storage.getUserByUsername(parsed.data.username);
      if (!user || !comparePassword(parsed.data.password, user.password)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Account is deactivated" });
      }
      const token = generateToken({ id: user.id, username: user.username, role: user.role, fullName: user.fullName });
      await storage.createAuditLog({ userId: user.id, action: "LOGIN", resource: "auth", details: "User logged in" });
      const me = await buildAuthUserResponse(user);
      return res.json({ token, user: me });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auth/me", authMiddleware as any, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json(await buildAuthUserResponse(user));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/dashboard/stats", authMiddleware as any, async (_req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      return res.json(stats);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Open encounters older than the selected window (Dashboard: overdue open visits). */
  app.get("/api/dashboard/overdue-visits", authMiddleware as any, async (req, res) => {
    try {
      const start = typeof req.query.start === "string" ? req.query.start.trim() : "";
      const end = typeof req.query.end === "string" ? req.query.end.trim() : "";
      if (!start || !end) return res.status(400).json({ message: "start and end are required" });
      const list = await storage.getOpenEncountersForRange(start, end);
      const out: {
        encounter: any;
        patientName: string;
        clinicianName: string;
        appointmentDate: string | null;
      }[] = [];
      for (const enc of list) {
        const patient = await storage.getPatient(enc.patientId);
        const clinician = await storage.getUser(enc.clinicianId);
        const appt = enc.appointmentId ? await storage.getAppointment(enc.appointmentId) : undefined;
        out.push({
          encounter: enc,
          patientName: patient ? `${patient.firstName} ${patient.lastName}`.trim() : enc.patientId,
          clinicianName: clinician?.fullName?.trim?.() ? clinician.fullName : enc.clinicianId,
          appointmentDate: (appt?.scheduledDate ?? enc.visitDate ?? null) ? String(appt?.scheduledDate ?? enc.visitDate) : null,
        });
      }
      return res.json(out);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/billing/revenue-stats",
    authMiddleware as any,
    requireRole("super_admin") as any,
    async (req: any, res) => {
      try {
        const start = typeof req.query.start === "string" ? req.query.start.trim() : "";
        const end = typeof req.query.end === "string" ? req.query.end.trim() : "";
        if (!start || !end) return res.status(400).json({ message: "start and end are required" });
        const user = await storage.getUser(req.user.id);
        const facilityId = user?.facilityId ?? null;
        const stats = await storage.getBillingRevenueStatsForRange(start, end, facilityId);
        return res.json(stats);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get("/api/users", authMiddleware as any, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      const safeUsers = users.map(({ password, ...u }) => u);
      return res.json(safeUsers);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Clinician list for procedural consent dropdowns. */
  app.get("/api/clinicians", authMiddleware as any, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      const clinicians = users
        .filter((u: any) => String(u.role) === "clinician" && (u as any).isActive !== false)
        .map((u: any) => ({ id: u.id, fullName: u.fullName ?? u.username ?? u.id }));
      return res.json(clinicians);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/users",
    authMiddleware as any,
    requireRole("security") as any,
    async (req: any, res) => {
    try {
      const parsed = createUserBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid user data", errors: parsed.error.flatten() });
      }
      const body = parsed.data;
      const username = body.username.trim();
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username already taken" });
      }
      if (body.facilityId) {
        const fac = await storage.getFacility(body.facilityId);
        if (!fac) return res.status(400).json({ message: "Facility not found" });
      }
      const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`.trim();
      const created = await storage.createUser({
        username,
        password: hashPassword(body.password),
        fullName,
        role: body.role,
        email: body.email ?? null,
        phone: body.phone ?? null,
        facilityId: body.facilityId ?? null,
        isActive: body.isActive ?? true,
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "CREATE_USER",
        resource: "user",
        resourceId: created.id,
        details: `Created user ${username} (${body.role})`,
      });
      const { password: _pw, ...safe } = created;
      return res.status(201).json(safe);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/users/:id/password",
    authMiddleware as any,
    requireRole("security") as any,
    async (req: any, res) => {
      try {
        const parsed = resetUserPasswordBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid password", errors: parsed.error.flatten() });
        }
        const target = await storage.getUser(req.params.id);
        if (!target) {
          return res.status(404).json({ message: "User not found" });
        }
        await storage.updateUserPassword(req.params.id, hashPassword(parsed.data.password));
        await storage.createAuditLog({
          userId: req.user.id,
          action: "RESET_USER_PASSWORD",
          resource: "user",
          resourceId: req.params.id,
          details: `Password reset for @${target.username}`,
        });
        return res.json({ ok: true });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.get("/api/facilities", authMiddleware as any, async (_req, res) => {
    try {
      const facs = await storage.getFacilities();
      return res.json(facs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/facility/organization-settings", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.facilityId) return res.status(400).json({ message: "Your account is not linked to a facility" });
      const fac = await storage.getFacility(user.facilityId);
      if (!fac) return res.status(404).json({ message: "Facility not found" });
      const patientPortalConfig = mergePatientPortalConfig((fac as { patientPortalConfig?: unknown }).patientPortalConfig);
      return res.json({
        id: fac.id,
        name: fac.name,
        code: fac.code,
        billingCurrency: fac.billingCurrency,
        patientIdentifierLabel: fac.patientIdentifierLabel ?? "MRN",
        country: fac.country ?? "KE",
        timeZone: (fac as any).timeZone ?? (fac as any).time_zone ?? "UTC",
        logoUrl: fac.logoUrl ?? null,
        address: fac.address ?? null,
        phone: fac.phone ?? null,
        email: fac.email ?? null,
        patientPortalConfig,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/facility/organization-settings",
    authMiddleware as any,
    requireRole("security") as any,
    async (req: any, res) => {
      try {
        const parsed = patchOrganizationSettingsBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        }
        const user = await storage.getUser(req.user.id);
        if (!user?.facilityId) return res.status(400).json({ message: "Your account is not linked to a facility" });
        const body = parsed.data;
        const update: Record<string, unknown> = {};
        if (body.name !== undefined) update.name = body.name;
        if (body.billingCurrency !== undefined) update.billingCurrency = body.billingCurrency;
        if (body.patientIdentifierLabel !== undefined) update.patientIdentifierLabel = body.patientIdentifierLabel;
        if (body.country !== undefined) update.country = body.country;
        if (body.timeZone !== undefined) update.timeZone = body.timeZone;
        if (body.logoUrl !== undefined) update.logoUrl = body.logoUrl === "" || body.logoUrl === null ? null : body.logoUrl;
        if (body.patientPortalConfig !== undefined) {
          const facCurrent = await storage.getFacility(user.facilityId!);
          const merged = mergePatientPortalConfig({
            ...mergePatientPortalConfig(facCurrent?.patientPortalConfig),
            ...body.patientPortalConfig,
          });
          if (!atLeastOnePortalSectionVisible(merged)) {
            return res.status(400).json({ message: "At least one patient portal section must remain visible" });
          }
          update.patientPortalConfig = merged as unknown as Record<string, unknown>;
        }
        const updated = await storage.updateFacility(user.facilityId, update as any);
        if (!updated) return res.status(404).json({ message: "Facility not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "UPDATE_ORGANIZATION_SETTINGS",
          resource: "facility",
          resourceId: user.facilityId,
          details: JSON.stringify(update),
        });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/facility/organization-logo",
    authMiddleware as any,
    requireRole("security") as any,
    upload.single("logo"),
    async (req: any, res) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user?.facilityId) return res.status(400).json({ message: "Your account is not linked to a facility" });
        const file = req.file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "No file uploaded" });
        const logoUrl = `/uploads/${file.filename}`;
        await storage.updateFacility(user.facilityId, { logoUrl } as any);
        await storage.createAuditLog({
          userId: req.user.id,
          action: "UPDATE_ORGANIZATION_LOGO",
          resource: "facility",
          resourceId: user.facilityId,
          details: logoUrl,
        });
        return res.json({ logoUrl });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get("/api/admin/role-capabilities", authMiddleware as any, requireRole("security") as any, async (_req: any, res) => {
    try {
      const roles = [
        "super_admin",
        "clinician",
        "nurse",
        "lab_tech",
        "reception",
        "security",
      ] as const;
      const matrix: Record<string, Record<string, boolean>> = {};
      for (const role of roles) {
        const ov = await storage.getRoleCapabilityOverridesForRole(role);
        const caps = new Set(computeEffectiveCapabilities(role, ov));
        matrix[role] = {};
        for (const def of ROLE_CAPABILITY_DEFINITIONS) {
          matrix[role][def.id] = caps.has(def.id);
        }
      }
      return res.json({ definitions: ROLE_CAPABILITY_DEFINITIONS, roles: [...roles], matrix });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/role-capabilities", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const parsed = patchRoleCapabilityBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      await storage.upsertRoleCapabilityOverride(parsed.data.role, parsed.data.capabilityId, parsed.data.allowed);
      await fullSyncActivityLayoutsFromCapabilities(storage, parsed.data.role);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "UPDATE_ROLE_CAPABILITY",
        resource: "role_capability",
        resourceId: `${parsed.data.role}:${parsed.data.capabilityId}`,
        details: String(parsed.data.allowed),
      });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/systems-dashboard", authMiddleware as any, requireRole("security") as any, async (_req: any, res) => {
    try {
      const snapshot = await storage.getSystemsDashboardSnapshot();
      return res.json(snapshot);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/application-config", authMiddleware as any, requireRole("security") as any, async (_req: any, res) => {
    try {
      const layoutRows = await storage.listUiActivityLayout();
      const tableKeys = Object.entries(ADMIN_TABLE_COLUMN_REGISTRY)
        .filter(([, v]) => v.includeInApplicationConfig !== false)
        .map(([k]) => k);
      const rolesForTableMatrix = [
        "super_admin",
        "clinician",
        "nurse",
        "lab_tech",
        "reception",
        "security",
      ] as const;
      const tableKeysByRole: Record<string, string[]> = {};
      const capabilitiesByRole: Record<string, string[]> = {};
      for (const role of rolesForTableMatrix) {
        const ov = await storage.getRoleCapabilityOverridesForRole(role);
        const caps = computeEffectiveCapabilities(role, ov);
        tableKeysByRole[role] = tableKeysForCapabilities(caps);
        capabilitiesByRole[role] = caps;
      }
      return res.json({
        layoutRows,
        tableKeys,
        tableKeysByRole,
        capabilitiesByRole,
        activityCatalog: {
          toolbar: TOOLBAR_UNIFIED_ACTIVITY_ORDER,
          patient_chart_review: PATIENT_CHART_REVIEW_ORDER,
          patient_chart_visit_doc: PATIENT_CHART_VISIT_DOC_ORDER,
          admin_activities: ADMIN_ACTIVITIES_ORDER,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/ui-activity-layout", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const parsed = patchUiActivityLayoutBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const d = parsed.data;
      await storage.upsertUiActivityLayout({
        role: d.role,
        context: d.context,
        activityId: d.activityId,
        labelOverride: d.labelOverride === "" ? null : d.labelOverride,
        sortOrder: d.sortOrder,
        hidden: d.hidden,
        readOnly: d.readOnly,
      });
      const actCtx = normalizeUiActivityLayoutRowContext(d.context);
      await syncCapabilitiesFromActivityLayoutPatch(storage, {
        role: d.role,
        context: actCtx,
        activityId: d.activityId,
        hidden: d.hidden,
      });
      await fullSyncActivityLayoutsFromCapabilities(storage, d.role);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "UPDATE_UI_ACTIVITY_LAYOUT",
        resource: "ui_activity_layout",
        resourceId: `${d.role}:${d.context}:${d.activityId}`,
        details: JSON.stringify({
          hidden: d.hidden,
          sortOrder: d.sortOrder,
          label: d.labelOverride,
          readOnly: d.readOnly,
        }),
      });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/admin/ui-table-columns", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const tableKey = typeof req.query.tableKey === "string" ? req.query.tableKey : "admin_users";
      const role = typeof req.query.role === "string" ? req.query.role : "super_admin";
      const reg = ADMIN_TABLE_COLUMN_REGISTRY[tableKey];
      if (!reg) return res.status(404).json({ message: "Unknown table key" });
      const all = await storage.listUiTableColumnOverrides();
      const overrides = all.filter((r) => r.tableKey === tableKey);
      const layout = computeTableColumnLayoutForAdmin(tableKey, role, all);
      return res.json({ tableKey, role, registry: reg, overrides, layout });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Column layout for the signed-in user's role (hide/rename from Systems Admin). */
  app.get("/api/ui-table-columns/effective", authMiddleware as any, async (req: any, res) => {
    try {
      const tableKey = typeof req.query.tableKey === "string" ? req.query.tableKey : "admin_users";
      const reg = ADMIN_TABLE_COLUMN_REGISTRY[tableKey];
      if (!reg) return res.status(404).json({ message: "Unknown table key" });
      const all = await storage.listUiTableColumnOverrides();
      const role = req.user.role as string;
      const cols = computeEffectiveTableColumns(tableKey, role, all);
      return res.json({
        tableKey,
        role,
        columns: cols.filter((c) => !c.hidden).map(({ id, label }) => ({ id, label })),
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/admin/ui-table-columns", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const parsed = patchUiTableColumnBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      await storage.upsertUiTableColumnOverride(parsed.data);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "UPDATE_UI_TABLE_COLUMN",
        resource: "ui_table_column",
        resourceId: `${parsed.data.role}:${parsed.data.tableKey}:${parsed.data.columnId}`,
        details: JSON.stringify({ hidden: parsed.data.hidden, label: parsed.data.label, sortOrder: parsed.data.sortOrder }),
      });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/admin/ui-table-columns/custom", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const parsed = postUiTableCustomColumnBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const { role, tableKey, label } = parsed.data;
      const reg = ADMIN_TABLE_COLUMN_REGISTRY[tableKey];
      if (!reg || reg.includeInApplicationConfig === false) {
        return res.status(400).json({ message: "Invalid table key" });
      }
      const all = await storage.listUiTableColumnOverrides();
      const layout = computeTableColumnLayoutForAdmin(tableKey, role, all);
      const maxSort = layout.reduce((m, r) => Math.max(m, r.sortOrder), -1);
      const columnId = `custom_${randomUUID().replace(/-/g, "")}`;
      await storage.upsertUiTableColumnOverride({
        role,
        tableKey,
        columnId,
        hidden: false,
        label: label.trim(),
        sortOrder: maxSort + 10,
      });
      await storage.createAuditLog({
        userId: req.user.id,
        action: "CREATE_UI_TABLE_CUSTOM_COLUMN",
        resource: "ui_table_column",
        resourceId: `${role}:${tableKey}:${columnId}`,
        details: JSON.stringify({ label }),
      });
      return res.json({ ok: true, columnId });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.put("/api/admin/ui-table-columns/order", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const parsed = putUiTableColumnOrderBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const { role, tableKey, orderedColumnIds } = parsed.data;
      const reg = ADMIN_TABLE_COLUMN_REGISTRY[tableKey];
      if (!reg || reg.includeInApplicationConfig === false) {
        return res.status(400).json({ message: "Invalid table key" });
      }
      const all = await storage.listUiTableColumnOverrides();
      const layout = computeTableColumnLayoutForAdmin(tableKey, role, all);
      const allowed = new Set(layout.map((c) => c.id));
      if (orderedColumnIds.length !== allowed.size) {
        return res.status(400).json({ message: "Column order must include every column exactly once" });
      }
      for (const id of orderedColumnIds) {
        if (!allowed.has(id)) return res.status(400).json({ message: `Unknown column id: ${id}` });
      }
      await storage.setUiTableColumnOrder(role, tableKey, orderedColumnIds);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "REORDER_UI_TABLE_COLUMNS",
        resource: "ui_table_column",
        resourceId: `${role}:${tableKey}`,
        details: JSON.stringify({ orderedColumnIds }),
      });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/admin/ui-table-columns", authMiddleware as any, requireRole("security") as any, async (req: any, res) => {
    try {
      const parsed = deleteUiTableColumnQuerySchema.safeParse({
        role: req.query.role,
        tableKey: req.query.tableKey,
        columnId: req.query.columnId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
      }
      const { role, tableKey, columnId } = parsed.data;
      if (!columnId.startsWith("custom_")) {
        return res.status(400).json({ message: "Only custom columns can be removed" });
      }
      await storage.deleteUiTableColumnOverride(role, tableKey, columnId);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "DELETE_UI_TABLE_CUSTOM_COLUMN",
        resource: "ui_table_column",
        resourceId: `${role}:${tableKey}:${columnId}`,
        details: "{}",
      });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** ISO 3166-1 alpha-2 list + English names (for country pickers across the app). */
  app.get("/api/countries", async (_req, res) => {
    try {
      return res.json(getCountriesList());
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** First-level administrative subdivisions (states/provinces) for an African country code. */
  app.get("/api/countries/:code/states", async (req, res) => {
    try {
      const states = getStatesForCountry(req.params.code);
      return res.json(states);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Select options for emergency contact relationship fields. */
  app.get("/api/emergency-contact-relationships", async (_req, res) => {
    try {
      return res.json(getEmergencyContactRelationships());
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Select options for patient-call reason field. */
  app.get("/api/patient-call-reasons", async (_req, res) => {
    try {
      return res.json(getPatientCallReasons());
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Medical record document categories for general patient uploads (Upload document flow). */
  app.get("/api/patient-record-document-types", async (_req, res) => {
    try {
      return res.json(PATIENT_RECORD_DOCUMENT_TYPES);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients", authMiddleware as any, async (req, res) => {
    try {
      const search = req.query.search as string;
      if (search) {
        const results = await storage.searchPatients(search);
        return res.json(results);
      }
      const pts = await storage.getPatients();
      return res.json(pts);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id", authMiddleware as any, async (req, res) => {
    try {
      const patient = await storage.getPatient(req.params.id);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      return res.json(patient);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patients", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertPatientCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid patient data", errors: parsed.error.flatten() });
      const patient = await storage.createPatient({ ...parsed.data, allergies: null, profilePhotoUrl: null });
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_PATIENT", resource: "patient", resourceId: patient.id, details: `Created patient ${patient.firstName} ${patient.lastName}` });
      void emitIntegrationWebhookEvent({
        type: "patient.created",
        facilityId: patient.facilityId,
        source: "app",
        data: { patient },
      });
      if (patient.portalEnabled) {
        const to = (patient.portalAccessEmail || patient.email || "").trim();
        if (to) {
          issuePortalInviteAndSendEmail(patient.id, { regenerateToken: true }).catch((e) =>
            console.error("[patient portal] invite email after registration failed:", e),
          );
        }
      }
      return res.status(201).json(patient);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/patients/:id",
    authMiddleware as any,
    requireRole("super_admin", "security", "clinician", "nurse", "lab_tech", "reception") as any,
    async (req: any, res) => {
      try {
        const updated = await storage.updatePatient(req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: "Patient not found" });
        await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_PATIENT", resource: "patient", resourceId: req.params.id });
        void emitIntegrationWebhookEvent({
          type: "patient.updated",
          facilityId: updated.facilityId,
          source: "app",
          data: { patient: updated },
        });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/patients/:patientId/profile-photo",
    authMiddleware as any,
    requireRole("super_admin", "security", "clinician", "nurse", "lab_tech", "reception") as any,
    (req: any, res: any, next: any) => {
      profilePhotoUpload.single("photo")(req, res, (err: unknown) => {
        if (err) {
          const message = err instanceof Error ? err.message : "Invalid upload";
          return res.status(400).json({ message });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No image uploaded" });
        const patientId = req.params.patientId;
        const patient = await storage.getPatient(patientId);
        if (!patient) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
          return res.status(404).json({ message: "Patient not found" });
        }
        const url = `/uploads/${req.file.filename}`;
        if (patient.profilePhotoUrl?.startsWith("/uploads/")) {
          const oldName = path.basename(patient.profilePhotoUrl);
          const oldPath = path.join(uploadsDir, oldName);
          if (oldPath.startsWith(uploadsDir) && fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              /* ignore */
            }
          }
        }
        const updated = await storage.updatePatient(patientId, { profilePhotoUrl: url });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "UPDATE_PATIENT_PROFILE_PHOTO",
          resource: "patient",
          resourceId: patientId,
        });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get("/api/patients/:id/problems", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getPatientProblems(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patients/:id/problems", authMiddleware as any, requireRole("nurse", "clinician") as any, (req: any, res, next) => {
    const run = async () => {
      const patientId = req.params.id;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const problem = body.problem;
      const status = body.status;
      const problemStartDate = body.problemStartDate;
      const symptoms = body.symptoms;
      const resolution = body.resolution;
      if (!problem || typeof problem !== "string" || !String(problem).trim()) {
        res.status(400).json({ message: "Problem description is required" });
        return;
      }
      const problemStatus = (status === "past" ? "past" : "active") as "active" | "past";
      const payload: Record<string, unknown> = {
        patientId,
        problem: String(problem).trim(),
        addedBy: req.user.id,
        status: problemStatus,
      };
      if (problemStartDate && typeof problemStartDate === "string" && problemStartDate.trim()) payload.problemStartDate = problemStartDate.trim();
      if (symptoms !== undefined) payload.symptoms = typeof symptoms === "string" ? (symptoms.trim() || null) : null;
      if (resolution && typeof resolution === "string" && ["current", "resolved"].includes(resolution)) payload.resolution = resolution;
      const created = await storage.createPatientProblem(payload as any);
      if (!created) {
        res.status(500).json({ message: "Failed to create problem" });
        return;
      }
      await storage.createAuditLog({ userId: req.user.id, action: "ADD_PATIENT_PROBLEM", resource: "patient_problem", resourceId: created.id });
      res.status(201).json({
        id: created.id,
        patientId: created.patientId,
        problem: created.problem,
        addedBy: created.addedBy,
        status: created.status,
        problemStartDate: (created as any).problemStartDate ?? null,
        symptoms: (created as any).symptoms ?? null,
        resolution: (created as any).resolution ?? null,
        createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
      });
    };
    run().catch((err) => {
      if (!res.headersSent) res.status(500).json({ message: err?.message ?? "Failed to add problem" });
      next(err);
    });
  });

  app.patch("/api/patients/:id/problems/:problemId", authMiddleware as any, requireRole("nurse", "clinician") as any, (req: any, res, next) => {
    const run = async () => {
      const patientId = req.params.id;
      const problemId = req.params.problemId;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const updates: Record<string, unknown> = {};
      if (body.problem != null && typeof body.problem === "string" && body.problem.trim()) updates.problem = body.problem.trim();
      if (body.status != null && (body.status === "past" || body.status === "active")) updates.status = body.status;
      if (body.problemStartDate !== undefined) updates.problemStartDate = body.problemStartDate && String(body.problemStartDate).trim() ? String(body.problemStartDate).trim() : null;
      if (body.symptoms !== undefined) updates.symptoms = typeof body.symptoms === "string" ? (body.symptoms.trim() || null) : null;
      if (body.resolution !== undefined) updates.resolution = body.resolution && ["current", "resolved"].includes(body.resolution) ? body.resolution : null;
      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No valid fields to update" });
        return;
      }
      const existing = await storage.getPatientProblems(patientId).then((list) => list.find((p) => p.id === problemId));
      if (!existing) {
        res.status(404).json({ message: "Problem not found" });
        return;
      }
      const updated = await storage.updatePatientProblem(problemId, updates as any);
      if (!updated) {
        res.status(500).json({ message: "Failed to update problem" });
        return;
      }
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_PATIENT_PROBLEM", resource: "patient_problem", resourceId: problemId });
      res.json({
        id: updated.id,
        patientId: updated.patientId,
        problem: updated.problem,
        addedBy: updated.addedBy,
        status: updated.status,
        problemStartDate: (updated as any).problemStartDate ?? null,
        symptoms: (updated as any).symptoms ?? null,
        resolution: (updated as any).resolution ?? null,
        createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : null,
      });
    };
    run().catch((err) => {
      if (!res.headersSent) res.status(500).json({ message: err?.message ?? "Failed to update problem" });
      next(err);
    });
  });

  // Allergen suggestions for autocomplete (RxNorm for drugs + common non-drug allergens)
  const COMMON_ALLERGENS = [
    "Peanuts", "Tree nuts", "Shellfish", "Fish", "Eggs", "Milk", "Soy", "Wheat", "Sesame",
    "Latex", "Pollen", "Dust mites", "Pet dander", "Mold", "Insect sting", "Penicillin",
    "Sulfa drugs", "Aspirin", "NSAIDs", "Iodine", "Local anesthetics", "IV contrast",
  ];
  app.get("/api/allergies/suggest", authMiddleware as any, async (req: any, res) => {
    try {
      const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
      const suggestions: string[] = [];
      const qLower = q.toLowerCase();
      if (q.length >= 2) {
        const fromCommon = COMMON_ALLERGENS.filter((a) => a.toLowerCase().includes(qLower));
        suggestions.push(...fromCommon);
        try {
          const rxRes = await fetch(
            `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=15`
          );
          if (rxRes.ok) {
            const data = (await rxRes.json()) as { approximateGroup?: { candidate?: { name?: string }[] } };
            const names = (data?.approximateGroup?.candidate ?? [])
              .map((c) => c?.name?.trim())
              .filter((n): n is string => !!n && n.length > 0);
            const seen = new Set(suggestions.map((s) => s.toLowerCase()));
            for (const name of names) {
              if (!seen.has(name.toLowerCase())) {
                seen.add(name.toLowerCase());
                suggestions.push(name);
              }
            }
          }
        } catch {
          // ignore RxNorm errors; common list still returned
        }
      }
      return res.json({ suggestions: suggestions.slice(0, 25) });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/allergies", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getPatientAllergies(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patients/:id/allergies", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      const patientId = req.params.id;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const allergen = body.allergen && typeof body.allergen === "string" ? String(body.allergen).trim() : "";
      const severity = body.severity && ["LOW", "MEDIUM", "HIGH"].includes(String(body.severity)) ? String(body.severity) : "LOW";
      const reactionType = body.reactionType && typeof body.reactionType === "string" ? String(body.reactionType).trim() || null : null;
      if (!allergen) return res.status(400).json({ message: "Allergen is required" });
      const created = await storage.createPatientAllergy({ patientId, allergen, severity: severity as "LOW" | "MEDIUM" | "HIGH", reactionType, addedBy: req.user.id });
      await storage.createAuditLog({ userId: req.user.id, action: "ADD_PATIENT_ALLERGY", resource: "patient_allergy", resourceId: created.id });
      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/patients/:id/allergies/:allergyId", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      const allergies = await storage.getPatientAllergies(req.params.id);
      if (!allergies.some((a) => a.id === req.params.allergyId)) return res.status(404).json({ message: "Allergy not found" });
      await storage.deletePatientAllergy(req.params.allergyId);
      await storage.createAuditLog({ userId: req.user.id, action: "DELETE_PATIENT_ALLERGY", resource: "patient_allergy", resourceId: req.params.allergyId });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/notes", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getPatientNotes(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patients/:id/notes", authMiddleware as any, requireRole("nurse", "clinician") as any, (req: any, res, next) => {
    const run = async () => {
      const patientId = req.params.id;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const content = body.content;
      const saveAsIncomplete = body.saveAsIncomplete === true;
      const trimmed = typeof content === "string" ? String(content).trim() : "";
      if (!saveAsIncomplete && (!content || !trimmed)) {
        res.status(400).json({ message: "Note content is required" });
        return;
      }
      const authorRole = (req.user.role && String(req.user.role).toLowerCase() === "nurse") ? "nursing" : "clinician";
      const noteKind = body.noteKind && typeof body.noteKind === "string" ? String(body.noteKind).trim() : "Progress Note";
      let encounterIdNote: string | undefined;
      if (body.encounterId && typeof body.encounterId === "string") {
        const enc = await storage.getEncounter(body.encounterId);
        if (!enc || enc.patientId !== patientId) {
          res.status(400).json({ message: "Invalid encounter for this patient" });
          return;
        }
        encounterIdNote = enc.id;
      }
      const created = await storage.createPatientNote({
        patientId,
        authorId: req.user.id,
        authorRole: authorRole as "nursing" | "clinician",
        noteKind: noteKind || "Progress Note",
        content: saveAsIncomplete ? (trimmed || "(Draft)") : trimmed,
        ...(saveAsIncomplete ? { status: "incomplete" as const } : {}),
        ...(encounterIdNote ? { encounterId: encounterIdNote } : {}),
      } as any);
      await storage.createAuditLog({ userId: req.user.id, action: "ADD_PATIENT_NOTE", resource: "patient_note", resourceId: created.id });
      void emitIntegrationWebhookEvent({
        type: "clinical_note.created",
        facilityId: null,
        source: "app",
        data: { note: created },
      });
      res.status(201).json(created);
    };
    run().catch((err) => {
      if (!res.headersSent) res.status(500).json({ message: err?.message ?? "Failed to add note" });
      next(err);
    });
  });

  app.patch("/api/patients/:id/notes/:noteId", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      const patientId = req.params.id;
      const noteId = req.params.noteId;
      const notes = await storage.getPatientNotes(patientId);
      const note = notes.find((n) => n.id === noteId);
      if (!note) return res.status(404).json({ message: "Note not found" });
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const content = body.content;
      const saveAsIncomplete = body.saveAsIncomplete === true;
      const signAndSave = body.signAndSave === true;
      if (content !== undefined && (typeof content !== "string" || !String(content).trim())) {
        return res.status(400).json({ message: "Note content cannot be empty" });
      }
      const updates: { content?: string; status: string; signedAt?: Date | null; encounterId?: string } = {
        status: signAndSave ? "signed" : saveAsIncomplete ? "incomplete" : "edited",
      };
      if (signAndSave) updates.signedAt = new Date();
      if (content !== undefined) updates.content = String(content).trim();
      if (signAndSave && !note.encounterId && body.encounterId && typeof body.encounterId === "string") {
        const enc = await storage.getEncounter(body.encounterId);
        if (enc && enc.patientId === patientId) updates.encounterId = enc.id;
      }
      const updated = await storage.updatePatientNote(noteId, updates);
      if (!updated) return res.status(404).json({ message: "Note not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "EDIT_PATIENT_NOTE", resource: "patient_note", resourceId: noteId });
      void emitIntegrationWebhookEvent({
        type: "clinical_note.updated",
        facilityId: null,
        source: "app",
        data: { note: updated },
      });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/vitals", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getVitalsByPatientId(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/latest-vitals", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getVitalsByPatientId(req.params.id);
      const latest = list[0] ?? null;
      return res.json(latest);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/critical-labs", authMiddleware as any, async (req, res) => {
    try {
      const patientId = req.params.id;
      const appointments = await storage.getAppointmentsByPatientId(patientId);
      const lastAppt = appointments[0];
      const since = lastAppt?.scheduledDate ? new Date(lastAppt.scheduledDate) : null;
      const allLabs = await storage.getLabOrders(patientId);
      const critical = allLabs.filter((o) => {
        if (!o.isCritical) return false;
        if (o.status !== "resulted" && o.status !== "completed") return false;
        const completedAt = o.completedAt ? new Date(o.completedAt) : null;
        if (!since) return !!completedAt;
        return completedAt && completedAt >= since;
      });
      return res.json(critical);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patients/:id/vitals", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      const patientId = req.params.id;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      let encounter: Awaited<ReturnType<typeof storage.getEncounter>> | undefined;
      if (body.encounterId && typeof body.encounterId === "string") {
        encounter = await storage.getEncounter(body.encounterId);
        if (!encounter || encounter.patientId !== patientId) {
          return res.status(400).json({ message: "Invalid encounter for this patient" });
        }
      } else {
        const encounters = await storage.getEncounters(patientId);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const visitEnd = new Date(today);
        visitEnd.setDate(visitEnd.getDate() + 1);
        encounter = encounters.find(
          (e) => (e.status === "in_progress" || e.status === "scheduled") && e.visitDate && new Date(e.visitDate) >= today && new Date(e.visitDate) < visitEnd
        );
        if (!encounter) {
          const patient = await storage.getPatient(patientId);
          encounter = await storage.createEncounter({
            patientId,
            clinicianId: req.user.id,
            facilityId: (patient?.facilityId ?? req.user.facilityId) || undefined,
            type: "outpatient",
            status: "in_progress",
          });
          await applyVisitTypeCharge(encounter);
        }
      }
      const payload = {
        encounterId: encounter.id,
        patientId,
        temperature: body.temperature != null ? String(body.temperature) : null,
        bloodPressureSystolic: body.bloodPressureSystolic != null ? parseInt(body.bloodPressureSystolic, 10) : null,
        bloodPressureDiastolic: body.bloodPressureDiastolic != null ? parseInt(body.bloodPressureDiastolic, 10) : null,
        heartRate: body.heartRate != null ? parseInt(body.heartRate, 10) : null,
        respiratoryRate: body.respiratoryRate != null ? parseInt(body.respiratoryRate, 10) : null,
        oxygenSaturation: body.oxygenSaturation != null ? parseInt(body.oxygenSaturation, 10) : null,
        weight: body.weight != null ? String(body.weight) : null,
        height: body.height != null ? String(body.height) : null,
        recordedBy: req.user.id,
      };
      const v = await storage.createVitals(payload);
      await storage.createAuditLog({ userId: req.user.id, action: "RECORD_VITALS", resource: "vitals", resourceId: v.id });
      return res.status(201).json(v);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/patients/:id/vitals/:vitalId", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      const patientId = req.params.id;
      const vitalId = req.params.vitalId;
      const list = await storage.getVitalsByPatientId(patientId);
      const existing = list.find((v) => v.id === vitalId);
      if (!existing) return res.status(404).json({ message: "Vitals record not found" });
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const payload: Record<string, unknown> = {};
      if (body.temperature !== undefined) payload.temperature = body.temperature != null ? String(body.temperature) : null;
      if (body.bloodPressureSystolic !== undefined) payload.bloodPressureSystolic = body.bloodPressureSystolic != null ? parseInt(body.bloodPressureSystolic, 10) : null;
      if (body.bloodPressureDiastolic !== undefined) payload.bloodPressureDiastolic = body.bloodPressureDiastolic != null ? parseInt(body.bloodPressureDiastolic, 10) : null;
      if (body.heartRate !== undefined) payload.heartRate = body.heartRate != null ? parseInt(body.heartRate, 10) : null;
      if (body.respiratoryRate !== undefined) payload.respiratoryRate = body.respiratoryRate != null ? parseInt(body.respiratoryRate, 10) : null;
      if (body.oxygenSaturation !== undefined) payload.oxygenSaturation = body.oxygenSaturation != null ? parseInt(body.oxygenSaturation, 10) : null;
      if (body.weight !== undefined) payload.weight = body.weight != null ? String(body.weight) : null;
      if (body.height !== undefined) payload.height = body.height != null ? String(body.height) : null;
      if (body.recordedAt !== undefined) payload.recordedAt = body.recordedAt != null ? new Date(body.recordedAt) : null;
      const updated = await storage.updateVitals(vitalId, payload as any);
      if (updated) await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_VITALS", resource: "vitals", resourceId: vitalId });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/family-members", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getFamilyMembers(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patients/:id/family-history", authMiddleware as any, async (req, res) => {
    try {
      const data = await storage.getFamilyHistory(req.params.id);
      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patients/:id/family-members", authMiddleware as any, requireRole("nurse", "clinician") as any, (req: any, res, next) => {
    const run = async () => {
      const patientId = req.params.id;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const relationship = body.relationship;
      if (!relationship || typeof relationship !== "string" || !String(relationship).trim()) {
        res.status(400).json({ message: "Relationship is required" });
        return;
      }
      const created = await storage.createFamilyMember({ patientId, relationship: String(relationship).trim() });
      await storage.createAuditLog({ userId: req.user.id, action: "ADD_FAMILY_MEMBER", resource: "family_member", resourceId: created.id });
      res.status(201).json(created);
    };
    run().catch((err) => {
      if (!res.headersSent) res.status(500).json({ message: err?.message ?? "Failed to add family member" });
      next(err);
    });
  });

  app.get("/api/family-members/:id/conditions", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getFamilyMemberConditions(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/family-members/:id/conditions", authMiddleware as any, requireRole("nurse", "clinician") as any, (req: any, res, next) => {
    const run = async () => {
      const familyMemberId = req.params.id;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const condition = body.condition;
      const notes = body.notes;
      if (!condition || typeof condition !== "string" || !String(condition).trim()) {
        res.status(400).json({ message: "Condition is required" });
        return;
      }
      const created = await storage.createFamilyMemberCondition({
        familyMemberId,
        condition: String(condition).trim(),
        notes: typeof notes === "string" ? String(notes).trim() || null : null,
        addedBy: req.user.id,
      });
      await storage.createAuditLog({ userId: req.user.id, action: "ADD_FAMILY_CONDITION", resource: "family_member_condition", resourceId: created.id });
      res.status(201).json(created);
    };
    run().catch((err) => {
      if (!res.headersSent) res.status(500).json({ message: err?.message ?? "Failed to add condition" });
      next(err);
    });
  });

  app.get("/api/encounters", authMiddleware as any, async (req, res) => {
    try {
      const patientId = req.query.patientId as string;
      const list = await storage.getEncounters(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/encounters/:id", authMiddleware as any, async (req, res) => {
    try {
      const enc = await storage.getEncounter(req.params.id);
      if (!enc) return res.status(404).json({ message: "Encounter not found" });
      return res.json(enc);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Open patient chart from Schedule: create an in-progress encounter and mark the appointment in progress */
  app.post(
    "/api/patients/:patientId/start-from-schedule",
    authMiddleware as any,
    requireRole("clinician", "nurse", "reception", "super_admin") as any,
    async (req: any, res) => {
      try {
        const patientId = req.params.patientId;
        const appointmentId = req.body?.appointmentId;
        if (!appointmentId || typeof appointmentId !== "string") {
          return res.status(400).json({ message: "appointmentId is required" });
        }
        const appt = await storage.getAppointment(appointmentId);
        if (!appt || appt.patientId !== patientId) {
          return res.status(400).json({ message: "Appointment not found for this patient" });
        }
        if (appt.status === "completed") {
          return res.status(409).json({
            code: "VISIT_COMPLETED",
            message: "This visit has already been signed. Choose whether to edit documentation when opening from the schedule.",
          });
        }
        if (appt.status === "cancelled" || appt.status === "no_show") {
          return res.status(400).json({ message: "Cannot start an encounter for a cancelled or no-show appointment" });
        }
        const encounter = await storage.createEncounter({
          patientId,
          clinicianId: appt.clinicianId,
          facilityId: appt.facilityId ?? req.user.facilityId ?? undefined,
          appointmentId: appt.id,
          type: "outpatient",
          status: "in_progress",
          chiefComplaint: appt.reason ?? undefined,
          visitDate: appt.scheduledDate,
        });
        await applyVisitTypeCharge(encounter);
        await storage.updateAppointment(appt.id, { status: "in_progress" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "START_ENCOUNTER_FROM_SCHEDULE",
          resource: "encounter",
          resourceId: encounter.id,
        });
        // If this appointment is an admission, link the encounter to the active bed assignment.
        try {
          await storage.attachEncounterToActiveAdmission(appt.id, encounter.id);
        } catch {
          // ignore; admission workflow can still continue without the link
        }
        return res.status(201).json({ encounter, appointmentId: appt.id });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  /** Reopen a signed visit from Schedule: clinician/nurse puts encounter + appointment back to in progress. */
  app.post(
    "/api/patients/:patientId/reopen-from-schedule",
    authMiddleware as any,
    requireRole("clinician", "nurse") as any,
    async (req: any, res) => {
      try {
        const patientId = req.params.patientId;
        const appointmentId = req.body?.appointmentId;
        if (!appointmentId || typeof appointmentId !== "string") {
          return res.status(400).json({ message: "appointmentId is required" });
        }
        const appt = await storage.getAppointment(appointmentId);
        if (!appt || appt.patientId !== patientId) {
          return res.status(400).json({ message: "Appointment not found for this patient" });
        }
        if (appt.status !== "completed") {
          return res.status(400).json({ message: "Only a signed (completed) visit can be reopened from the schedule." });
        }
        const encounter = await storage.getEncounterByAppointmentId(appointmentId);
        if (!encounter || encounter.patientId !== patientId) {
          return res.status(404).json({ message: "No encounter found for this appointment." });
        }
        await storage.updateEncounter(encounter.id, { status: "in_progress" });
        await storage.updateAppointment(appt.id, { status: "in_progress" });
        const updated = await storage.getEncounter(encounter.id);
        await storage.createAuditLog({
          userId: req.user.id,
          action: "REOPEN_VISIT_FROM_SCHEDULE",
          resource: "encounter",
          resourceId: encounter.id,
          details: `Reopened visit for appointment ${appt.id}`,
        });
        return res.json({ encounter: updated, appointmentId: appt.id });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  /** Open patient chart from Admitted Patients list: create or resume an inpatient encounter for this admission. */
  app.post(
    "/api/patients/:patientId/start-from-admission",
    authMiddleware as any,
    requireRole("clinician", "nurse") as any,
    async (req: any, res) => {
      try {
        const patientId = req.params.patientId as string;
        const admissionId = req.body?.admissionId as string | undefined;
        if (!admissionId || typeof admissionId !== "string") {
          return res.status(400).json({ message: "admissionId is required" });
        }
        const admission = await storage.getBedAssignment(admissionId);
        if (!admission || admission.patientId !== patientId) {
          return res.status(404).json({ message: "Admission not found for this patient" });
        }

        let encounter: any = null;
        if ((admission as any).encounterId) {
          encounter = await storage.getEncounter((admission as any).encounterId as string);
        }
        if (!encounter) {
          // Create a new inpatient encounter and attach it to the admission.
          encounter = await storage.createEncounter({
            patientId,
            clinicianId: (req.user?.id as string) ?? admission.admittedBy,
            facilityId: req.user.facilityId ?? undefined,
            appointmentId: admission.appointmentId ?? undefined,
            type: "inpatient",
            status: "in_progress",
            chiefComplaint: undefined,
            visitDate: new Date(),
          });
          await storage.attachEncounterToBedAssignment(admission.id, encounter.id);
          await storage.createAuditLog({
            userId: req.user.id,
            action: "START_ENCOUNTER_FROM_ADMISSION",
            resource: "encounter",
            resourceId: encounter.id,
            details: `Admission ${admission.id}`,
          });
        }

        return res.status(201).json({ encounter, admissionId: admission.id });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post("/api/encounters", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertEncounterSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid encounter data", errors: parsed.error.flatten() });
      const encounter = await storage.createEncounter({
        ...parsed.data,
        facilityId: parsed.data.facilityId ?? req.user.facilityId ?? undefined,
      });
      await applyVisitTypeCharge(encounter);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_ENCOUNTER", resource: "encounter", resourceId: encounter.id });
      return res.status(201).json(encounter);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/encounters/:id/visit-charges", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getEncounterVisitCharges(req.params.id);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  const billingChargeRoles = ["super_admin"] as const;

  app.post(
    "/api/encounters/:id/visit-charges/manual",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (req: any, res) => {
      try {
        const parsed = addManualVisitChargeBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        }
        const encounter = await storage.getEncounter(req.params.id);
        if (!encounter) return res.status(404).json({ message: "Encounter not found" });
        await applyManualCatalogCharge({
          encounterId: encounter.id,
          patientId: encounter.patientId,
          catalogCategory: parsed.data.catalogCategory,
          catalogItemKey: parsed.data.catalogItemKey,
          quantity: parsed.data.quantity ?? 1,
          orderedByUserId: req.user.id,
        });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "ADD_MANUAL_VISIT_CHARGE",
          resource: "encounter",
          resourceId: encounter.id,
          details: JSON.stringify({
            catalogCategory: parsed.data.catalogCategory,
            catalogItemKey: parsed.data.catalogItemKey,
            quantity: parsed.data.quantity,
          }),
        });
        return res.status(201).json({ ok: true });
      } catch (error: any) {
        return res.status(400).json({ message: error?.message ?? "Failed to add charge" });
      }
    },
  );

  app.delete(
    "/api/encounters/:id/visit-charges/:chargeId",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (req: any, res) => {
      try {
        const ok = await storage.deleteEncounterVisitChargeManualLine(req.params.id, req.params.chargeId);
        if (!ok) return res.status(404).json({ message: "Charge not found or cannot be removed" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "DELETE_MANUAL_VISIT_CHARGE",
          resource: "encounter",
          resourceId: req.params.id,
          details: req.params.chargeId,
        });
        return res.json({ ok: true });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/encounters/:id/visit-charges/finalize",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (req: any, res) => {
      try {
        const updated = await storage.finalizeEncounterCharges(req.params.id, req.user.id);
        if (!updated) return res.status(404).json({ message: "Encounter not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "FINALIZE_VISIT_CHARGES",
          resource: "encounter",
          resourceId: req.params.id,
        });
        return res.status(201).json(updated);
      } catch (error: any) {
        return res.status(400).json({ message: error?.message ?? "Failed to finalize charges" });
      }
    },
  );

  app.patch("/api/encounters/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updateEncounter(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Encounter not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_ENCOUNTER", resource: "encounter", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Aggregated read-only visit data for schedule-started encounters (clinical staff + billing admins for review) */
  app.get(
    "/api/encounters/:id/visit-summary",
    authMiddleware as any,
    requireRole("clinician", "nurse", "super_admin", "reception") as any,
    async (req, res) => {
    try {
      const data = await storage.getVisitSummaryForEncounter(req.params.id);
      if (!data) return res.status(404).json({ message: "Visit summary not found for this encounter." });
      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/vitals/:encounterId", authMiddleware as any, async (req, res) => {
    try {
      const list = await storage.getVitals(req.params.encounterId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/vitals", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertVitalsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid vitals data", errors: parsed.error.flatten() });
      const v = await storage.createVitals(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "RECORD_VITALS", resource: "vitals", resourceId: v.id });
      void emitIntegrationWebhookEvent({
        type: "vitals.created",
        facilityId: null,
        source: "app",
        data: { vitals: v },
      });
      return res.status(201).json(v);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/common-visit-reasons", authMiddleware as any, async (_req, res) => {
    try {
      const list = await storage.getCommonVisitReasons();
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Bed Management (admin). */
  app.get(
    "/api/beds",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const facilityId = typeof req.query?.facilityId === "string" ? req.query.facilityId : undefined;
        const list = await storage.getBeds(facilityId);
        const occupied = await storage.getOccupiedBedIds(undefined);
        const patientByBed = await storage.getActivePatientDisplayByBedId(facilityId);
        return res.json(
          list.map((b) => ({
            ...b,
            notes: b.notes ?? null,
            inUse: occupied.has(b.id),
            activePatientName: patientByBed.get(b.id) ?? null,
          })),
        );
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/beds",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const parsed = createBedBodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid bed data", errors: parsed.error.flatten() });
        const notesTrimmed = parsed.data.notes.trim();
        const notesForDb = notesTrimmed.length > 0 ? notesTrimmed : null;
        const created = await storage.createBed({
          name: parsed.data.name.trim(),
          notes: notesForDb,
          ...(parsed.data.facilityId ? { facilityId: parsed.data.facilityId } : {}),
          status: "open",
          statusReason: null,
          isActive: true,
        });
        const detailParts = [`name: ${created.name}`];
        if (notesForDb) detailParts.push(`notes: ${notesForDb}`);
        await storage.createAuditLog({
          userId: req.user.id,
          action: "CREATE_BED",
          resource: "bed",
          resourceId: created.id,
          details: detailParts.join(" · "),
        });
        return res.status(201).json({ ...created, notes: created.notes ?? null, inUse: false });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  const patchBedAdminBodySchema = z.object({
    name: z.string().trim().min(1).max(500).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
  });

  app.patch(
    "/api/beds/:id",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const parsed = patchBedAdminBodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid bed data", errors: parsed.error.flatten() });
        const payload: Record<string, unknown> = {};
        if (parsed.data.name !== undefined) payload.name = parsed.data.name.trim();
        if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes === null ? null : parsed.data.notes.trim();
        if (Object.keys(payload).length === 0) {
          return res.status(400).json({ message: "No allowed fields to update" });
        }
        const updated = await storage.updateBed(req.params.id, payload as any);
        if (!updated) return res.status(404).json({ message: "Bed not found" });
        const occupied = await storage.getOccupiedBedIds(undefined);
        await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_BED", resource: "bed", resourceId: req.params.id });
        return res.json({ ...updated, notes: updated.notes ?? null, inUse: occupied.has(updated.id) });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/beds/:id/hold",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const parsed = bedStatusReasonBodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
        const updated = await storage.setBedOnHold(req.params.id, parsed.data.reason);
        if (!updated) return res.status(404).json({ message: "Bed not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "HOLD_BED",
          resource: "bed",
          resourceId: req.params.id,
          details: parsed.data.reason.trim(),
        });
        const occupied = await storage.getOccupiedBedIds(undefined);
        return res.json({ ...updated, inUse: occupied.has(updated.id) });
      } catch (error: any) {
        const msg = error?.message ?? "Failed";
        const code = msg.includes("not found") ? 404 : 400;
        return res.status(code).json({ message: msg });
      }
    }
  );

  app.post(
    "/api/beds/:id/remove",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const parsed = bedStatusReasonBodySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
        const updated = await storage.setBedRemoved(req.params.id, parsed.data.reason);
        if (!updated) return res.status(404).json({ message: "Bed not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "REMOVE_BED",
          resource: "bed",
          resourceId: req.params.id,
          details: parsed.data.reason.trim(),
        });
        return res.json({ ...updated, inUse: false });
      } catch (error: any) {
        const msg = error?.message ?? "Failed";
        const code = msg.includes("not found") ? 404 : 400;
        return res.status(code).json({ message: msg });
      }
    }
  );

  app.post(
    "/api/beds/:id/restore",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const parsed = bedRestoreBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
        const updated = await storage.setBedRestoredToOpen(req.params.id);
        if (!updated) return res.status(404).json({ message: "Bed not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "RESTORE_BED",
          resource: "bed",
          resourceId: req.params.id,
          details: parsed.data.reason?.trim() || "Restored to open",
        });
        const occupied = await storage.getOccupiedBedIds(undefined);
        return res.json({ ...updated, inUse: occupied.has(updated.id) });
      } catch (error: any) {
        const msg = error?.message ?? "Failed";
        const code = msg.includes("not found") ? 404 : 400;
        return res.status(code).json({ message: msg });
      }
    }
  );

  /** Available beds for admissions (only empty beds). */
  app.get(
    "/api/beds/available",
    authMiddleware as any,
    requireRole("reception", "nurse", "clinician", "super_admin") as any,
    async (req: any, res) => {
      try {
        const facilityId = typeof req.query?.facilityId === "string" ? req.query.facilityId : undefined;
        const list = await storage.getAvailableBeds(facilityId);
        return res.json(list);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  /** Admissions / active admitted patients. */
  app.get(
    "/api/admissions/active",
    authMiddleware as any,
    requireRole("reception", "nurse", "clinician", "super_admin") as any,
    async (req: any, res) => {
      try {
        const facilityId = typeof req.query?.facilityId === "string" ? req.query.facilityId : undefined;
        const list = await storage.getActiveAdmissions(facilityId);
        return res.json(list);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  /** Recently discharged admissions (default last 14 days). */
  app.get(
    "/api/admissions/recent",
    authMiddleware as any,
    requireRole("nurse", "clinician", "super_admin") as any,
    async (req: any, res) => {
      try {
        const facilityId = typeof req.query?.facilityId === "string" ? req.query.facilityId : undefined;
        const list = await storage.getRecentDischargedAdmissions(facilityId, 14);
        return res.json(list);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/patients/:id/admission",
    authMiddleware as any,
    requireRole("reception", "nurse", "clinician", "super_admin") as any,
    async (req: any, res) => {
      try {
        const row = await storage.getActiveBedAssignmentByPatientId(req.params.id);
        return res.json(row ?? null);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/admissions",
    authMiddleware as any,
    requireRole("reception") as any,
    async (req: any, res) => {
      try {
        const bedId = typeof req.body?.bedId === "string" ? req.body.bedId.trim() : "";
        const patientId = typeof req.body?.patientId === "string" ? req.body.patientId.trim() : "";
        const appointmentId = typeof req.body?.appointmentId === "string" ? req.body.appointmentId.trim() : undefined;
        if (!bedId || !patientId) return res.status(400).json({ message: "bedId and patientId are required" });
        const created = await storage.createBedAssignment({
          bedId,
          patientId,
          appointmentId,
          admittedBy: req.user.id,
        } as any);
        await storage.createAuditLog({ userId: req.user.id, action: "ADMIT_PATIENT", resource: "bed_assignment", resourceId: created.id });
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  app.post(
    "/api/admissions/:id/discharge",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const dischargeReason = typeof req.body?.dischargeReason === "string" ? req.body.dischargeReason.trim() : "";
        const dischargeNotes = typeof req.body?.dischargeNotes === "string" ? req.body.dischargeNotes.trim() : null;
        const causeOfDeath = typeof req.body?.causeOfDeath === "string" ? req.body.causeOfDeath.trim() : "";
        const timeOfDeathRaw = req.body?.timeOfDeath;
        const timeOfDeath =
          typeof timeOfDeathRaw === "string" && timeOfDeathRaw.trim()
            ? new Date(timeOfDeathRaw.trim())
            : null;
        if (!dischargeReason) return res.status(400).json({ message: "Discharge reason is required" });
        if (dischargeReason === "deceased") {
          if (!causeOfDeath) return res.status(400).json({ message: "Cause of death is required" });
          if (!timeOfDeath || Number.isNaN(timeOfDeath.getTime())) {
            return res.status(400).json({ message: "Time of death is required" });
          }
        }
        const assignment = await storage.getBedAssignment(req.params.id);
        if (!assignment) return res.status(404).json({ message: "Admission not found" });
        const updated = await storage.dischargeBedAssignment(req.params.id, {
          dischargedBy: req.user.id,
          dischargeReason,
          dischargeNotes,
          causeOfDeath: dischargeReason === "deceased" ? causeOfDeath : null,
          timeOfDeath: dischargeReason === "deceased" ? timeOfDeath : null,
        });
        if (assignment.appointmentId) {
          try {
            await storage.updateAppointment(assignment.appointmentId, { status: "completed" as any });
          } catch {
            // ignore; discharge still succeeds
          }
        }
        if (assignment.encounterId) {
          try {
            await storage.updateEncounter(assignment.encounterId, { status: "completed" as any });
          } catch {
            // ignore
          }
        }
        await storage.createAuditLog({ userId: req.user.id, action: "DISCHARGE_PATIENT", resource: "bed_assignment", resourceId: req.params.id });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    }
  );

  /** Admission documentation: admission-scoped orders & medications (inpatient). */
  app.get(
    "/api/admissions/:id/lab-orders",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        const rows = await storage.getAdmissionLabOrders(admission.id);
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/admissions/:id/lab-orders",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        if ((admission as any).dischargedAt) return res.status(409).json({ message: "Admission is discharged" });
        const parsed = insertLabOrderSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid order", errors: parsed.error.flatten() });
        if (parsed.data.patientId !== admission.patientId) {
          return res.status(400).json({ message: "patientId does not match admission" });
        }
        const created = await storage.createLabOrder({
          ...parsed.data,
          admissionId: admission.id,
        } as any);
        await storage.createAuditLog({ userId: req.user.id, action: "CREATE_ADMISSION_LAB_ORDER", resource: "lab_order", resourceId: created.id });
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admissions/:id/imaging-orders",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        const rows = await storage.getAdmissionImagingOrders(admission.id);
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/admissions/:id/imaging-orders",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        if ((admission as any).dischargedAt) return res.status(409).json({ message: "Admission is discharged" });
        const parsed = insertImagingOrderSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid order", errors: parsed.error.flatten() });
        if (parsed.data.patientId !== admission.patientId) {
          return res.status(400).json({ message: "patientId does not match admission" });
        }
        const created = await storage.createImagingOrder({
          ...parsed.data,
          admissionId: admission.id,
        } as any);
        await storage.createAuditLog({ userId: req.user.id, action: "CREATE_ADMISSION_IMAGING_ORDER", resource: "imaging_order", resourceId: created.id });
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admissions/:id/medications",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        const rows = await storage.getAdmissionPrescriptions(admission.id);
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/admissions/:id/medications",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        if ((admission as any).dischargedAt) return res.status(409).json({ message: "Admission is discharged" });
        const parsed = insertPrescriptionSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid medication order", errors: parsed.error.flatten() });
        if (parsed.data.patientId !== admission.patientId) {
          return res.status(400).json({ message: "patientId does not match admission" });
        }
        if (parsed.data.orderType === "administered") {
          const route = String((parsed.data as any).route ?? "").trim().toLowerCase() as MedicationRouteId | "";
          const ok = (MEDICATION_ROUTES as readonly string[]).includes(route);
          if (!route || !ok) {
            return res.status(400).json({ message: "Route is required for administered medication orders" });
          }
          if (route === "iv") {
            const rate = String((parsed.data as any).rate ?? "").trim();
            if (!rate) {
              return res.status(400).json({ message: "Rate is required for IV administered medication orders" });
            }
          }
        }
        const created = await storage.createPrescription({
          ...parsed.data,
          admissionId: admission.id,
        } as any);
        await storage.createAuditLog({ userId: req.user.id, action: "CREATE_ADMISSION_MEDICATION_ORDER", resource: "prescription", resourceId: created.id });
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admissions/:id/medication-administrations",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        const rows = await storage.getMedicationAdministrations(admission.id);
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/admissions/:id/medication-administrations",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const admission = await storage.getBedAssignment(req.params.id);
        if (!admission) return res.status(404).json({ message: "Admission not found" });
        if ((admission as any).dischargedAt) return res.status(409).json({ message: "Admission is discharged" });
        const parsed = insertMedicationAdministrationSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid administration", errors: parsed.error.flatten() });
        if (parsed.data.admissionId !== admission.id || parsed.data.patientId !== admission.patientId) {
          return res.status(400).json({ message: "Admission/patient mismatch" });
        }
        const created = await storage.createMedicationAdministration({
          ...parsed.data,
          administeredBy: req.user.id,
        });
        await storage.createAuditLog({ userId: req.user.id, action: "ADMINISTER_MEDICATION", resource: "medication_administration", resourceId: created.id });
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get("/api/appointments", authMiddleware as any, async (req, res) => {
    try {
      const { date, start, end } = req.query as { date?: string; start?: string; end?: string };
      const list = await storage.getAppointments(date, start, end);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/appointments/:id", authMiddleware as any, async (req, res) => {
    try {
      const appt = await storage.getAppointment(req.params.id);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      return res.json(appt);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/appointments", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertAppointmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid appointment data",
          errors: parsed.error.flatten(),
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const appt = await storage.createAppointment(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_APPOINTMENT", resource: "appointment", resourceId: appt.id });
      void emitIntegrationWebhookEvent({
        type: "appointment.created",
        facilityId: appt.facilityId,
        data: { appointment: appt },
      });
      return res.status(201).json(appt);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/appointments/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updateAppointment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Appointment not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_APPOINTMENT", resource: "appointment", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lab-orders", authMiddleware as any, async (req, res) => {
    try {
      const patientId = req.query.patientId as string;
      const list = await storage.getLabOrders(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lab-orders", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertLabOrderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid lab order data", errors: parsed.error.flatten() });
      const raw = req.body.internalExternal ?? parsed.data.internalExternal ?? "internal";
      const internalExternal = String(raw).toLowerCase() === "external" ? "external" : "internal";
      const order = await storage.createLabOrder({ ...parsed.data, internalExternal });
      await applyLabOrderCharge(order);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_LAB_ORDER", resource: "lab_order", resourceId: order.id });
      void emitIntegrationWebhookEvent({
        type: "lab_order.created",
        facilityId: null,
        source: "app",
        data: { labOrder: order },
      });
      return res.status(201).json(order);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/lab-orders/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.completedAt != null && typeof body.completedAt === "string") {
        body.completedAt = new Date(body.completedAt);
      }
      if (body.internalExternal != null) {
        body.internalExternal = String(body.internalExternal).toLowerCase() === "external" ? "external" : "internal";
      }
      const updated = await storage.updateLabOrder(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Lab order not found" });
      await syncLabOrderVisitCharge(updated);
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_LAB_ORDER", resource: "lab_order", resourceId: req.params.id });
      void emitIntegrationWebhookEvent({
        type: "lab_order.updated",
        facilityId: null,
        source: "app",
        data: { labOrder: updated },
      });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/lab-orders/:id", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      await removeLabOrderVisitCharge({ id: req.params.id });
      await storage.deleteLabOrder(req.params.id);
      await storage.createAuditLog({ userId: req.user.id, action: "DELETE_LAB_ORDER", resource: "lab_order", resourceId: req.params.id });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/imaging-results", authMiddleware as any, async (req: any, res) => {
    try {
      const patientId = req.query.patientId as string;
      if (!patientId) return res.status(400).json({ message: "patientId required" });
      const list = await storage.getImagingResults(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/imaging-results", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertImagingResultSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid imaging result data", errors: parsed.error.flatten() });
      const result = await storage.createImagingResult(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_IMAGING_RESULT", resource: "imaging_result", resourceId: result.id });
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/imaging-orders", authMiddleware as any, async (req: any, res) => {
    try {
      const patientId = req.query.patientId as string;
      const list = await storage.getImagingOrders(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/imaging-orders", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertImagingOrderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid imaging order data", errors: parsed.error.flatten() });
      const raw = req.body.internalExternal ?? parsed.data.internalExternal ?? "internal";
      const internalExternal = String(raw).toLowerCase() === "external" ? "external" : "internal";
      const order = await storage.createImagingOrder({ ...parsed.data, internalExternal });
      await applyImagingOrderCharge(order);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_IMAGING_ORDER", resource: "imaging_order", resourceId: order.id });
      return res.status(201).json(order);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/imaging-orders/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (body.internalExternal != null) {
        body.internalExternal = String(body.internalExternal).toLowerCase() === "external" ? "external" : "internal";
      }
      const updated = await storage.updateImagingOrder(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Imaging order not found" });
      await syncImagingOrderVisitCharge(updated);
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_IMAGING_ORDER", resource: "imaging_order", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/imaging-orders/:id", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      await removeImagingOrderVisitCharge({ id: req.params.id });
      await storage.deleteImagingOrder(req.params.id);
      await storage.createAuditLog({ userId: req.user.id, action: "DELETE_IMAGING_ORDER", resource: "imaging_order", resourceId: req.params.id });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patient-documents", authMiddleware as any, async (req: any, res) => {
    try {
      const patientId = req.query.patientId as string;
      if (!patientId) return res.status(400).json({ message: "patientId required" });
      const list = await storage.getPatientDocuments(patientId);
      return res.json(list.map((row) => normalizePatientDocumentRow(row as PatientDocumentRow)));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patient-documents", authMiddleware as any, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.record_document_type === "string" && (body.recordDocumentType === undefined || body.recordDocumentType === null)) {
        body.recordDocumentType = body.record_document_type;
      }
      const parsed = insertPatientDocumentSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid document data", errors: parsed.error.flatten() });
      const recordTypeFromBody = getRecordDocumentTypeId(body as PatientDocumentRow);
      const merged = {
        ...parsed.data,
        recordDocumentType: parsed.data.recordDocumentType ?? recordTypeFromBody,
      };
      if (merged.documentType === "patient_document") {
        const rt = typeof merged.recordDocumentType === "string" ? merged.recordDocumentType.trim() : "";
        if (!rt || !isValidPatientRecordDocumentTypeId(rt)) {
          return res.status(400).json({ message: "Document type is required for patient documents" });
        }
      }
      const doc = await storage.createPatientDocument(merged);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_PATIENT_DOCUMENT", resource: "patient_document", resourceId: doc.id });
      void emitIntegrationWebhookEvent({
        type: "document.created",
        facilityId: null,
        source: "app",
        data: { document: doc },
      });
      return res.status(201).json(normalizePatientDocumentRow(doc as PatientDocumentRow));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/follow-up-contacts", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertFollowUpContactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid follow-up contact data", errors: parsed.error.flatten() });
      }
      const created = await storage.createFollowUpContact(parsed.data);
      await storage.createAuditLog({
        userId: req.user.id,
        action: "CREATE_FOLLOW_UP_CONTACT",
        resource: "follow_up_contact",
        resourceId: created.id,
      });
      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/follow-up-contacts", authMiddleware as any, async (req: any, res) => {
    try {
      const patientId = req.query.patientId as string | undefined;
      const list = await storage.getFollowUpContacts(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/prescriptions", authMiddleware as any, async (req, res) => {
    try {
      const patientId = req.query.patientId as string;
      const list = await storage.getPrescriptions(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/prescriptions", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertPrescriptionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid prescription data", errors: parsed.error.flatten() });
      const body = { ...parsed.data } as any;
      if (body.orderType != null) {
        body.orderType = String(body.orderType).toLowerCase() === "administered" ? "administered" : "prescription";
      }
      if (body.orderType === "administered") {
        const route = String(body.route ?? "").trim().toLowerCase() as MedicationRouteId | "";
        const ok = (MEDICATION_ROUTES as readonly string[]).includes(route);
        if (!route || !ok) {
          return res.status(400).json({ message: "Route is required for administered medication orders" });
        }
        if (route === "iv") {
          const rate = String(body.rate ?? "").trim();
          if (!rate) {
            return res.status(400).json({ message: "Rate is required for IV administered medication orders" });
          }
        }
      }
      const rx = await storage.createPrescription(body);
      await applyPrescriptionCharge(rx);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_PRESCRIPTION", resource: "prescription", resourceId: rx.id });
      return res.status(201).json(rx);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/prescriptions/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const body = { ...req.body };
      if ((body as any).orderType != null) {
        (body as any).orderType = String((body as any).orderType).toLowerCase() === "administered" ? "administered" : "prescription";
      }
      if ((body as any).orderType === "administered") {
        const route = String((body as any).route ?? "").trim().toLowerCase() as MedicationRouteId | "";
        const ok = (MEDICATION_ROUTES as readonly string[]).includes(route);
        if (!route || !ok) {
          return res.status(400).json({ message: "Route is required for administered medication orders" });
        }
        if (route === "iv") {
          const rate = String((body as any).rate ?? "").trim();
          if (!rate) {
            return res.status(400).json({ message: "Rate is required for IV administered medication orders" });
          }
        }
      }
      const updated = await storage.updatePrescription(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Prescription not found" });
      await syncPrescriptionVisitCharge(updated);
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_PRESCRIPTION", resource: "prescription", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/prescriptions/:id", authMiddleware as any, requireRole("nurse", "clinician") as any, async (req: any, res) => {
    try {
      await removePrescriptionVisitCharge({ id: req.params.id });
      await storage.deletePrescription(req.params.id);
      await storage.createAuditLog({ userId: req.user.id, action: "DELETE_PRESCRIPTION", resource: "prescription", resourceId: req.params.id });
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/encounters/:id/medication-administrations",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const enc = await storage.getEncounter(req.params.id);
        if (!enc) return res.status(404).json({ message: "Encounter not found" });
        const rows = await storage.getEncounterMedicationAdministrations(enc.id);
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/encounters/:id/medication-administrations",
    authMiddleware as any,
    requireRole("nurse", "clinician") as any,
    async (req: any, res) => {
      try {
        const enc = await storage.getEncounter(req.params.id);
        if (!enc) return res.status(404).json({ message: "Encounter not found" });
        const parsed = insertEncounterMedicationAdministrationSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: "Invalid administration", errors: parsed.error.flatten() });
        if (parsed.data.encounterId !== enc.id || parsed.data.patientId !== enc.patientId) {
          return res.status(400).json({ message: "Encounter/patient mismatch" });
        }
        const created = await storage.createEncounterMedicationAdministration({
          ...parsed.data,
          administeredBy: req.user.id,
        });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "ADMINISTER_MEDICATION",
          resource: "encounter_medication_administration",
          resourceId: created.id,
        });
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get("/api/invoices", authMiddleware as any, async (req, res) => {
    try {
      const patientId = req.query.patientId as string;
      const list = await storage.getInvoices(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/invoices", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid invoice data", errors: parsed.error.flatten() });
      const inv = await storage.createInvoice(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_INVOICE", resource: "invoice", resourceId: inv.id });
      void emitIntegrationWebhookEvent({
        type: "invoice.created",
        facilityId: inv.facilityId ?? null,
        source: "app",
        data: { invoice: inv },
      });
      return res.status(201).json(inv);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/invoices/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updateInvoice(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Invoice not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_INVOICE", resource: "invoice", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  /** Appointments in a time window (prefer `start` + `end` ISO from the client’s local calendar day; matches Schedule). */
  app.get("/api/billing/todays-visits", authMiddleware as any, async (req, res) => {
    try {
      const startQ = typeof req.query.start === "string" && req.query.start.trim() ? req.query.start.trim() : null;
      const endQ = typeof req.query.end === "string" && req.query.end.trim() ? req.query.end.trim() : null;
      const date =
        typeof req.query.date === "string" && req.query.date.trim() ? req.query.date.trim().slice(0, 10) : null;

      let startISO: string;
      let endISO: string;
      if (startQ && endQ) {
        startISO = startQ;
        endISO = endQ;
      } else if (date) {
        // Legacy: treat YYYY-MM-DD as UTC calendar day (older clients)
        startISO = `${date}T00:00:00.000Z`;
        endISO = `${date}T23:59:59.999Z`;
      } else {
        const today = new Date().toISOString().slice(0, 10);
        startISO = `${today}T00:00:00.000Z`;
        endISO = `${today}T23:59:59.999Z`;
      }

      const rows = await storage.getBillingAppointmentsForRange(startISO, endISO);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/facility/billing-settings", authMiddleware as any, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const facilityId = user.facilityId ?? null;
      if (!facilityId) {
        return res.json({ facilityId: null, billingCurrency: "KES", canEdit: false });
      }
      const fac = await storage.getFacility(facilityId);
      if (!fac) {
        return res.json({ facilityId, billingCurrency: "KES", canEdit: false });
      }
      const canEdit =
        !!facilityId &&
        user.role === "super_admin";
      return res.json({
        facilityId,
        billingCurrency: fac.billingCurrency || "KES",
        canEdit,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/facility/billing-settings",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (req: any, res) => {
      try {
        const parsed = patchFacilityBillingBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        }
        const user = await storage.getUser(req.user.id);
        if (!user?.facilityId) {
          return res.status(400).json({ message: "Your account is not linked to a facility" });
        }
        const fac = await storage.getFacility(user.facilityId);
        if (!fac) return res.status(404).json({ message: "Facility not found" });
        const updated = await storage.updateFacility(user.facilityId, {
          billingCurrency: parsed.data.billingCurrency,
        });
        if (!updated) return res.status(404).json({ message: "Facility not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "UPDATE_FACILITY_BILLING",
          resource: "facility",
          resourceId: user.facilityId,
          details: `billingCurrency=${parsed.data.billingCurrency}`,
        });
        return res.json({
          facilityId: user.facilityId,
          billingCurrency: updated.billingCurrency,
          canEdit: true,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/billing/charge-catalog",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (_req, res) => {
      try {
        const rows = await storage.getBillingChargeCatalog();
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/billing/charge-catalog",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (req: any, res) => {
      try {
        const parsed = createBillingChargeCatalogBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid charge item", errors: parsed.error.flatten() });
        }
        const body = parsed.data;
        const itemKey = body.itemKey.trim().toLowerCase().replace(/\s+/g, "_");
        const created = await storage.createBillingChargeCatalogItem({
          category: body.category,
          itemKey,
          label: body.label.trim(),
          unitPrice: body.unitPrice.trim(),
          sortOrder: body.sortOrder ?? 999,
        });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "CREATE_BILLING_CHARGE_ITEM",
          resource: "billing_charge_catalog",
          resourceId: created.id,
          details: `${body.category} / ${itemKey}`,
        });
        return res.status(201).json(created);
      } catch (error: any) {
        const msg = String(error?.message || error);
        if (msg.includes("unique") || msg.includes("duplicate")) {
          return res.status(409).json({ message: "An item with this category and key already exists" });
        }
        return res.status(500).json({ message: msg });
      }
    },
  );

  app.patch(
    "/api/billing/charge-catalog/:id",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    async (req: any, res) => {
      try {
        const parsed = patchBillingChargeCatalogBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid update", errors: parsed.error.flatten() });
        }
        const { unitPrice, label } = parsed.data;
        const updated = await storage.updateBillingChargeCatalogItem(req.params.id, {
          unitPrice,
          ...(label !== undefined ? { label: label.trim() } : {}),
        });
        if (!updated) return res.status(404).json({ message: "Charge item not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "UPDATE_BILLING_CHARGE_ITEM",
          resource: "billing_charge_catalog",
          resourceId: req.params.id,
        });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/billing/charge-catalog/upload/:category",
    authMiddleware as any,
    requireRole(...billingChargeRoles) as any,
    chargeCatalogUpload.single("file"),
    async (req: any, res) => {
      try {
        const cat = String(req.params.category || "");
        if (!isBillingChargeCategory(cat)) {
          return res.status(400).json({ message: "Invalid category" });
        }
        const file = req.file as { buffer?: Buffer } | undefined;
        if (!file?.buffer?.length) {
          return res.status(400).json({ message: "No Excel file uploaded (field name: file)" });
        }
        const rows = parseBillingChargeXlsxBuffer(file.buffer, cat);
        const count = await storage.replaceBillingChargeCatalogForCategory(cat, rows);
        await storage.createAuditLog({
          userId: req.user.id,
          action: "REPLACE_BILLING_CHARGE_CATALOG",
          resource: "billing_charge_catalog",
          resourceId: null,
          details: `${cat}: ${count} rows from Excel`,
        });
        return res.json({ ok: true, count, category: cat });
      } catch (error: any) {
        return res.status(400).json({ message: error.message || "Failed to import spreadsheet" });
      }
    },
  );

  app.get(
    "/api/audit-logs",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAuditLogs(limit);
      return res.json(logs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(
    "/api/admin/integration/api-keys",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const parsed = createIntegrationApiKeyBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid body", errors: parsed.error.flatten() });
        }
        const { name, scopes, facilityId, expiresAt } = parsed.data;
        const fac =
          facilityId === "" || facilityId === null || facilityId === undefined ? null : facilityId;
        const exp = expiresAt ? new Date(expiresAt) : null;
        const { row, plaintextKey } = await storage.createIntegrationApiKey({
          name,
          scopes,
          facilityId: fac,
          expiresAt: exp,
          createdByUserId: req.user.id,
        });
        await storage.createAuditLog({
          userId: req.user.id,
          action: "CREATE_INTEGRATION_API_KEY",
          resource: "integration_api_keys",
          resourceId: row.id,
          details: name,
        });
        return res.status(201).json({
          id: row.id,
          name: row.name,
          scopes: row.scopes,
          facilityId: row.facilityId,
          expiresAt: row.expiresAt,
          /** Shown only once — store securely; format: ehr_live_<uuid>_<secret> */
          apiKey: plaintextKey,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.get(
    "/api/admin/integration/api-keys",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (_req: any, res) => {
      try {
        const keys = await storage.listIntegrationApiKeys();
        return res.json(
          keys.map((k) => ({
            id: k.id,
            name: k.name,
            scopes: k.scopes,
            facilityId: k.facilityId,
            isActive: k.isActive,
            expiresAt: k.expiresAt,
            lastUsedAt: k.lastUsedAt,
            createdAt: k.createdAt,
          })),
        );
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.patch(
    "/api/admin/integration/api-keys/:id",
    authMiddleware as any,
    requireRole("super_admin", "security") as any,
    async (req: any, res) => {
      try {
        const isActive = req.body?.isActive;
        if (typeof isActive !== "boolean") {
          return res.status(400).json({ message: "isActive boolean required" });
        }
        const updated = await storage.setIntegrationApiKeyActive(req.params.id, isActive);
        if (!updated) return res.status(404).json({ message: "API key not found" });
        await storage.createAuditLog({
          userId: req.user.id,
          action: isActive ? "ACTIVATE_INTEGRATION_API_KEY" : "DEACTIVATE_INTEGRATION_API_KEY",
          resource: "integration_api_keys",
          resourceId: req.params.id,
        });
        return res.json({ id: updated.id, isActive: updated.isActive });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  registerPatientPortalRoutes(app);

  return httpServer;
}
