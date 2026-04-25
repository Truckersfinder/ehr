import type { Router } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import {
  USER_ROLE_VALUES,
  insertPatientSchema,
  insertAppointmentSchema,
  insertEncounterSchema,
  insertVitalsSchema,
  insertLabOrderSchema,
  insertPrescriptionSchema,
  insertPatientAllergySchema,
  insertPatientProblemSchema,
  insertPatientNoteSchema,
  insertPatientDocumentSchema,
  insertInvoiceSchema,
  insertFacilitySchema,
} from "@shared/schema";
import { storage } from "../storage";
import { applyLabOrderCharge } from "../visit-charge-service";
import { requireIntegrationScope, integrationIdempotencyMiddleware } from "./middleware";
import { emitIntegrationWebhookEvent } from "./webhook-delivery";
import { validateWebhookUrl } from "./webhook-url";
import { facilityScope, generateUniqueMrn, getPagination, integrationAudit, paramId, patientVisible } from "./v1/utils";
import { toFhirishObservationOrder, toFhirishPatient } from "./v1/mappers";

const insurancePatchSchema = z.object({
  insuranceCarrier: z.string().max(500).nullable().optional(),
  insurancePolicyNumber: z.string().max(200).nullable().optional(),
  insuranceGroupNumber: z.string().max(200).nullable().optional(),
  billingGuarantorName: z.string().max(200).nullable().optional(),
  billingGuarantorPhone: z.string().max(80).nullable().optional(),
  billingGuarantorRelation: z.string().max(120).nullable().optional(),
  billingNotes: z.string().max(4000).nullable().optional(),
});

const externalIdPostSchema = z.object({
  resourceType: z.string().min(1).max(64).default("Patient"),
  externalSystem: z.string().min(1).max(128),
  externalId: z.string().min(1).max(512),
});

const webhookPostSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string().min(1).max(120)).min(1),
  secret: z.string().min(16).max(256).optional(),
});

