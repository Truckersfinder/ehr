import express, { type Express } from "express";
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
  insertPatientSchema,
  insertEncounterSchema,
  insertVitalsSchema,
  insertAppointmentSchema,
  insertLabOrderSchema,
  insertImagingOrderSchema,
  insertImagingResultSchema,
  insertPatientDocumentSchema,
  insertPrescriptionSchema,
  insertInvoiceSchema,
  insertFollowUpContactSchema,
  patchBillingChargeCatalogBodySchema,
  createBillingChargeCatalogBodySchema,
  addManualVisitChargeBodySchema,
} from "@shared/schema";

/** Create patient: never take legacy free-text `allergies` from the request (autofill / stray JSON). Use structured patient_allergies + clinical workflow instead. */
const insertPatientCreateSchema = insertPatientSchema.omit({ allergies: true, profilePhotoUrl: true });
import { seedDatabase, ensureSecurityUser } from "./seed";
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

const uploadsDir = ensureUploadsDir();

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();
  await ensureSecurityUser();
  await storage.ensureCommonVisitReasonsSeeded();
  await storage.ensureBillingChargeCatalogSeeded();
  await storage.ensureLabOrderBillingChargesSyncedFromCommonList();
  await storage.ensureVisitChargeCatalogKeys();
  await storage.ensureVisitChargeLineKindManualEnum();
  await storage.ensureEncounterChargeFinalizationColumns();

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
      const { password, ...safeUser } = user;
      return res.json({ token, user: safeUser });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auth/me", authMiddleware as any, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password, ...safeUser } = user;
      return res.json(safeUser);
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
    requireRole("super_admin", "facility_admin", "finance") as any,
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
      return res.status(201).json(patient);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(
    "/api/patients/:id",
    authMiddleware as any,
    requireRole(
      "super_admin",
      "facility_admin",
      "clinician",
      "nurse",
      "lab_tech",
      "pharmacist",
      "finance",
      "reception",
    ) as any,
    async (req: any, res) => {
      try {
        const updated = await storage.updatePatient(req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: "Patient not found" });
        await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_PATIENT", resource: "patient", resourceId: req.params.id });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ message: error.message });
      }
    },
  );

  app.post(
    "/api/patients/:patientId/profile-photo",
    authMiddleware as any,
    requireRole(
      "super_admin",
      "facility_admin",
      "clinician",
      "nurse",
      "lab_tech",
      "pharmacist",
      "finance",
      "reception",
    ) as any,
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
    requireRole("clinician", "nurse", "reception", "super_admin", "facility_admin") as any,
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

  const billingChargeRoles = ["super_admin", "facility_admin", "finance"] as const;

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
    requireRole("clinician", "nurse", "super_admin", "facility_admin", "finance", "reception") as any,
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
        (user.role === "super_admin" || user.role === "facility_admin" || user.role === "finance");
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
    requireRole("super_admin", "facility_admin", "security") as any,
    async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAuditLogs(limit);
      return res.json(logs);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
