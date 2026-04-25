import type { Express, Response } from "express";
import { z } from "zod";
import { storage } from "./storage";
import {
  authMiddleware,
  comparePassword,
  generatePatientPortalToken,
  hashPassword,
  patientPortalAuthMiddleware,
  requireRole,
  type AuthRequest,
  type PatientPortalAuthRequest,
} from "./auth";
import { issuePortalInviteAndSendEmail } from "./patient-portal-invite";
import { mergePatientPortalConfig } from "@shared/patient-portal-config";

const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");

const loginBodySchema = z
  .object({
    mrn: z.string().trim().optional(),
    email: z.string().trim().optional(),
    pin: pinSchema,
  })
  .refine((b) => (b.mrn && b.mrn.length > 0) || (b.email && b.email.length > 0), {
    message: "Provide MRN or email",
  });

const setupPinBodySchema = z.object({
  token: z.string().min(10),
  pin: pinSchema,
  confirmPin: pinSchema,
});

function assertPatientSelf(req: PatientPortalAuthRequest, res: Response, patientId: string): boolean {
  if (req.patientPortalPatientId !== patientId) {
    res.status(403).json({ message: "Access denied" });
    return false;
  }
  return true;
}

export function registerPatientPortalRoutes(app: Express): void {
  /** Public: facility name for portal UI (no auth). */
  app.get("/api/patient-portal/branding", async (_req, res) => {
    try {
      const facilities = await storage.getFacilities();
      const fromEnv = process.env.HOSPITAL_DISPLAY_NAME?.trim();
      const fac = facilities.find((f) => f.isActive);
      const facilityName = fac?.name?.trim();
      /** Admin-configured facility name wins; env is only a fallback when no name is set. */
      const name = facilityName || fromEnv || "Hospital";
      const cfg = mergePatientPortalConfig((fac as { patientPortalConfig?: unknown } | undefined)?.patientPortalConfig);
      return res.json({ organizationName: name, welcomeMessage: cfg.welcomeMessage });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patient-portal/invite/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(400).json({ message: "Invalid link" });
      const patient = await storage.getPatientByPortalInviteToken(token);
      if (!patient) return res.status(404).json({ message: "This link is invalid or has already been used" });
      if (patient.portalPinHash) {
        return res.json({
          firstName: patient.firstName,
          alreadyCompleted: true,
          message: "You have already created a PIN. Sign in from the patient portal login page.",
        });
      }
      const facility = patient.facilityId ? await storage.getFacility(patient.facilityId) : undefined;
      return res.json({
        firstName: patient.firstName,
        facilityName: facility?.name ?? "Hospital",
        alreadyCompleted: false,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patient-portal/setup-pin", async (req, res) => {
    try {
      const parsed = setupPinBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const { token, pin, confirmPin } = parsed.data;
      if (pin !== confirmPin) return res.status(400).json({ message: "PINs do not match" });
      const patient = await storage.getPatientByPortalInviteToken(token);
      if (!patient) return res.status(400).json({ message: "This link is invalid or has already been used" });
      if (patient.portalPinHash) return res.status(400).json({ message: "A PIN is already set for this account" });

      const portalPinHash = hashPassword(pin);
      await storage.updatePatient(patient.id, {
        portalPinHash,
        portalInviteToken: null,
      });

      const jwt = generatePatientPortalToken(patient.id);
      return res.json({ token: jwt, patientId: patient.id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patient-portal/login", async (req, res) => {
    try {
      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      const { mrn, email, pin } = parsed.data;
      const patient = await storage.findPatientForPortalLogin(mrn || null, email || null);
      if (!patient || !patient.isActive) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!patient.portalPinHash) {
        return res.status(401).json({ message: "Portal access is not activated yet. Use the link in your invitation email to create your PIN." });
      }
      if (!comparePassword(pin, patient.portalPinHash)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const jwt = generatePatientPortalToken(patient.id);
      return res.json({
        token: jwt,
        patientId: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patient-portal/me", patientPortalAuthMiddleware as any, async (req: PatientPortalAuthRequest, res) => {
    try {
      const id = req.patientPortalPatientId!;
      const patient = await storage.getPatient(id);
      if (!patient || !patient.isActive) return res.status(404).json({ message: "Not found" });
      const facility = patient.facilityId ? await storage.getFacility(patient.facilityId) : undefined;
      const visibility = mergePatientPortalConfig((facility as { patientPortalConfig?: unknown } | undefined)?.patientPortalConfig);
      return res.json({
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          mrn: patient.mrn,
        },
        facilityName: facility?.name ?? null,
        patientIdentifierLabel: facility?.patientIdentifierLabel ?? "MRN",
        timeZone: facility?.timeZone ?? "UTC",
        visibility,
        welcomeMessage: visibility.welcomeMessage,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patient-portal/record", patientPortalAuthMiddleware as any, async (req: PatientPortalAuthRequest, res) => {
    try {
      const patientId = req.patientPortalPatientId!;
      const patient = await storage.getPatient(patientId);
      if (!patient || !patient.isActive) return res.status(404).json({ message: "Not found" });

      const facility = patient.facilityId ? await storage.getFacility(patient.facilityId) : undefined;
      const visibility = mergePatientPortalConfig((facility as { patientPortalConfig?: unknown } | undefined)?.patientPortalConfig);

      const [prescriptionsAll, problemsAll, allergiesAll, encountersAll, users] = await Promise.all([
        storage.getPrescriptions(patientId),
        storage.getPatientProblems(patientId),
        storage.getPatientAllergies(patientId),
        storage.getEncounters(patientId),
        storage.getUsers(),
      ]);

      const prescriptions = visibility.showMedications ? prescriptionsAll : [];
      const problems = visibility.showProblems ? problemsAll : [];
      const allergies = visibility.showAllergies ? allergiesAll : [];
      const encounters = visibility.showVisits ? encountersAll : [];

      const prescriberNameById = new Map(users.map((u) => [u.id, u.fullName ?? u.username ?? u.id]));
      const userList = users.map((u) => ({ id: u.id, fullName: u.fullName, username: u.username }));

      const { portalInviteToken: _t, portalPinHash: _p, ...patientSafe } = patient;

      return res.json({
        patient: patientSafe,
        prescriptions,
        problems,
        allergies,
        encounters,
        users: userList,
        prescriberNameById: Object.fromEntries(prescriberNameById),
        visibility,
      });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(
    "/api/patient-portal/encounters/:id/visit-summary",
    patientPortalAuthMiddleware as any,
    async (req: PatientPortalAuthRequest, res) => {
      try {
        const patientId = req.patientPortalPatientId!;
        const encounterId = String(req.params.id);
        const patientRow = await storage.getPatient(patientId);
        const facility = patientRow?.facilityId ? await storage.getFacility(patientRow.facilityId) : undefined;
        const visibility = mergePatientPortalConfig((facility as { patientPortalConfig?: unknown } | undefined)?.patientPortalConfig);
        if (!visibility.showVisits) {
          return res.status(403).json({ message: "Visit documentation is not available in the patient portal" });
        }
        const enc = await storage.getEncounter(encounterId);
        if (!enc || enc.patientId !== patientId) return res.status(404).json({ message: "Visit not found" });
        const data = await storage.getVisitSummaryForEncounter(encounterId);
        if (!data) return res.status(404).json({ message: "Visit summary not found" });
        return res.json(data);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/patients/:id/portal-invite",
    authMiddleware as any,
    requireRole("super_admin", "security", "clinician", "nurse", "lab_tech", "reception") as any,
    async (req: AuthRequest, res) => {
      try {
        const pid = String(req.params.id);
        const patient = await storage.getPatient(pid);
        if (!patient) return res.status(404).json({ message: "Patient not found" });
        const body = z.object({ regenerateToken: z.boolean().optional() }).safeParse(req.body);
        const regenerate = body.success ? body.data.regenerateToken === true : false;
        const result = await issuePortalInviteAndSendEmail(pid, { regenerateToken: regenerate });
        if (!result.ok) return res.status(400).json({ message: result.message ?? "Failed to send" });
        await storage.createAuditLog({
          userId: req.user!.id,
          action: "PATIENT_PORTAL_INVITE",
          resource: "patient",
          resourceId: patient.id,
          details: result.resendEmailId
            ? `Patient portal email queued (Resend id ${result.resendEmailId})`
            : "Patient portal invitation email sent",
        });
        return res.json({
          ok: true,
          resendEmailId: result.resendEmailId,
          sentTo: result.sentTo,
        });
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );
}
