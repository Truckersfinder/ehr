import { db } from "./db";
import { eq, like, ilike, or, desc, and, sql, count, inArray, isNull, gte, asc, sum } from "drizzle-orm";
import {
  users, facilities, patients, patientProblems, patientAllergies, patientNotes, familyMembers, familyMemberConditions,
  encounters, vitals, appointments, commonVisitReasons, labOrders, imagingOrders, prescriptions, invoices, billingChargeCatalog, encounterVisitCharges, imagingResults, patientDocuments, auditLogs,
  followUpContacts,
  type InsertUser, type User, type InsertFacility, type Facility,
  type InsertPatient, type Patient, type InsertPatientProblem, type PatientProblem,
  type InsertPatientAllergy, type PatientAllergy, type InsertPatientNote, type PatientNote, type InsertFamilyMember, type FamilyMember,
  type InsertFamilyMemberCondition, type FamilyMemberCondition, type InsertEncounter, type Encounter,
  type InsertVitals, type Vitals, type InsertAppointment, type Appointment, type CommonVisitReason,
  type InsertLabOrder, type LabOrder, type InsertImagingOrder, type ImagingOrder,
  type InsertPrescription, type Prescription, type InsertImagingResult, type ImagingResult,
  type InsertPatientDocument, type PatientDocument, type InsertInvoice, type Invoice,
  type BillingChargeCatalog, type InsertBillingChargeCatalog, type InsertAuditLog, type AuditLog,
  type InsertFollowUpContact, type FollowUpContact,
  type EncounterVisitCharge, type InsertEncounterVisitCharge,
} from "@shared/schema";
import { BILLING_CHARGE_CATALOG_SEEDS, buildLabOrderBillingChargeSeeds, VISIT_CHARGE_EXTRA_CATALOG_ROWS } from "@shared/billing-charge-seeds";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(id: string, passwordHash: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;

  getFacilities(): Promise<Facility[]>;
  getFacility(id: string): Promise<Facility | undefined>;
  createFacility(f: InsertFacility): Promise<Facility>;
  updateFacility(id: string, data: Partial<InsertFacility>): Promise<Facility | undefined>;

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
  updatePatientNote(
    id: string,
    data: Partial<Pick<InsertPatientNote, "content" | "status" | "encounterId">> & { signedAt?: Date | null },
  ): Promise<PatientNote | undefined>;

  getFamilyMembers(patientId: string): Promise<FamilyMember[]>;
  createFamilyMember(f: InsertFamilyMember): Promise<FamilyMember>;
  getFamilyMemberConditions(familyMemberId: string): Promise<FamilyMemberCondition[]>;
  createFamilyMemberCondition(c: InsertFamilyMemberCondition): Promise<FamilyMemberCondition>;
  getFamilyHistory(patientId: string): Promise<{ members: FamilyMember[]; conditions: FamilyMemberCondition[] }>;

  getEncounters(patientId?: string): Promise<Encounter[]>;
  /** Appointments whose scheduled time falls in [startISO, endISO] (use client local day bounds, same as Schedule). */
  getBillingAppointmentsForRange(
    startISO: string,
    endISO: string,
  ): Promise<
    {
      appointment: Appointment;
      patient: Patient;
      encounter: Encounter | null;
      visitChargeTotal: string;
      billingCurrency: string;
      chargesFinalizedAt: Date | null;
    }[]
  >;
  getEncounter(id: string): Promise<Encounter | undefined>;
  /** Latest encounter linked to a schedule appointment (for reopening a signed visit). */
  getEncounterByAppointmentId(appointmentId: string): Promise<Encounter | undefined>;
  createEncounter(e: InsertEncounter): Promise<Encounter>;
  updateEncounter(id: string, data: Partial<InsertEncounter>): Promise<Encounter | undefined>;
  /** Schedule-linked encounter only (appointmentId set); else null */
  getVisitSummaryForEncounter(encounterId: string): Promise<{
    encounter: Encounter;
    patient: Patient;
    appointment: Appointment | null;
    labOrders: LabOrder[];
    imagingOrders: ImagingOrder[];
    prescriptions: Prescription[];
    vitals: Vitals[];
    notes: PatientNote[];
    imagingResults: ImagingResult[];
    allergiesDocumentedThisVisit: PatientAllergy[];
    visitCharges: EncounterVisitCharge[];
    billingCurrency: string;
  } | null>;

  getVitals(encounterId: string): Promise<Vitals[]>;
  getVitalsByPatientId(patientId: string): Promise<Vitals[]>;
  createVitals(v: InsertVitals): Promise<Vitals>;
  updateVitals(id: string, data: Partial<Pick<Vitals, "temperature" | "bloodPressureSystolic" | "bloodPressureDiastolic" | "heartRate" | "respiratoryRate" | "oxygenSaturation" | "weight" | "height" | "recordedAt">>): Promise<Vitals | undefined>;

  getAppointments(date?: string, startISO?: string, endISO?: string): Promise<Appointment[]>;
  getAppointmentsByPatientId(patientId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  createAppointment(a: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;

  getCommonVisitReasons(): Promise<CommonVisitReason[]>;
  /** Inserts default rows if table is empty (idempotent). */
  ensureCommonVisitReasonsSeeded(): Promise<void>;

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

  getFollowUpContacts(patientId?: string): Promise<FollowUpContact[]>;
  createFollowUpContact(c: InsertFollowUpContact): Promise<FollowUpContact>;

  getPrescriptions(patientId?: string): Promise<Prescription[]>;
  createPrescription(p: InsertPrescription): Promise<Prescription>;
  updatePrescription(id: string, data: Partial<InsertPrescription>): Promise<Prescription | undefined>;
  deletePrescription(id: string): Promise<void>;

  getInvoices(patientId?: string): Promise<Invoice[]>;
  createInvoice(i: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  getInvoiceByEncounterId(encounterId: string): Promise<Invoice | undefined>;
  /** Creates or updates a pending invoice from current encounter visit charges. */
  upsertPendingInvoiceForEncounter(encounterId: string): Promise<Invoice>;

  getBillingChargeCatalog(): Promise<BillingChargeCatalog[]>;
  createBillingChargeCatalogItem(row: InsertBillingChargeCatalog): Promise<BillingChargeCatalog>;
  updateBillingChargeCatalogItem(
    id: string,
    data: Partial<Pick<InsertBillingChargeCatalog, "unitPrice" | "label" | "sortOrder">>,
  ): Promise<BillingChargeCatalog | undefined>;
  ensureBillingChargeCatalogSeeded(): Promise<void>;
  /** If there are no lab_order rows yet, seed from the common clinician list (does not overwrite uploads). */
  ensureLabOrderBillingChargesSyncedFromCommonList(): Promise<void>;
  /** Deletes all rows for the category and inserts the new list (full replace). */
  replaceBillingChargeCatalogForCategory(
    category: InsertBillingChargeCatalog["category"],
    rows: InsertBillingChargeCatalog[],
  ): Promise<number>;

  getBillingChargeCatalogItem(
    category: BillingChargeCatalog["category"],
    itemKey: string,
  ): Promise<BillingChargeCatalog | undefined>;
  /** Ensures visit-type and imaging default price keys exist (idempotent, for DB upgrades). */
  ensureVisitChargeCatalogKeys(): Promise<void>;
  /** Ensures DB enum includes `manual` for price-list add-ons (idempotent). */
  ensureVisitChargeLineKindManualEnum(): Promise<void>;
  /** Ensures encounter columns exist for charge finalization (idempotent). */
  ensureEncounterChargeFinalizationColumns(): Promise<void>;
  getEncounterVisitCharges(encounterId: string): Promise<EncounterVisitCharge[]>;
  tryInsertEncounterVisitCharge(row: InsertEncounterVisitCharge): Promise<boolean>;
  /** Removes a line by stable source id (e.g. order id) regardless of encounter. */
  deleteEncounterVisitChargeByKindAndSource(
    lineKind: InsertEncounterVisitCharge["lineKind"],
    sourceId: string,
  ): Promise<void>;
  /** Deletes a manual catalog line by id (must belong to encounter). */
  deleteEncounterVisitChargeManualLine(encounterId: string, chargeId: string): Promise<boolean>;
  finalizeEncounterCharges(encounterId: string, userId: string): Promise<Encounter | undefined>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  getBillingRevenueStatsForRange(
    startISO: string,
    endISO: string,
    facilityId?: string | null,
  ): Promise<{ revenue: number; outstanding: number }>;

  /** Encounters still open whose opened time is in [startISO, endISO]. */
  getOpenEncountersForRange(startISO: string, endISO: string): Promise<Encounter[]>;

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

  async updateUserPassword(id: string, passwordHash: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ password: passwordHash }).where(eq(users.id, id)).returning();
    return updated;
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

  async updateFacility(id: string, data: Partial<InsertFacility>): Promise<Facility | undefined> {
    const [updated] = await db.update(facilities).set(data).where(eq(facilities.id, id)).returning();
    return updated;
  }

  async getPatients(): Promise<Patient[]> {
    return db.select().from(patients).orderBy(desc(patients.createdAt));
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  }

  async searchPatients(query: string): Promise<Patient[]> {
    // Normalize: commas → space, collapse whitespace, strip LIKE metacharacters from user input
    const raw = String(query ?? "")
      .trim()
      .replace(/,/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[%_\\]/g, "")
      .slice(0, 200);
    if (!raw) return [];

    const pattern = `%${raw}%`;

    /**
     * Previous logic AND-ed each whitespace token (each had to match some field). That broke
     * common cases: extra words, "Last, First", middle names, or "Last First" vs stored "First Last".
     * Match on each name part, full name both orders, MRN, ID, and phone.
     */
    const fullNameFwd = sql`(TRIM(COALESCE(${patients.firstName}, '')) || ' ' || TRIM(COALESCE(${patients.lastName}, '')))`;
    const fullNameRev = sql`(TRIM(COALESCE(${patients.lastName}, '')) || ' ' || TRIM(COALESCE(${patients.firstName}, '')))`;

    return db
      .select()
      .from(patients)
      .where(
        or(
          ilike(patients.firstName, pattern),
          ilike(patients.lastName, pattern),
          sql`${fullNameFwd} ILIKE ${pattern}`,
          sql`${fullNameRev} ILIKE ${pattern}`,
          ilike(patients.mrn, pattern),
          ilike(patients.nationalId, pattern),
          ilike(patients.phone, pattern),
        ),
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

  async updatePatientNote(
    id: string,
    data: Partial<Pick<InsertPatientNote, "content" | "status" | "encounterId">> & { signedAt?: Date | null },
  ): Promise<PatientNote | undefined> {
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

  async getBillingAppointmentsForRange(
    startISO: string,
    endISO: string,
  ): Promise<
    {
      appointment: Appointment;
      patient: Patient;
      encounter: Encounter | null;
      visitChargeTotal: string;
      billingCurrency: string;
      chargesFinalizedAt: Date | null;
    }[]
  > {
    const appts = await this.getAppointments(undefined, startISO, endISO);
    const out: {
      appointment: Appointment;
      patient: Patient;
      encounter: Encounter | null;
      visitChargeTotal: string;
      billingCurrency: string;
      chargesFinalizedAt: Date | null;
    }[] = [];
    for (const appt of appts) {
      const patient = await this.getPatient(appt.patientId);
      if (!patient) continue;
      const encounter = await this.getEncounterByAppointmentId(appt.id);
      let visitChargeTotal = "0";
      let billingCurrency = "KES";
      let chargesFinalizedAt: Date | null = null;
      const effectiveFacilityId = encounter?.facilityId ?? appt.facilityId ?? patient.facilityId ?? null;
      if (effectiveFacilityId) {
        const fac = await this.getFacility(effectiveFacilityId);
        if (fac?.billingCurrency) billingCurrency = fac.billingCurrency;
      }
      if (encounter) {
        // Once charges are finalized, this visit leaves “Today’s visit” and is handled in Pending Payment via invoice.
        if ((encounter as any).chargesFinalizedAt) continue;
        const charges = await this.getEncounterVisitCharges(encounter.id);
        const total = charges.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
        visitChargeTotal = String(Math.round(total * 100) / 100);
        chargesFinalizedAt = ((encounter as any).chargesFinalizedAt ?? null) as any;
      }
      out.push({
        appointment: appt,
        patient,
        encounter: encounter ?? null,
        visitChargeTotal,
        billingCurrency,
        chargesFinalizedAt,
      });
    }
    return out;
  }

  async getEncounter(id: string): Promise<Encounter | undefined> {
    const [e] = await db.select().from(encounters).where(eq(encounters.id, id));
    return e;
  }

  async getEncounterByAppointmentId(appointmentId: string): Promise<Encounter | undefined> {
    const rows = await db
      .select()
      .from(encounters)
      .where(eq(encounters.appointmentId, appointmentId))
      .orderBy(desc(encounters.createdAt))
      .limit(1);
    return rows[0];
  }

  async createEncounter(e: InsertEncounter): Promise<Encounter> {
    const [created] = await db.insert(encounters).values(e).returning();
    return created;
  }

  async updateEncounter(id: string, data: Partial<InsertEncounter>): Promise<Encounter | undefined> {
    const [updated] = await db.update(encounters).set(data).where(eq(encounters.id, id)).returning();
    return updated;
  }

  async getVisitSummaryForEncounter(encounterId: string): Promise<{
    encounter: Encounter;
    patient: Patient;
    appointment: Appointment | null;
    labOrders: LabOrder[];
    imagingOrders: ImagingOrder[];
    prescriptions: Prescription[];
    vitals: Vitals[];
    notes: PatientNote[];
    imagingResults: ImagingResult[];
    allergiesDocumentedThisVisit: PatientAllergy[];
    visitCharges: EncounterVisitCharge[];
    billingCurrency: string;
  } | null> {
    const encounter = await this.getEncounter(encounterId);
    if (!encounter) return null;
    const patient = await this.getPatient(encounter.patientId);
    if (!patient) return null;
    const appointment = encounter.appointmentId ? await this.getAppointment(encounter.appointmentId) : undefined;
    const encounterStart = encounter.createdAt ?? new Date(0);
    const [labList, imagingOrderList, rxList, vitalsList, imgResults, allergyList] = await Promise.all([
      db.select().from(labOrders).where(eq(labOrders.encounterId, encounterId)),
      db.select().from(imagingOrders).where(eq(imagingOrders.encounterId, encounterId)),
      db.select().from(prescriptions).where(eq(prescriptions.encounterId, encounterId)),
      this.getVitals(encounterId),
      db.select().from(imagingResults).where(eq(imagingResults.encounterId, encounterId)),
      db
        .select()
        .from(patientAllergies)
        .where(
          and(eq(patientAllergies.patientId, encounter.patientId), gte(patientAllergies.createdAt, encounterStart)),
        )
        .orderBy(desc(patientAllergies.createdAt)),
    ]);
    const notesList = await db
      .select()
      .from(patientNotes)
      .where(
        and(
          eq(patientNotes.patientId, encounter.patientId),
          or(
            eq(patientNotes.encounterId, encounterId),
            and(
              isNull(patientNotes.encounterId),
              gte(patientNotes.createdAt, encounter.createdAt ?? new Date(0)),
            ),
          ),
        ),
      )
      .orderBy(desc(sql`coalesce(${patientNotes.signedAt}, ${patientNotes.createdAt})`));
    const visitChargeList = await this.getEncounterVisitCharges(encounterId);
    let billingCurrency = "KES";
    const effectiveFacilityId = encounter.facilityId ?? appointment?.facilityId ?? patient.facilityId ?? null;
    if (effectiveFacilityId) {
      const fac = await this.getFacility(effectiveFacilityId);
      if (fac?.billingCurrency) billingCurrency = fac.billingCurrency;
    }

    return {
      encounter,
      patient,
      appointment: appointment ?? null,
      labOrders: labList,
      imagingOrders: imagingOrderList,
      prescriptions: rxList,
      vitals: vitalsList,
      notes: notesList,
      imagingResults: imgResults,
      allergiesDocumentedThisVisit: allergyList,
      visitCharges: visitChargeList,
      billingCurrency,
    };
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

  async getCommonVisitReasons(): Promise<CommonVisitReason[]> {
    return db
      .select()
      .from(commonVisitReasons)
      .where(eq(commonVisitReasons.isActive, true))
      .orderBy(asc(commonVisitReasons.sortOrder), asc(commonVisitReasons.label));
  }

  async ensureCommonVisitReasonsSeeded(): Promise<void> {
    const [row] = await db.select({ n: count() }).from(commonVisitReasons);
    if ((row?.n ?? 0) > 0) return;
    const defaults: { label: string; sortOrder: number; isActive: boolean }[] = [
      { label: "Annual physical / wellness visit", sortOrder: 10, isActive: true },
      { label: "Follow-up visit", sortOrder: 20, isActive: true },
      { label: "Sick visit / acute complaint", sortOrder: 30, isActive: true },
      { label: "Chronic disease management", sortOrder: 40, isActive: true },
      { label: "Medication refill / review", sortOrder: 50, isActive: true },
      { label: "Lab results review", sortOrder: 60, isActive: true },
      { label: "Post-operative check", sortOrder: 70, isActive: true },
      { label: "Vaccination / immunization", sortOrder: 80, isActive: true },
      { label: "Mental health visit", sortOrder: 90, isActive: true },
      { label: "Other", sortOrder: 100, isActive: true },
    ];
    await db.insert(commonVisitReasons).values(defaults);
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

  async getFollowUpContacts(patientId?: string): Promise<FollowUpContact[]> {
    if (patientId) {
      return db.select().from(followUpContacts).where(eq(followUpContacts.patientId, patientId)).orderBy(desc(followUpContacts.createdAt));
    }
    return db.select().from(followUpContacts).orderBy(desc(followUpContacts.createdAt));
  }

  async createFollowUpContact(c: InsertFollowUpContact): Promise<FollowUpContact> {
    const [created] = await db.insert(followUpContacts).values(c).returning();
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

  async getBillingChargeCatalog(): Promise<BillingChargeCatalog[]> {
    return db
      .select()
      .from(billingChargeCatalog)
      .orderBy(asc(billingChargeCatalog.category), asc(billingChargeCatalog.sortOrder), asc(billingChargeCatalog.label));
  }

  async createBillingChargeCatalogItem(row: InsertBillingChargeCatalog): Promise<BillingChargeCatalog> {
    const [created] = await db.insert(billingChargeCatalog).values(row).returning();
    return created;
  }

  async updateBillingChargeCatalogItem(
    id: string,
    data: Partial<Pick<InsertBillingChargeCatalog, "unitPrice" | "label" | "sortOrder">>,
  ): Promise<BillingChargeCatalog | undefined> {
    const [updated] = await db
      .update(billingChargeCatalog)
      .set({ ...data, updatedAt: sql`now()` })
      .where(eq(billingChargeCatalog.id, id))
      .returning();
    return updated;
  }

  async ensureBillingChargeCatalogSeeded(): Promise<void> {
    const [row] = await db.select({ n: count() }).from(billingChargeCatalog);
    if ((row?.n ?? 0) > 0) return;
    await db.insert(billingChargeCatalog).values(BILLING_CHARGE_CATALOG_SEEDS);
  }

  async ensureLabOrderBillingChargesSyncedFromCommonList(): Promise<void> {
    const [row] = await db
      .select({ n: count() })
      .from(billingChargeCatalog)
      .where(eq(billingChargeCatalog.category, "lab_order"));
    if ((row?.n ?? 0) > 0) return;
    const seeds = buildLabOrderBillingChargeSeeds();
    if (seeds.length) await db.insert(billingChargeCatalog).values(seeds);
  }

  async replaceBillingChargeCatalogForCategory(
    category: InsertBillingChargeCatalog["category"],
    rows: InsertBillingChargeCatalog[],
  ): Promise<number> {
    await db.transaction(async (tx) => {
      await tx.delete(billingChargeCatalog).where(eq(billingChargeCatalog.category, category));
      if (rows.length > 0) {
        await tx.insert(billingChargeCatalog).values(rows);
      }
    });
    return rows.length;
  }

  async getBillingChargeCatalogItem(
    category: BillingChargeCatalog["category"],
    itemKey: string,
  ): Promise<BillingChargeCatalog | undefined> {
    const [row] = await db
      .select()
      .from(billingChargeCatalog)
      .where(and(eq(billingChargeCatalog.category, category), eq(billingChargeCatalog.itemKey, itemKey)))
      .limit(1);
    return row;
  }

  async ensureVisitChargeCatalogKeys(): Promise<void> {
    for (const row of VISIT_CHARGE_EXTRA_CATALOG_ROWS) {
      await db
        .insert(billingChargeCatalog)
        .values(row)
        .onConflictDoNothing({ target: [billingChargeCatalog.category, billingChargeCatalog.itemKey] });
    }
  }

  async ensureVisitChargeLineKindManualEnum(): Promise<void> {
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'visit_charge_line_kind' AND e.enumlabel = 'manual'
  ) THEN
    ALTER TYPE visit_charge_line_kind ADD VALUE 'manual';
  END IF;
END $$;
`));
  }

  async ensureEncounterChargeFinalizationColumns(): Promise<void> {
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'encounters' AND column_name = 'charges_finalized_at'
  ) THEN
    ALTER TABLE encounters ADD COLUMN charges_finalized_at timestamp;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'encounters' AND column_name = 'charges_finalized_by'
  ) THEN
    ALTER TABLE encounters ADD COLUMN charges_finalized_by varchar;
  END IF;
END $$;
`));
  }

  async getEncounterVisitCharges(encounterId: string): Promise<EncounterVisitCharge[]> {
    const rows = await db
      .select()
      .from(encounterVisitCharges)
      .where(eq(encounterVisitCharges.encounterId, encounterId))
      .orderBy(asc(encounterVisitCharges.createdAt));

    // Safety: if a clinic-administered medication order is later discontinued, it must not appear in visit charges.
    const rxChargeRows = rows.filter((r) => r.lineKind === "prescription");
    if (rxChargeRows.length > 0) {
      const rxIds = Array.from(new Set(rxChargeRows.map((r) => r.sourceId).filter(Boolean)));
      if (rxIds.length > 0) {
        const rxList = await db
          .select({ id: prescriptions.id, status: prescriptions.status })
          .from(prescriptions)
          .where(inArray(prescriptions.id, rxIds));
        const statusById = new Map(rxList.map((r) => [r.id, r.status]));
        return rows.filter((r) => {
          if (r.lineKind !== "prescription") return true;
          const st = statusById.get(r.sourceId);
          return st !== "cancelled";
        });
      }
    }

    return rows;
  }

  async tryInsertEncounterVisitCharge(row: InsertEncounterVisitCharge): Promise<boolean> {
    const existing = await db
      .select({ id: encounterVisitCharges.id })
      .from(encounterVisitCharges)
      .where(
        and(
          eq(encounterVisitCharges.encounterId, row.encounterId),
          eq(encounterVisitCharges.lineKind, row.lineKind),
          eq(encounterVisitCharges.sourceId, row.sourceId),
        ),
      )
      .limit(1);
    if (existing.length) return false;
    await db.insert(encounterVisitCharges).values(row);
    return true;
  }

  async deleteEncounterVisitChargeByKindAndSource(
    lineKind: InsertEncounterVisitCharge["lineKind"],
    sourceId: string,
  ): Promise<void> {
    await db
      .delete(encounterVisitCharges)
      .where(and(eq(encounterVisitCharges.lineKind, lineKind), eq(encounterVisitCharges.sourceId, sourceId)));
  }

  async deleteEncounterVisitChargeManualLine(encounterId: string, chargeId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: encounterVisitCharges.id })
      .from(encounterVisitCharges)
      .where(
        and(
          eq(encounterVisitCharges.id, chargeId),
          eq(encounterVisitCharges.encounterId, encounterId),
          eq(encounterVisitCharges.lineKind, "manual"),
        ),
      )
      .limit(1);
    if (!row) return false;
    await db.delete(encounterVisitCharges).where(eq(encounterVisitCharges.id, chargeId));
    return true;
  }

  async finalizeEncounterCharges(encounterId: string, userId: string): Promise<Encounter | undefined> {
    const [enc] = await db.select().from(encounters).where(eq(encounters.id, encounterId)).limit(1);
    if (!enc) return undefined;
    if (enc.status !== "completed") {
      throw new Error("Charges can only be finalized after the visit is completed.");
    }
    if ((enc as any).chargesFinalizedAt) return enc;
    const [updated] = await db
      .update(encounters)
      .set({ chargesFinalizedAt: new Date(), chargesFinalizedBy: userId } as any)
      .where(eq(encounters.id, encounterId))
      .returning();
    // Once finalized, ensure there is a pending invoice for payment.
    await this.upsertPendingInvoiceForEncounter(encounterId);
    return updated;
  }

  async getInvoiceByEncounterId(encounterId: string): Promise<Invoice | undefined> {
    const [row] = await db.select().from(invoices).where(eq(invoices.encounterId, encounterId)).limit(1);
    return row;
  }

  async upsertPendingInvoiceForEncounter(encounterId: string): Promise<Invoice> {
    const encounter = await this.getEncounter(encounterId);
    if (!encounter) throw new Error("Encounter not found");
    const patient = await this.getPatient(encounter.patientId);
    if (!patient) throw new Error("Patient not found");
    const charges = await this.getEncounterVisitCharges(encounterId);
    const total = charges.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);
    const items = charges.map((c) => ({
      description: c.description,
      amount: Number(c.amount ?? 0),
    }));
    const effectiveFacilityId = encounter.facilityId ?? patient.facilityId ?? null;
    const existing = await this.getInvoiceByEncounterId(encounterId);
    if (!existing) {
      const [created] = await db
        .insert(invoices)
        .values({
          encounterId,
          patientId: encounter.patientId,
          facilityId: effectiveFacilityId ?? undefined,
          totalAmount: String(Math.round(total * 100) / 100),
          paidAmount: "0",
          status: "pending",
          items: items as any,
          paymentMethod: null,
        } as any)
        .returning();
      return created;
    }
    // Do not overwrite paid/cancelled invoices.
    if (existing.status === "paid" || existing.status === "cancelled") return existing;
    const [updated] = await db
      .update(invoices)
      .set({
        totalAmount: String(Math.round(total * 100) / 100),
        items: items as any,
        status: existing.status === "partial" ? "partial" : "pending",
      } as any)
      .where(eq(invoices.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(limit = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async getBillingRevenueStatsForRange(
    startISO: string,
    endISO: string,
    facilityId?: string | null,
  ): Promise<{ revenue: number; outstanding: number }> {
    const whereParts = [
      sql`${invoices.createdAt} >= ${startISO}::timestamptz`,
      sql`${invoices.createdAt} <= ${endISO}::timestamptz`,
    ];
    if (facilityId) {
      whereParts.push(eq(invoices.facilityId, facilityId));
    }
    const where = and(...(whereParts as any));

    const [row] = await db
      .select({
        revenue: sum(invoices.paidAmount),
        total: sum(invoices.totalAmount),
      })
      .from(invoices)
      .where(where);

    const revenue = Number(row?.revenue ?? 0);
    const total = Number(row?.total ?? 0);
    const outstanding = Math.max(0, total - revenue);
    return { revenue, outstanding };
  }

  async getOpenEncountersForRange(startISO: string, endISO: string): Promise<Encounter[]> {
    return db
      .select()
      .from(encounters)
      .where(
        and(
          eq(encounters.status, "in_progress"),
          sql`${encounters.createdAt} >= ${startISO}::timestamptz`,
          sql`${encounters.createdAt} <= ${endISO}::timestamptz`,
        ),
      )
      .orderBy(desc(encounters.createdAt));
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
