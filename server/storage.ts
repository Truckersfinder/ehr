import { db } from "./db";
import { eq, like, ilike, or, desc, and, sql, count, inArray } from "drizzle-orm";
import {
  users, facilities, patients, patientProblems, patientAllergies, patientNotes, familyMembers, familyMemberConditions,
  encounters, vitals, appointments, labOrders, imagingOrders, prescriptions, invoices, imagingResults, patientDocuments, auditLogs,
  type InsertUser, type User, type InsertFacility, type Facility,
  type InsertPatient, type Patient, type InsertPatientProblem, type PatientProblem,
  type InsertPatientAllergy, type PatientAllergy, type InsertPatientNote, type PatientNote, type InsertFamilyMember, type FamilyMember,
  type InsertFamilyMemberCondition, type FamilyMemberCondition, type InsertEncounter, type Encounter,
  type InsertVitals, type Vitals, type InsertAppointment, type Appointment,
  type InsertLabOrder, type LabOrder, type InsertImagingOrder, type ImagingOrder,
  type InsertPrescription, type Prescription, type InsertImagingResult, type ImagingResult,
  type InsertPatientDocument, type PatientDocument, type InsertInvoice, type Invoice, type InsertAuditLog, type AuditLog,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;

  getFacilities(): Promise<Facility[]>;
  getFacility(id: string): Promise<Facility | undefined>;
  createFacility(f: InsertFacility): Promise<Facility>;

  getPatients(): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | undefined>;
  searchPatients(query: string): Promise<Patient[]>;
  createPatient(p: InsertPatient): Promise<Patient>;
  updatePatient(id: string, data: Partial<InsertPatient>): Promise<Patient | undefined>;

  getPatientProblems(patientId: string): Promise<PatientProblem[]>;
  createPatientProblem(p: InsertPatientProblem): Promise<PatientProblem>;
  updatePatientProblem(id: string, data: Partial<Omit<InsertPatientProblem, "patientId" | "addedBy">>): Promise<PatientProblem | undefined>;

  getPatientAllergies(patientId: string): Promise<PatientAllergy[]>;
  createPatientAllergy(a: InsertPatientAllergy): Promise<PatientAllergy>;
  deletePatientAllergy(id: string): Promise<void>;

  getPatientNotes(patientId: string): Promise<PatientNote[]>;
  createPatientNote(n: InsertPatientNote): Promise<PatientNote>;
  updatePatientNote(id: string, data: Partial<Pick<InsertPatientNote, "content" | "status">> & { signedAt?: Date | null }): Promise<PatientNote | undefined>;

  getFamilyMembers(patientId: string): Promise<FamilyMember[]>;
  createFamilyMember(f: InsertFamilyMember): Promise<FamilyMember>;
  getFamilyMemberConditions(familyMemberId: string): Promise<FamilyMemberCondition[]>;
  createFamilyMemberCondition(c: InsertFamilyMemberCondition): Promise<FamilyMemberCondition>;
  getFamilyHistory(patientId: string): Promise<{ members: FamilyMember[]; conditions: FamilyMemberCondition[] }>;

  getEncounters(patientId?: string): Promise<Encounter[]>;
  getEncounter(id: string): Promise<Encounter | undefined>;
  createEncounter(e: InsertEncounter): Promise<Encounter>;
  updateEncounter(id: string, data: Partial<InsertEncounter>): Promise<Encounter | undefined>;

  getVitals(encounterId: string): Promise<Vitals[]>;
  getVitalsByPatientId(patientId: string): Promise<Vitals[]>;
  createVitals(v: InsertVitals): Promise<Vitals>;
  updateVitals(id: string, data: Partial<Pick<Vitals, "temperature" | "bloodPressureSystolic" | "bloodPressureDiastolic" | "heartRate" | "respiratoryRate" | "oxygenSaturation" | "weight" | "height" | "recordedAt">>): Promise<Vitals | undefined>;

  getAppointments(date?: string, startISO?: string, endISO?: string): Promise<Appointment[]>;
  getAppointmentsByPatientId(patientId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(a: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;

  getLabOrders(patientId?: string): Promise<LabOrder[]>;
  createLabOrder(l: InsertLabOrder): Promise<LabOrder>;
  updateLabOrder(id: string, data: Partial<InsertLabOrder>): Promise<LabOrder | undefined>;
  deleteLabOrder(id: string): Promise<void>;

  getImagingResults(patientId: string): Promise<ImagingResult[]>;
  createImagingResult(r: InsertImagingResult): Promise<ImagingResult>;

  getImagingOrders(patientId?: string): Promise<ImagingOrder[]>;
  createImagingOrder(o: InsertImagingOrder): Promise<ImagingOrder>;
  updateImagingOrder(id: string, data: Partial<InsertImagingOrder>): Promise<ImagingOrder | undefined>;
  deleteImagingOrder(id: string): Promise<void>;

  getPatientDocuments(patientId: string): Promise<PatientDocument[]>;
  createPatientDocument(d: InsertPatientDocument): Promise<PatientDocument>;

  getPrescriptions(patientId?: string): Promise<Prescription[]>;
  createPrescription(p: InsertPrescription): Promise<Prescription>;
  updatePrescription(id: string, data: Partial<InsertPrescription>): Promise<Prescription | undefined>;
  deletePrescription(id: string): Promise<void>;

  getInvoices(patientId?: string): Promise<Invoice[]>;
  createInvoice(i: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;

  getDashboardStats(): Promise<{
    totalPatients: number;
    todayAppointments: number;
    activeEncounters: number;
    pendingLabOrders: number;
    pendingInvoices: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getFacilities(): Promise<Facility[]> {
    return db.select().from(facilities).orderBy(facilities.name);
  }

  async getFacility(id: string): Promise<Facility | undefined> {
    const [f] = await db.select().from(facilities).where(eq(facilities.id, id));
    return f;
  }

  async createFacility(f: InsertFacility): Promise<Facility> {
    const [created] = await db.insert(facilities).values(f).returning();
    return created;
  }

  async getPatients(): Promise<Patient[]> {
    return db.select().from(patients).orderBy(desc(patients.createdAt));
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  }

  async searchPatients(query: string): Promise<Patient[]> {
    const tokens = String(query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
    if (tokens.length === 0) return [];

    const tokenFilters = tokens.map((t) => {
      const pattern = `%${t}%`;
      return or(
        ilike(patients.firstName, pattern),
        ilike(patients.lastName, pattern),
        ilike(patients.mrn, pattern),
        ilike(patients.nationalId, pattern),
        ilike(patients.phone, pattern),
      );
    });

    return db.select().from(patients).where(and(...tokenFilters));
  }

  async createPatient(p: InsertPatient): Promise<Patient> {
    const [created] = await db.insert(patients).values(p).returning();
    return created;
  }

  async updatePatient(id: string, data: Partial<InsertPatient>): Promise<Patient | undefined> {
    const [updated] = await db.update(patients).set(data).where(eq(patients.id, id)).returning();
    return updated;
  }

  async getPatientProblems(patientId: string): Promise<PatientProblem[]> {
    return db.select().from(patientProblems).where(eq(patientProblems.patientId, patientId)).orderBy(desc(patientProblems.createdAt));
  }

  async createPatientProblem(p: InsertPatientProblem): Promise<PatientProblem> {
    const [created] = await db.insert(patientProblems).values(p).returning();
    return created;
  }

  async updatePatientProblem(id: string, data: Partial<Omit<InsertPatientProblem, "patientId" | "addedBy">>): Promise<PatientProblem | undefined> {
    const [updated] = await db.update(patientProblems).set(data).where(eq(patientProblems.id, id)).returning();
    return updated;
  }

  async getPatientAllergies(patientId: string): Promise<PatientAllergy[]> {
    return db.select().from(patientAllergies).where(eq(patientAllergies.patientId, patientId)).orderBy(desc(patientAllergies.createdAt));
  }

  async createPatientAllergy(a: InsertPatientAllergy): Promise<PatientAllergy> {
    const [created] = await db.insert(patientAllergies).values(a).returning();
    return created;
  }

  async deletePatientAllergy(id: string): Promise<void> {
    await db.delete(patientAllergies).where(eq(patientAllergies.id, id));
  }

  async getPatientNotes(patientId: string): Promise<PatientNote[]> {
    return db.select().from(patientNotes).where(eq(patientNotes.patientId, patientId)).orderBy(desc(sql`coalesce(${patientNotes.signedAt}, ${patientNotes.createdAt})`));
  }

  async createPatientNote(n: InsertPatientNote): Promise<PatientNote> {
    const status = (n as { status?: string }).status ?? "signed";
    const signedAt = status === "incomplete" ? null : new Date();
    const [created] = await db.insert(patientNotes).values({ ...n, status, signedAt: signedAt as any }).returning();
    return created;
  }

  async updatePatientNote(id: string, data: Partial<Pick<InsertPatientNote, "content" | "status">> & { signedAt?: Date | null }): Promise<PatientNote | undefined> {
    const [updated] = await db.update(patientNotes).set(data).where(eq(patientNotes.id, id)).returning();
    return updated;
  }

  async getFamilyMembers(patientId: string): Promise<FamilyMember[]> {
    return db.select().from(familyMembers).where(eq(familyMembers.patientId, patientId));
  }

  async createFamilyMember(f: InsertFamilyMember): Promise<FamilyMember> {
    const [created] = await db.insert(familyMembers).values(f).returning();
    return created;
  }

  async getFamilyMemberConditions(familyMemberId: string): Promise<FamilyMemberCondition[]> {
    return db.select().from(familyMemberConditions).where(eq(familyMemberConditions.familyMemberId, familyMemberId));
  }

  async createFamilyMemberCondition(c: InsertFamilyMemberCondition): Promise<FamilyMemberCondition> {
    const [created] = await db.insert(familyMemberConditions).values(c).returning();
    return created;
  }

  async getFamilyHistory(patientId: string): Promise<{ members: FamilyMember[]; conditions: FamilyMemberCondition[] }> {
    const members = await this.getFamilyMembers(patientId);
    if (members.length === 0) return { members, conditions: [] };
    const conditions = await db.select().from(familyMemberConditions).where(inArray(familyMemberConditions.familyMemberId, members.map((m) => m.id)));
    return { members, conditions };
  }

  async getEncounters(patientId?: string): Promise<Encounter[]> {
    if (patientId) {
      return db.select().from(encounters).where(eq(encounters.patientId, patientId)).orderBy(desc(encounters.visitDate));
    }
    return db.select().from(encounters).orderBy(desc(encounters.visitDate));
  }

  async getEncounter(id: string): Promise<Encounter | undefined> {
    const [e] = await db.select().from(encounters).where(eq(encounters.id, id));
    return e;
  }

  async createEncounter(e: InsertEncounter): Promise<Encounter> {
    const [created] = await db.insert(encounters).values(e).returning();
    return created;
  }

  async updateEncounter(id: string, data: Partial<InsertEncounter>): Promise<Encounter | undefined> {
    const [updated] = await db.update(encounters).set(data).where(eq(encounters.id, id)).returning();
    return updated;
  }

  async getVitals(encounterId: string): Promise<Vitals[]> {
    return db.select().from(vitals).where(eq(vitals.encounterId, encounterId));
  }

  async getVitalsByPatientId(patientId: string): Promise<Vitals[]> {
    return db.select().from(vitals).where(eq(vitals.patientId, patientId)).orderBy(desc(vitals.recordedAt));
  }

  async createVitals(v: InsertVitals): Promise<Vitals> {
    const [created] = await db.insert(vitals).values(v).returning();
    return created;
  }

  async updateVitals(id: string, data: Partial<Pick<Vitals, "temperature" | "bloodPressureSystolic" | "bloodPressureDiastolic" | "heartRate" | "respiratoryRate" | "oxygenSaturation" | "weight" | "height" | "recordedAt">>): Promise<Vitals | undefined> {
    const payload: Record<string, unknown> = { ...data };
    if (payload.temperature != null) payload.temperature = String(payload.temperature);
    if (payload.weight != null) payload.weight = String(payload.weight);
    if (payload.height != null) payload.height = String(payload.height);
    if (payload.bloodPressureSystolic != null) payload.bloodPressureSystolic = parseInt(String(payload.bloodPressureSystolic), 10);
    if (payload.bloodPressureDiastolic != null) payload.bloodPressureDiastolic = parseInt(String(payload.bloodPressureDiastolic), 10);
    if (payload.heartRate != null) payload.heartRate = parseInt(String(payload.heartRate), 10);
    if (payload.respiratoryRate != null) payload.respiratoryRate = parseInt(String(payload.respiratoryRate), 10);
    if (payload.oxygenSaturation != null) payload.oxygenSaturation = parseInt(String(payload.oxygenSaturation), 10);
    const [updated] = await db.update(vitals).set(payload as any).where(eq(vitals.id, id)).returning();
    return updated;
  }

  async getAppointments(dateStr?: string, startISO?: string, endISO?: string): Promise<Appointment[]> {
    if (startISO && endISO) {
      return db
        .select()
        .from(appointments)
        .where(
          and(
            sql`${appointments.scheduledDate} >= ${startISO}::timestamptz`,
            sql`${appointments.scheduledDate} <= ${endISO}::timestamptz`
          )
        )
        .orderBy(appointments.scheduledDate);
    }
    if (dateStr) {
      return db
        .select()
        .from(appointments)
        .where(sql`${appointments.scheduledDate}::date = ${dateStr}::date`)
        .orderBy(appointments.scheduledDate);
    }
    return db.select().from(appointments).orderBy(desc(appointments.scheduledDate));
  }

  async getAppointmentsByPatientId(patientId: string): Promise<Appointment[]> {
    return db.select().from(appointments).where(eq(appointments.patientId, patientId)).orderBy(desc(appointments.scheduledDate));
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [a] = await db.select().from(appointments).where(eq(appointments.id, id));
    return a;
  }

  async createAppointment(a: InsertAppointment): Promise<Appointment> {
    const [created] = await db.insert(appointments).values(a).returning();
    return created;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updated] = await db.update(appointments).set(data).where(eq(appointments.id, id)).returning();
    return updated;
  }

  async getLabOrders(patientId?: string): Promise<LabOrder[]> {
    if (patientId) {
      return db.select().from(labOrders).where(eq(labOrders.patientId, patientId)).orderBy(desc(labOrders.createdAt));
    }
    return db.select().from(labOrders).orderBy(desc(labOrders.createdAt));
  }

  async createLabOrder(l: InsertLabOrder): Promise<LabOrder> {
    const [created] = await db.insert(labOrders).values(l).returning();
    return created;
  }

  async updateLabOrder(id: string, data: Partial<InsertLabOrder>): Promise<LabOrder | undefined> {
    const [updated] = await db.update(labOrders).set(data).where(eq(labOrders.id, id)).returning();
    return updated;
  }

  async deleteLabOrder(id: string): Promise<void> {
    await db.delete(labOrders).where(eq(labOrders.id, id));
  }

  async getImagingResults(patientId: string): Promise<ImagingResult[]> {
    return db.select().from(imagingResults).where(eq(imagingResults.patientId, patientId)).orderBy(desc(imagingResults.performedAt));
  }

  async createImagingResult(r: InsertImagingResult): Promise<ImagingResult> {
    const [created] = await db.insert(imagingResults).values(r).returning();
    return created;
  }

  async getImagingOrders(patientId?: string): Promise<ImagingOrder[]> {
    if (patientId) {
      return db.select().from(imagingOrders).where(eq(imagingOrders.patientId, patientId)).orderBy(desc(imagingOrders.createdAt));
    }
    return db.select().from(imagingOrders).orderBy(desc(imagingOrders.createdAt));
  }

  async createImagingOrder(o: InsertImagingOrder): Promise<ImagingOrder> {
    const [created] = await db.insert(imagingOrders).values(o).returning();
    return created;
  }

  async updateImagingOrder(id: string, data: Partial<InsertImagingOrder>): Promise<ImagingOrder | undefined> {
    const [updated] = await db.update(imagingOrders).set(data).where(eq(imagingOrders.id, id)).returning();
    return updated;
  }

  async deleteImagingOrder(id: string): Promise<void> {
    await db.delete(imagingOrders).where(eq(imagingOrders.id, id));
  }

  async getPatientDocuments(patientId: string): Promise<PatientDocument[]> {
    return db.select().from(patientDocuments).where(eq(patientDocuments.patientId, patientId)).orderBy(desc(patientDocuments.createdAt));
  }

  async createPatientDocument(d: InsertPatientDocument): Promise<PatientDocument> {
    const [created] = await db.insert(patientDocuments).values(d).returning();
    return created;
  }

  async getPrescriptions(patientId?: string): Promise<Prescription[]> {
    if (patientId) {
      return db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.createdAt));
    }
    return db.select().from(prescriptions).orderBy(desc(prescriptions.createdAt));
  }

  async createPrescription(p: InsertPrescription): Promise<Prescription> {
    const [created] = await db.insert(prescriptions).values(p).returning();
    return created;
  }

  async updatePrescription(id: string, data: Partial<InsertPrescription>): Promise<Prescription | undefined> {
    const [updated] = await db.update(prescriptions).set(data).where(eq(prescriptions.id, id)).returning();
    return updated;
  }

  async deletePrescription(id: string): Promise<void> {
    await db.delete(prescriptions).where(eq(prescriptions.id, id));
  }

  async getInvoices(patientId?: string): Promise<Invoice[]> {
    if (patientId) {
      return db.select().from(invoices).where(eq(invoices.patientId, patientId)).orderBy(desc(invoices.createdAt));
    }
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async createInvoice(i: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(i).returning();
    return created;
  }

  async updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [updated] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [pCount] = await db.select({ value: count() }).from(patients);
    const [aCount] = await db.select({ value: count() }).from(appointments)
      .where(and(
        sql`${appointments.scheduledDate} >= ${today.toISOString()}`,
        sql`${appointments.scheduledDate} < ${tomorrow.toISOString()}`
      ));
    const [eCount] = await db.select({ value: count() }).from(encounters)
      .where(eq(encounters.status, "in_progress"));
    const [lCount] = await db.select({ value: count() }).from(labOrders)
      .where(or(eq(labOrders.status, "ordered"), eq(labOrders.status, "collected")));
    const [iCount] = await db.select({ value: count() }).from(invoices)
      .where(eq(invoices.status, "pending"));

    return {
      totalPatients: pCount.value,
      todayAppointments: aCount.value,
      activeEncounters: eCount.value,
      pendingLabOrders: lCount.value,
      pendingInvoices: iCount.value,
    };
  }
}

export const storage = new DatabaseStorage();
