import { db } from "./db";
import { eq, like, or, desc, and, sql, count } from "drizzle-orm";
import {
  users, facilities, patients, encounters, vitals,
  appointments, labOrders, prescriptions, invoices, auditLogs,
  type InsertUser, type User, type InsertFacility, type Facility,
  type InsertPatient, type Patient, type InsertEncounter, type Encounter,
  type InsertVitals, type Vitals, type InsertAppointment, type Appointment,
  type InsertLabOrder, type LabOrder, type InsertPrescription, type Prescription,
  type InsertInvoice, type Invoice, type InsertAuditLog, type AuditLog,
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

  getEncounters(patientId?: string): Promise<Encounter[]>;
  getEncounter(id: string): Promise<Encounter | undefined>;
  createEncounter(e: InsertEncounter): Promise<Encounter>;
  updateEncounter(id: string, data: Partial<InsertEncounter>): Promise<Encounter | undefined>;

  getVitals(encounterId: string): Promise<Vitals[]>;
  createVitals(v: InsertVitals): Promise<Vitals>;

  getAppointments(date?: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(a: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;

  getLabOrders(patientId?: string): Promise<LabOrder[]>;
  createLabOrder(l: InsertLabOrder): Promise<LabOrder>;
  updateLabOrder(id: string, data: Partial<InsertLabOrder>): Promise<LabOrder | undefined>;

  getPrescriptions(patientId?: string): Promise<Prescription[]>;
  createPrescription(p: InsertPrescription): Promise<Prescription>;
  updatePrescription(id: string, data: Partial<InsertPrescription>): Promise<Prescription | undefined>;

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
    const pattern = `%${query}%`;
    return db.select().from(patients).where(
      or(
        like(patients.firstName, pattern),
        like(patients.lastName, pattern),
        like(patients.mrn, pattern),
        like(patients.nationalId, pattern),
        like(patients.phone, pattern),
      )
    );
  }

  async createPatient(p: InsertPatient): Promise<Patient> {
    const [created] = await db.insert(patients).values(p).returning();
    return created;
  }

  async updatePatient(id: string, data: Partial<InsertPatient>): Promise<Patient | undefined> {
    const [updated] = await db.update(patients).set(data).where(eq(patients.id, id)).returning();
    return updated;
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

  async createVitals(v: InsertVitals): Promise<Vitals> {
    const [created] = await db.insert(vitals).values(v).returning();
    return created;
  }

  async getAppointments(dateStr?: string): Promise<Appointment[]> {
    return db.select().from(appointments).orderBy(desc(appointments.scheduledDate));
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