export function mountIntegrationV1Routes(r: Router): void {
  r.use(integrationIdempotencyMiddleware);

  r.get("/meta", requireIntegrationScope("patients:read"), (_req, res) => {
    return res.json({
      apiVersion: "1",
      fhirCompatible: "partial",
      documentation: "/docs/integration/README.md",
    });
  });

  /** Patients */
  r.get("/patients", requireIntegrationScope("patients:read"), async (req, res) => {
    const { limit, offset, q } = getPagination(req);
    const { items, total } = await storage.listPatientsIntegration({
      facilityId: facilityScope(req.integration!),
      search: q,
      limit,
      offset,
    });
    return res.json({
      resourceType: "Bundle",
      type: "searchset",
      total,
      entry: items.map((p) => ({ resource: toFhirishPatient(p) })),
    });
  });

  r.get("/patients/by-external-id", requireIntegrationScope("patients:read"), async (req, res) => {
    const system = String(req.query.external_system ?? req.query.system ?? "").trim();
    const externalId = String(req.query.external_id ?? "").trim();
    if (!system || !externalId) {
      return res.status(400).json({
        error: { code: "INVALID_QUERY", message: "system (or external_system) and external_id are required." },
      });
    }
    const internal = await storage.findInternalIdByExternalMapping("Patient", system, externalId);
    if (!internal) return res.status(404).json({ error: { code: "NOT_FOUND", message: "No patient for mapping." } });
    const p = await patientVisible(req.integration!, internal);
    if (!p) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    return res.json(toFhirishPatient(p));
  });

  r.get("/patients/:id", requireIntegrationScope("patients:read"), async (req, res) => {
    const p = await patientVisible(req.integration!, paramId(req.params.id));
    if (!p) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    return res.json(toFhirishPatient(p));
  });

  r.post("/patients", requireIntegrationScope("patients:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = { ...req.body };
    if (!body.mrn || String(body.mrn).trim() === "") {
      body.mrn = await generateUniqueMrn();
    }
    if (facilityScope(ctx) && !body.facilityId) {
      body.facilityId = facilityScope(ctx);
    }
    const parsed = insertPatientSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid patient", details: parsed.error.flatten() },
      });
    }
    const created = await storage.createPatient(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_PATIENT", "patient", created.id);
    if (req.body.external_id && req.body.external_system) {
      await storage.upsertIntegrationExternalMapping({
        resourceType: "Patient",
        internalId: created.id,
        externalSystem: String(req.body.external_system),
        externalId: String(req.body.external_id),
      });
    }
    void emitIntegrationWebhookEvent({
      type: "patient.created",
      facilityId: created.facilityId,
      source: "integration",
      data: { patient: toFhirishPatient(created) },
    });
    return res.status(201).json(toFhirishPatient(created));
  });

  r.patch("/patients/:id", requireIntegrationScope("patients:write"), async (req, res) => {
    const ctx = req.integration!;
    const existing = await patientVisible(ctx, paramId(req.params.id));
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    const parsed = insertPatientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid update", details: parsed.error.flatten() },
      });
    }
    const updated = await storage.updatePatient(paramId(req.params.id), parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_PATIENT", "patient", paramId(req.params.id));
    void emitIntegrationWebhookEvent({
      type: "patient.updated",
      facilityId: updated?.facilityId,
      source: "integration",
      data: { patient: updated ? toFhirishPatient(updated) : null },
    });
    return res.json(toFhirishPatient(updated!));
  });

  r.delete("/patients/:id", requireIntegrationScope("patients:write"), async (req, res) => {
    const ctx = req.integration!;
    const existing = await patientVisible(ctx, paramId(req.params.id));
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    await storage.updatePatient(paramId(req.params.id), { isActive: false });
    await integrationAudit(ctx, req, "INTEGRATION_DEACTIVATE_PATIENT", "patient", paramId(req.params.id));
    return res.status(204).send();
  });

  r.patch("/patients/:id/insurance", requireIntegrationScope("insurance:write"), async (req, res) => {
    const ctx = req.integration!;
    const existing = await patientVisible(ctx, paramId(req.params.id));
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    const parsed = insurancePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() },
      });
    }
    const updated = await storage.updatePatient(paramId(req.params.id), parsed.data as any);
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_INSURANCE", "patient", paramId(req.params.id));
    return res.json({
      patientId: updated!.id,
      insurance: {
        insuranceCarrier: updated!.insuranceCarrier,
        insurancePolicyNumber: updated!.insurancePolicyNumber,
        insuranceGroupNumber: updated!.insuranceGroupNumber,
        billingGuarantorName: updated!.billingGuarantorName,
        billingGuarantorPhone: updated!.billingGuarantorPhone,
        billingGuarantorRelation: updated!.billingGuarantorRelation,
        billingNotes: updated!.billingNotes,
      },
    });
  });

  r.get("/patients/:id/external-ids", requireIntegrationScope("patients:read"), async (req, res) => {
    const ctx = req.integration!;
    const p = await patientVisible(ctx, paramId(req.params.id));
    if (!p) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    const rows = await storage.listIntegrationExternalMappingsForResource("Patient", p.id);
    return res.json({ patientId: p.id, externalIds: rows });
  });

  r.post("/patients/:id/external-ids", requireIntegrationScope("patients:write"), async (req, res) => {
    const ctx = req.integration!;
    const p = await patientVisible(ctx, paramId(req.params.id));
    if (!p) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    const parsed = externalIdPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    await storage.upsertIntegrationExternalMapping({
      resourceType: parsed.data.resourceType,
      internalId: p.id,
      externalSystem: parsed.data.externalSystem,
      externalId: parsed.data.externalId,
    });
    await integrationAudit(ctx, req, "INTEGRATION_EXTERNAL_ID_UPSERT", "integration_external_mappings", p.id);
    return res.status(201).json({ ok: true });
  });

  /** Providers (clinical users) */
  r.get("/providers", requireIntegrationScope("providers:read"), async (req, res) => {
    const { q } = getPagination(req) as { q?: string };
    const users = await storage.getUsers();
    const clinical = new Set(["clinician", "nurse", "lab_tech", "pharmacist", "super_admin"]);
    let list = users.filter((u) => clinical.has(String(u.role).toLowerCase()) && u.isActive);
    const term = (q ?? "").trim().toLowerCase();
    if (term) {
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(term) ||
          u.username.toLowerCase().includes(term) ||
          (u.email && u.email.toLowerCase().includes(term)),
      );
    }
    return res.json({
      entry: list.map((u) => ({
        id: u.id,
        resourceType: "Practitioner",
        name: u.fullName,
        role: u.role,
        facilityId: u.facilityId,
      })),
    });
  });

  r.get("/providers/:id", requireIntegrationScope("providers:read"), async (req, res) => {
    const u = await storage.getUser(paramId(req.params.id));
    if (!u?.isActive) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Provider not found." } });
    return res.json({
      id: u.id,
      resourceType: "Practitioner",
      name: u.fullName,
      role: u.role,
      facilityId: u.facilityId,
      email: u.email,
      phone: u.phone,
    });
  });

  /** Appointments */
  r.get("/appointments", requireIntegrationScope("appointments:read"), async (req, res) => {
    const fac = facilityScope(req.integration!);
    const patientId = req.query.patient_id as string | undefined;
    let list = patientId ? await storage.getAppointmentsByPatientId(patientId) : await storage.getAppointments();
    if (fac) {
      if (patientId) {
        const vis = await patientVisible(req.integration!, patientId);
        if (!vis) return res.json({ entry: [] });
        list = list.filter((a) => a.patientId === patientId);
      }
      // Some rows may have null facilityId; treat as patient-scoped if facility key is used.
      const visiblePatientIds = new Set(
        (await storage.listPatientsIntegration({ facilityId: fac, limit: 200, offset: 0 })).items.map((p) => p.id),
      );
      list = list.filter((a) => (a.facilityId ? a.facilityId === fac : visiblePatientIds.has(a.patientId)));
    }
    return res.json({ entry: list.map((a) => ({ resource: a })) });
  });

  r.get("/appointments/:id", requireIntegrationScope("appointments:read"), async (req, res) => {
    const a = await storage.getAppointment(paramId(req.params.id));
    if (!a) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const fac = facilityScope(req.integration!);
    if (fac) {
      const vis = await patientVisible(req.integration!, a.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    }
    return res.json(a);
  });

  r.post("/appointments", requireIntegrationScope("appointments:write"), async (req, res) => {
    const ctx = req.integration!;
    const parsed = insertAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    if (facilityScope(ctx) && parsed.data.facilityId && parsed.data.facilityId !== facilityScope(ctx)) {
      return res.status(403).json({ error: { code: "FACILITY_MISMATCH", message: "Cannot create outside scoped facility." } });
    }
    const data = { ...parsed.data };
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, data.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
      (data as any).facilityId = fac;
    }
    const appt = await storage.createAppointment(data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_APPOINTMENT", "appointment", appt.id);
    void emitIntegrationWebhookEvent({
      type: "appointment.created",
      facilityId: appt.facilityId,
      source: "integration",
      data: { appointment: appt },
    });
    return res.status(201).json(appt);
  });

  r.patch("/appointments/:id", requireIntegrationScope("appointments:write"), async (req, res) => {
    const ctx = req.integration!;
    const existing = await storage.getAppointment(paramId(req.params.id));
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, existing.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    }
    const updated = await storage.updateAppointment(paramId(req.params.id), req.body);
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_APPOINTMENT", "appointment", paramId(req.params.id));
    void emitIntegrationWebhookEvent({
      type: "appointment.updated",
      facilityId: updated?.facilityId,
      source: "integration",
      data: { appointment: updated },
    });
    return res.json(updated);
  });

  /** Encounters */
  r.get("/encounters", requireIntegrationScope("encounters:read"), async (req, res) => {
    const patientId = req.query.patient_id as string | undefined;
    const ctx = req.integration!;
    if (facilityScope(ctx) && !patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required for facility-scoped keys." } });
    }
    if (patientId) {
      const vis = await patientVisible(ctx, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getEncounters(patientId);
    return res.json({ entry: list.map((e) => ({ resource: e })) });
  });

  r.get("/encounters/:id", requireIntegrationScope("encounters:read"), async (req, res) => {
    const e = await storage.getEncounter(paramId(req.params.id));
    if (!e) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const fac = facilityScope(req.integration!);
    if (fac) {
      const vis = await patientVisible(req.integration!, e.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    }
    return res.json(e);
  });

  r.post("/encounters", requireIntegrationScope("encounters:write"), async (req, res) => {
    const ctx = req.integration!;
    const parsed = insertEncounterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, parsed.data.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
      if (parsed.data.facilityId && parsed.data.facilityId !== fac) {
        return res.status(403).json({ error: { code: "FACILITY_MISMATCH", message: "Cannot create outside scoped facility." } });
      }
    }
    const created = await storage.createEncounter({ ...parsed.data, facilityId: fac ?? parsed.data.facilityId } as any);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_ENCOUNTER", "encounter", created.id);
    void emitIntegrationWebhookEvent({ type: "encounter.created", facilityId: created.facilityId, source: "integration", data: { encounter: created } });
    return res.status(201).json(created);
  });

  r.patch("/encounters/:id", requireIntegrationScope("encounters:write"), async (req, res) => {
    const ctx = req.integration!;
    const existing = await storage.getEncounter(paramId(req.params.id));
    if (!existing) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, existing.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    }
    const updated = await storage.updateEncounter(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_ENCOUNTER", "encounter", paramId(req.params.id));
    return res.json(updated);
  });

  /** Medications (prescriptions) */
  r.get("/medications", requireIntegrationScope("medications:read"), async (req, res) => {
    const patientId = req.query.patient_id as string | undefined;
    const ctx = req.integration!;
    if (facilityScope(ctx) && !patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required for facility-scoped keys." } });
    }
    if (patientId) {
      const vis = await patientVisible(ctx, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getPrescriptions(patientId);
    return res.json({ entry: list.map((x) => ({ resource: x })) });
  });

  r.get("/medications/:id", requireIntegrationScope("medications:read"), async (req, res) => {
    const all = await storage.getPrescriptions();
    const m = all.find((x) => x.id === paramId(req.params.id));
    if (!m) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    return res.json(m);
  });

  r.post("/medications", requireIntegrationScope("medications:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = { ...req.body, prescribedBy: req.body.prescribedBy ?? ctx.actingUserId };
    const parsed = insertPrescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, parsed.data.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    }
    const created = await storage.createPrescription(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_PRESCRIPTION", "prescription", created.id);
    void emitIntegrationWebhookEvent({ type: "medication.created", facilityId: null, source: "integration", data: { prescription: created } });
    return res.status(201).json(created);
  });

  r.patch("/medications/:id", requireIntegrationScope("medications:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updatePrescription(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_PRESCRIPTION", "prescription", paramId(req.params.id));
    return res.json(updated);
  });

  /** Allergies */
  r.get("/allergies", requireIntegrationScope("allergies:read"), async (req, res) => {
    const patientId = String(req.query.patient_id ?? "");
    if (!patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required" } });
    }
    const fac = facilityScope(req.integration!);
    if (fac) {
      const vis = await patientVisible(req.integration!, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getPatientAllergies(patientId);
    return res.json({ entry: list.map((x) => ({ resource: x })) });
  });

  r.post("/allergies", requireIntegrationScope("allergies:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = { ...req.body, addedBy: req.body.addedBy ?? ctx.actingUserId };
    const parsed = insertPatientAllergySchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, parsed.data.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    }
    const created = await storage.createPatientAllergy(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_ALLERGY", "patient_allergy", created.id);
    return res.status(201).json(created);
  });

  r.delete("/allergies/:id", requireIntegrationScope("allergies:write"), async (req, res) => {
    const ctx = req.integration!;
    await storage.deletePatientAllergy(paramId(req.params.id));
    await integrationAudit(ctx, req, "INTEGRATION_DELETE_ALLERGY", "patient_allergy", paramId(req.params.id));
    return res.status(204).send();
  });

  /** Problems */
  r.get("/problems", requireIntegrationScope("problems:read"), async (req, res) => {
    const patientId = String(req.query.patient_id ?? "");
    if (!patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required" } });
    }
    const fac = facilityScope(req.integration!);
    if (fac) {
      const vis = await patientVisible(req.integration!, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getPatientProblems(patientId);
    return res.json({ entry: list.map((x) => ({ resource: x })) });
  });

  r.post("/problems", requireIntegrationScope("problems:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = { ...req.body, addedBy: req.body.addedBy ?? ctx.actingUserId };
    const parsed = insertPatientProblemSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const fac = facilityScope(ctx);
    if (fac) {
      const vis = await patientVisible(ctx, parsed.data.patientId);
      if (!vis) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Patient not found." } });
    }
    const created = await storage.createPatientProblem(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_PROBLEM", "patient_problem", created.id);
    return res.status(201).json(created);
  });

  r.patch("/problems/:id", requireIntegrationScope("problems:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updatePatientProblem(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_PROBLEM", "patient_problem", paramId(req.params.id));
    return res.json(updated);
  });

  /** Lab orders & results */
  r.get("/lab-orders", requireIntegrationScope("labs:read"), async (req, res) => {
    const patientId = req.query.patient_id as string | undefined;
    const ctx = req.integration!;
    if (facilityScope(ctx) && !patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required for facility-scoped keys." } });
    }
    if (patientId) {
      const vis = await patientVisible(ctx, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getLabOrders(patientId);
    return res.json({ entry: list.map((x) => ({ resource: toFhirishObservationOrder(x) })) });
  });

  r.get("/lab-orders/:id", requireIntegrationScope("labs:read"), async (req, res) => {
    const all = await storage.getLabOrders();
    const row = all.find((x) => x.id === paramId(req.params.id));
    if (!row) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    return res.json(toFhirishObservationOrder(row));
  });

  r.post("/lab-orders", requireIntegrationScope("labs:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = {
      ...req.body,
      orderedBy: req.body.orderedBy ?? ctx.actingUserId,
      internalExternal: String(req.body.internalExternal ?? "internal").toLowerCase() === "external" ? "external" : "internal",
    };
    const parsed = insertLabOrderSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const order = await storage.createLabOrder(parsed.data as any);
    try {
      await applyLabOrderCharge(order);
    } catch (e) {
      console.warn("[integration] applyLabOrderCharge", e);
    }
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_LAB_ORDER", "lab_order", order.id);
    void emitIntegrationWebhookEvent({ type: "lab_order.created", facilityId: null, source: "integration", data: { labOrder: order } });
    return res.status(201).json(toFhirishObservationOrder(order));
  });

  r.patch("/lab-orders/:id", requireIntegrationScope("labs:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updateLabOrder(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_LAB_ORDER", "lab_order", paramId(req.params.id));
    void emitIntegrationWebhookEvent({ type: "lab_order.updated", facilityId: null, source: "integration", data: { labOrder: updated } });
    return res.json(toFhirishObservationOrder(updated));
  });

  /** Vitals */
  r.get("/vitals", requireIntegrationScope("vitals:read"), async (req, res) => {
    const encounterId = req.query.encounter_id as string | undefined;
    const patientId = req.query.patient_id as string | undefined;
    const ctx = req.integration!;
    if (encounterId) {
      const enc = await storage.getEncounter(encounterId);
      if (!enc) return res.json({ entry: [] });
      const fac = facilityScope(ctx);
      if (fac) {
        const vis = await patientVisible(ctx, enc.patientId);
        if (!vis) return res.json({ entry: [] });
      }
      const list = await storage.getVitals(encounterId);
      return res.json({ entry: list.map((x) => ({ resource: x })) });
    }
    if (patientId) {
      const fac = facilityScope(ctx);
      if (fac) {
        const vis = await patientVisible(ctx, patientId);
        if (!vis) return res.json({ entry: [] });
      }
      const list = await storage.getVitalsByPatientId(patientId);
      return res.json({ entry: list.map((x) => ({ resource: x })) });
    }
    return res.status(400).json({ error: { code: "INVALID_QUERY", message: "encounter_id or patient_id required" } });
  });

  r.post("/vitals", requireIntegrationScope("vitals:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = { ...req.body, recordedBy: req.body.recordedBy ?? ctx.actingUserId };
    const parsed = insertVitalsSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const created = await storage.createVitals(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_VITALS", "vitals", created.id);
    void emitIntegrationWebhookEvent({ type: "vitals.created", facilityId: null, source: "integration", data: { vitals: created } });
    return res.status(201).json(created);
  });

  r.patch("/vitals/:id", requireIntegrationScope("vitals:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updateVitals(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_VITALS", "vitals", paramId(req.params.id));
    return res.json(updated);
  });

  /** Clinical notes */
  r.get("/clinical-notes", requireIntegrationScope("notes:read"), async (req, res) => {
    const patientId = String(req.query.patient_id ?? "");
    if (!patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required" } });
    }
    const fac = facilityScope(req.integration!);
    if (fac) {
      const vis = await patientVisible(req.integration!, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getPatientNotes(patientId);
    return res.json({ entry: list.map((x) => ({ resource: x })) });
  });

  r.post("/clinical-notes", requireIntegrationScope("notes:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = {
      ...req.body,
      authorId: req.body.authorId ?? ctx.actingUserId,
      authorRole: req.body.authorRole ?? "clinician",
    };
    const parsed = insertPatientNoteSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const created = await storage.createPatientNote(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_NOTE", "patient_note", created.id);
    void emitIntegrationWebhookEvent({ type: "clinical_note.created", facilityId: null, source: "integration", data: { note: created } });
    return res.status(201).json(created);
  });

  r.patch("/clinical-notes/:id", requireIntegrationScope("notes:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updatePatientNote(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_NOTE", "patient_note", paramId(req.params.id));
    return res.json(updated);
  });

  /** Documents */
  r.get("/documents", requireIntegrationScope("documents:read"), async (req, res) => {
    const patientId = String(req.query.patient_id ?? "");
    if (!patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required" } });
    }
    const fac = facilityScope(req.integration!);
    if (fac) {
      const vis = await patientVisible(req.integration!, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getPatientDocuments(patientId);
    return res.json({ entry: list.map((x) => ({ resource: x })) });
  });

  r.post("/documents", requireIntegrationScope("documents:write"), async (req, res) => {
    const ctx = req.integration!;
    const body = { ...req.body, uploadedBy: req.body.uploadedBy ?? ctx.actingUserId };
    const parsed = insertPatientDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const created = await storage.createPatientDocument(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_DOCUMENT", "patient_document", created.id);
    void emitIntegrationWebhookEvent({ type: "document.created", facilityId: null, source: "integration", data: { document: created } });
    return res.status(201).json(created);
  });

  /** Billing / invoices */
  r.get("/billing/invoices", requireIntegrationScope("billing:read"), async (req, res) => {
    const patientId = req.query.patient_id as string | undefined;
    const ctx = req.integration!;
    if (facilityScope(ctx) && !patientId) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "patient_id is required for facility-scoped keys." } });
    }
    if (patientId) {
      const vis = await patientVisible(ctx, patientId);
      if (!vis) return res.json({ entry: [] });
    }
    const list = await storage.getInvoices(patientId);
    return res.json({ entry: list.map((x) => ({ resource: x, claim: { status: x.status, total: x.totalAmount } })) });
  });

  r.get("/billing/invoices/:id", requireIntegrationScope("billing:read"), async (req, res) => {
    const all = await storage.getInvoices();
    const inv = all.find((x) => x.id === paramId(req.params.id));
    if (!inv) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    return res.json(inv);
  });

  r.post("/billing/invoices", requireIntegrationScope("billing:write"), async (req, res) => {
    const ctx = req.integration!;
    const parsed = insertInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const created = await storage.createInvoice(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_INVOICE", "invoice", created.id);
    void emitIntegrationWebhookEvent({ type: "invoice.created", facilityId: null, source: "integration", data: { invoice: created } });
    return res.status(201).json(created);
  });

  r.patch("/billing/invoices/:id", requireIntegrationScope("billing:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updateInvoice(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_INVOICE", "invoice", paramId(req.params.id));
    return res.json(updated);
  });

  /** Facilities */
  r.get("/facilities", requireIntegrationScope("facilities:read"), async (req, res) => {
    const fac = facilityScope(req.integration!);
    if (fac) {
      const f = await storage.getFacility(fac);
      return res.json({ entry: f ? [{ resource: f }] : [] });
    }
    const list = await storage.getFacilities();
    return res.json({ entry: list.map((f) => ({ resource: f })) });
  });

  r.get("/facilities/:id", requireIntegrationScope("facilities:read"), async (req, res) => {
    const f = await storage.getFacility(paramId(req.params.id));
    if (!f) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const fac = facilityScope(req.integration!);
    if (fac && f.id !== fac) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    return res.json(f);
  });

  r.post("/facilities", requireIntegrationScope("facilities:write"), async (req, res) => {
    const ctx = req.integration!;
    const parsed = insertFacilitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const created = await storage.createFacility(parsed.data);
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_FACILITY", "facility", created.id);
    return res.status(201).json(created);
  });

  r.patch("/facilities/:id", requireIntegrationScope("facilities:write"), async (req, res) => {
    const ctx = req.integration!;
    const updated = await storage.updateFacility(paramId(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_UPDATE_FACILITY", "facility", paramId(req.params.id));
    return res.json(updated);
  });

  /** Users & roles */
  r.get("/users", requireIntegrationScope("users:read"), async (req, res) => {
    const fac = facilityScope(req.integration!);
    const users = await storage.getUsers();
    const filtered = fac ? users.filter((u) => u.facilityId === fac) : users;
    return res.json({
      entry: filtered.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        facilityId: u.facilityId,
        email: u.email,
        isActive: u.isActive,
      })),
    });
  });

  r.get("/users/:id", requireIntegrationScope("users:read"), async (req, res) => {
    const u = await storage.getUser(paramId(req.params.id));
    if (!u) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    return res.json({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      facilityId: u.facilityId,
      email: u.email,
      isActive: u.isActive,
    });
  });

  r.get("/roles", requireIntegrationScope("users:read"), (_req, res) => {
    return res.json({ resourceType: "CodeSystem", concept: USER_ROLE_VALUES.map((r) => ({ code: r })) });
  });

  /** Audit (integration-scoped read) */
  r.get("/audit-logs", requireIntegrationScope("audit:read"), async (req, res) => {
    const { limit, offset } = getPagination(req);
    const since = req.query.since ? new Date(String(req.query.since)) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      return res.status(400).json({ error: { code: "INVALID_QUERY", message: "Invalid since" } });
    }
    const logs = await storage.getAuditLogsIntegration({ limit, offset, since });
    return res.json({ entry: logs.map((l) => ({ resource: l })) });
  });

  /** Webhooks */
  r.get("/webhooks", requireIntegrationScope("webhooks:read"), async (req, res) => {
    const ctx = req.integration!;
    const list = await storage.listIntegrationWebhooksForApiKey(ctx.apiKey.id);
    return res.json({
      entry: list.map((w) => ({
        id: w.id,
        url: w.url,
        eventTypes: w.eventTypes,
        isActive: w.isActive,
        createdAt: w.createdAt,
      })),
    });
  });

  r.post("/webhooks", requireIntegrationScope("webhooks:write"), async (req, res) => {
    const ctx = req.integration!;
    const parsed = webhookPostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
    }
    const v = validateWebhookUrl(parsed.data.url);
    if (!v.ok) {
      return res.status(400).json({ error: { code: "INVALID_WEBHOOK_URL", message: v.message } });
    }
    const secret = parsed.data.secret ?? randomBytes(24).toString("hex");
    const sub = await storage.createIntegrationWebhookSubscription({
      integrationApiKeyId: ctx.apiKey.id,
      url: v.url,
      secret,
      eventTypes: parsed.data.eventTypes,
    });
    await integrationAudit(ctx, req, "INTEGRATION_CREATE_WEBHOOK", "integration_webhook", sub.id);
    return res.status(201).json({
      id: sub.id,
      url: sub.url,
      eventTypes: sub.eventTypes,
      secret,
    });
  });

  r.delete("/webhooks/:id", requireIntegrationScope("webhooks:write"), async (req, res) => {
    const ctx = req.integration!;
    const ok = await storage.deleteIntegrationWebhook(paramId(req.params.id), ctx.apiKey.id);
    if (!ok) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    await integrationAudit(ctx, req, "INTEGRATION_DELETE_WEBHOOK", "integration_webhook", paramId(req.params.id));
    return res.status(204).send();
  });
}
