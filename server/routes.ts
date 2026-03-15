import express, { type Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import multer from "multer";
import { storage } from "./storage";
import { authMiddleware, comparePassword, generateToken, hashPassword, requireRole, type AuthRequest } from "./auth";
import { loginSchema, insertPatientSchema, insertEncounterSchema, insertVitalsSchema, insertAppointmentSchema, insertLabOrderSchema, insertImagingOrderSchema, insertImagingResultSchema, insertPatientDocumentSchema, insertPrescriptionSchema, insertInvoiceSchema } from "@shared/schema";
import { seedDatabase } from "./seed";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  }, express.static(uploadsDir));

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

  app.get("/api/users", authMiddleware as any, async (_req, res) => {
    try {
      const users = await storage.getUsers();
      const safeUsers = users.map(({ password, ...u }) => u);
      return res.json(safeUsers);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/facilities", authMiddleware as any, async (_req, res) => {
    try {
      const facs = await storage.getFacilities();
      return res.json(facs);
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
      const parsed = insertPatientSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid patient data", errors: parsed.error.flatten() });
      const patient = await storage.createPatient(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_PATIENT", resource: "patient", resourceId: patient.id, details: `Created patient ${patient.firstName} ${patient.lastName}` });
      return res.status(201).json(patient);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/patients/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updatePatient(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Patient not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_PATIENT", resource: "patient", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

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
      const created = await storage.createPatientAllergy({ patientId, allergen, severity: severity as "LOW" | "MEDIUM" | "HIGH", reactionType });
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
      if (!content || typeof content !== "string" || !String(content).trim()) {
        res.status(400).json({ message: "Note content is required" });
        return;
      }
      const authorRole = (req.user.role && String(req.user.role).toLowerCase() === "nurse") ? "nursing" : "clinician";
      const noteKind = body.noteKind && typeof body.noteKind === "string" ? String(body.noteKind).trim() : "Progress Note";
      const created = await storage.createPatientNote({
        patientId,
        authorId: req.user.id,
        authorRole: authorRole as "nursing" | "clinician",
        noteKind: noteKind || "Progress Note",
        content: String(content).trim(),
      });
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
      if (content !== undefined && (typeof content !== "string" || !String(content).trim())) {
        return res.status(400).json({ message: "Note content cannot be empty" });
      }
      const updates: { content?: string; status: string } = { status: "edited" };
      if (content !== undefined) updates.content = String(content).trim();
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
      const encounters = await storage.getEncounters(patientId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const visitEnd = new Date(today);
      visitEnd.setDate(visitEnd.getDate() + 1);
      let encounter = encounters.find(
        (e) => (e.status === "in_progress" || e.status === "scheduled") && e.visitDate && new Date(e.visitDate) >= today && new Date(e.visitDate) < visitEnd
      );
      if (!encounter) {
        encounter = await storage.createEncounter({
          patientId,
          clinicianId: req.user.id,
          type: "outpatient",
          status: "in_progress",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
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

  app.post("/api/encounters", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertEncounterSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid encounter data", errors: parsed.error.flatten() });
      const encounter = await storage.createEncounter(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_ENCOUNTER", resource: "encounter", resourceId: encounter.id });
      return res.status(201).json(encounter);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

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

  app.get("/api/appointments", authMiddleware as any, async (req, res) => {
    try {
      const { date, start, end } = req.query as { date?: string; start?: string; end?: string };
      const list = await storage.getAppointments(date, start, end);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/appointments", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid appointment data", errors: parsed.error.flatten() });
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
      const updated = await storage.updateLabOrder(req.params.id, body);
      if (!updated) return res.status(404).json({ message: "Lab order not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_LAB_ORDER", resource: "lab_order", resourceId: req.params.id });
      return res.json(updated);
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
      const order = await storage.createImagingOrder(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_IMAGING_ORDER", resource: "imaging_order", resourceId: order.id });
      return res.status(201).json(order);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/imaging-orders/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updateImagingOrder(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Imaging order not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_IMAGING_ORDER", resource: "imaging_order", resourceId: req.params.id });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patient-documents", authMiddleware as any, async (req: any, res) => {
    try {
      const patientId = req.query.patientId as string;
      if (!patientId) return res.status(400).json({ message: "patientId required" });
      const list = await storage.getPatientDocuments(patientId);
      return res.json(list);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/patient-documents", authMiddleware as any, async (req: any, res) => {
    try {
      const parsed = insertPatientDocumentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid document data", errors: parsed.error.flatten() });
      const doc = await storage.createPatientDocument(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_PATIENT_DOCUMENT", resource: "patient_document", resourceId: doc.id });
      return res.status(201).json(doc);
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
      const rx = await storage.createPrescription(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_PRESCRIPTION", resource: "prescription", resourceId: rx.id });
      return res.status(201).json(rx);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/prescriptions/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updatePrescription(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Prescription not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_PRESCRIPTION", resource: "prescription", resourceId: req.params.id });
      return res.json(updated);
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

  app.get("/api/audit-logs", authMiddleware as any, requireRole("super_admin", "facility_admin") as any, async (req, res) => {
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
