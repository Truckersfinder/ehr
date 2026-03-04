import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { authMiddleware, comparePassword, generateToken, hashPassword, requireRole, type AuthRequest } from "./auth";
import { loginSchema, insertPatientSchema, insertEncounterSchema, insertVitalsSchema, insertAppointmentSchema, insertLabOrderSchema, insertPrescriptionSchema, insertInvoiceSchema } from "@shared/schema";
import { seedDatabase } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

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
      const list = await storage.getAppointments(req.query.date as string);
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
      const order = await storage.createLabOrder(parsed.data);
      await storage.createAuditLog({ userId: req.user.id, action: "CREATE_LAB_ORDER", resource: "lab_order", resourceId: order.id });
      return res.status(201).json(order);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/lab-orders/:id", authMiddleware as any, async (req: any, res) => {
    try {
      const updated = await storage.updateLabOrder(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Lab order not found" });
      await storage.createAuditLog({ userId: req.user.id, action: "UPDATE_LAB_ORDER", resource: "lab_order", resourceId: req.params.id });
      return res.json(updated);
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
