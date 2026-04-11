import { randomBytes } from "crypto";
import { db, pool } from "./db";
import { eq, like, ilike, or, desc, and, sql, count, inArray, isNull, isNotNull, gte, asc, sum } from "drizzle-orm";
import type { SystemsDashboardSnapshot } from "@shared/systems-admin-dashboard";
import { normalizeUiActivityLayoutRows, type UiActivityLayoutRow } from "@shared/application-ui";
import {
  users, facilities, patients, patientProblems, patientAllergies, patientNotes, familyMembers, familyMemberConditions,
  encounters, vitals, appointments, commonVisitReasons, beds, bedAssignments, labOrders, imagingOrders, prescriptions, medicationAdministrations, invoices, billingChargeCatalog, encounterVisitCharges, imagingResults, patientDocuments, auditLogs, clinicalForms, clinicalFormPatientCompletions,
  encounterMedicationAdministrations,
  followUpContacts,
  type InsertUser, type User, type InsertFacility, type Facility,
  type InsertPatient, type Patient, type InsertPatientProblem, type PatientProblem,
  type InsertPatientAllergy, type PatientAllergy, type InsertPatientNote, type PatientNote, type InsertFamilyMember, type FamilyMember,
  type InsertFamilyMemberCondition, type FamilyMemberCondition, type InsertEncounter, type Encounter,
  type InsertVitals, type Vitals, type InsertAppointment, type Appointment, type CommonVisitReason, type InsertBed, type Bed, type InsertBedAssignment, type BedAssignment,
  type InsertLabOrder, type LabOrder, type InsertImagingOrder, type ImagingOrder,
  type InsertPrescription, type Prescription, type InsertImagingResult, type ImagingResult,
  type InsertMedicationAdministration, type MedicationAdministration,
  type InsertEncounterMedicationAdministration, type EncounterMedicationAdministration,
  type InsertPatientDocument, type PatientDocument, type InsertInvoice, type Invoice,
  type BillingChargeCatalog, type InsertBillingChargeCatalog, type InsertAuditLog, type AuditLog,
  type ClinicalForm, type ClinicalFormField, type ClinicalFormPatientCompletion,
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

  /** Bed Management */
  getBeds(facilityId?: string): Promise<Bed[]>;
  createBed(b: InsertBed): Promise<Bed>;
  updateBed(id: string, data: Partial<InsertBed>): Promise<Bed | undefined>;
  getAvailableBeds(facilityId?: string): Promise<Bed[]>;
  bedHasActiveAssignment(bedId: string): Promise<boolean>;
  getOccupiedBedIds(facilityId?: string | null): Promise<Set<string>>;
  /** Bed id → "First Last" for active (not discharged) admissions; scoped like `getBeds`. */
  getActivePatientDisplayByBedId(facilityId?: string): Promise<Map<string, string>>;
  setBedOnHold(id: string, reason: string): Promise<Bed | undefined>;
  setBedRemoved(id: string, reason: string): Promise<Bed | undefined>;
  setBedRestoredToOpen(id: string): Promise<Bed | undefined>;

  /** Admissions */
  createBedAssignment(a: InsertBedAssignment): Promise<BedAssignment>;
  getBedAssignment(id: string): Promise<BedAssignment | undefined>;
  getActiveBedAssignmentByPatientId(patientId: string): Promise<BedAssignment | undefined>;
  getActiveAdmissions(facilityId?: string): Promise<(BedAssignment & { bedName: string; clinicianId: string; scheduledDate: Date; status: string; reason: string | null })[]>;
  getRecentDischargedAdmissions(
    facilityId?: string,
    days?: number,
  ): Promise<(BedAssignment & { bedName: string; clinicianId: string | null; scheduledDate: Date | null; status: string | null; reason: string | null })[]>;
  attachEncounterToActiveAdmission(appointmentId: string, encounterId: string): Promise<BedAssignment | undefined>;
  attachEncounterToBedAssignment(assignmentId: string, encounterId: string): Promise<BedAssignment | undefined>;
  getAdmissionLabOrders(admissionId: string): Promise<LabOrder[]>;
  getAdmissionImagingOrders(admissionId: string): Promise<ImagingOrder[]>;
  getAdmissionPrescriptions(admissionId: string): Promise<Prescription[]>;
  getMedicationAdministrations(admissionId: string): Promise<MedicationAdministration[]>;
  createMedicationAdministration(a: InsertMedicationAdministration): Promise<MedicationAdministration>;
  getEncounterMedicationAdministrations(encounterId: string): Promise<EncounterMedicationAdministration[]>;
  createEncounterMedicationAdministration(a: InsertEncounterMedicationAdministration): Promise<EncounterMedicationAdministration>;
  dischargeBedAssignment(
    assignmentId: string,
    data: {
      dischargedBy: string;
      dischargeReason: string;
      dischargeNotes?: string | null;
      causeOfDeath?: string | null;
      timeOfDeath?: Date | null;
    }
  ): Promise<BedAssignment | undefined>;

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
  /** Ensures prescriptions.route exists (idempotent). */
  ensurePrescriptionRouteColumn(): Promise<void>;
  /** Ensures prescriptions.rate exists (idempotent). */
  ensurePrescriptionRateColumn(): Promise<void>;
  /** Ensures encounter_medication_administrations exists (idempotent). */
  ensureEncounterMedicationAdministrationsTable(): Promise<void>;
  /** Ensures beds / bed_assignments tables exist (idempotent; for DBs not yet drizzle-pushed). */
  ensureBedsAndBedAssignmentsTables(): Promise<void>;
  /** Ensures clinical_forms table exists (idempotent). */
  ensureClinicalFormsTable(): Promise<void>;
  /** Facility org branding columns + RBAC / column override tables. */
  ensureFacilityOrganizationAndRoleTables(): Promise<void>;
  getRoleCapabilityOverridesForRole(role: string): Promise<{ capabilityId: string; allowed: boolean }[]>;
  upsertRoleCapabilityOverride(role: string, capabilityId: string, allowed: boolean): Promise<void>;
  listUiTableColumnOverrides(): Promise<
    {
      role: string;
      tableKey: string;
      columnId: string;
      hidden: boolean;
      label: string | null;
      sortOrder: number | null;
    }[]
  >;
  upsertUiTableColumnOverride(args: {
    role: string;
    tableKey: string;
    columnId: string;
    hidden?: boolean;
    label?: string | null;
    sortOrder?: number | null;
  }): Promise<void>;
  deleteUiTableColumnOverride(role: string, tableKey: string, columnId: string): Promise<void>;
  setUiTableColumnOrder(role: string, tableKey: string, orderedColumnIds: string[]): Promise<void>;
  getClinicalForms(): Promise<ClinicalForm[]>;
  getClinicalFormById(id: string): Promise<ClinicalForm | undefined>;
  createClinicalForm(entry: {
    title: string;
    description?: string | null;
    fields: ClinicalFormField[];
    templateKind: "form" | "consent";
    createdByUserId?: string | null;
  }): Promise<ClinicalForm>;
  updateClinicalForm(
    id: string,
    entry: { title: string; description?: string | null; fields: ClinicalFormField[]; templateKind: "form" | "consent" },
  ): Promise<ClinicalForm | undefined>;
  setClinicalFormActive(id: string, isActive: boolean): Promise<ClinicalForm | undefined>;
  ensureClinicalFormPatientCompletionsTable(): Promise<void>;
  deletePendingQrCompletionsForPatientForm(patientId: string, formId: string): Promise<void>;
  createPendingQrFormCompletion(args: {
    patientId: string;
    formId: string;
  }): Promise<{ row: ClinicalFormPatientCompletion; token: string; expiresAt: Date }>;
  getClinicalFormCompletionByQrToken(token: string): Promise<ClinicalFormPatientCompletion | undefined>;
  completeClinicalFormPatientCompletion(
    id: string,
    args: { answers: Record<string, string | number | boolean>; completedByUserId?: string | null },
  ): Promise<ClinicalFormPatientCompletion | undefined>;
  createStaffAssistedClinicalFormCompletion(args: {
    patientId: string;
    formId: string;
    answers: Record<string, string | number | boolean>;
    completedByUserId: string;
  }): Promise<ClinicalFormPatientCompletion>;
  listCompletedClinicalFormsForPatient(patientId: string): Promise<
    {
      id: string;
      formId: string;
      formTitle: string;
      templateKind: "form" | "consent";
      completionMode: "staff_assisted" | "patient_qr";
      completedAt: Date;
      createdAt: Date | null;
    }[]
  >;
  /** Consents signed by clinician but still need patient signature (QR). */
  listProcedureConsentsNeedingPatientSignature(patientId: string): Promise<
    {
      id: string;
      formId: string;
      formTitle: string;
      completionMode: "staff_assisted" | "patient_qr";
      clinicianSignedAt: Date;
      createdAt: Date | null;
    }[]
  >;
  /** Clinician initiates/signs a consent (patient signs later via QR). */
  createClinicianSignedProcedureConsentCompletion(args: {
    patientId: string;
    formId: string;
    answers: Record<string, string | number | boolean>;
    clinicianUserId: string;
  }): Promise<ClinicalFormPatientCompletion>;
  /** Generate a QR session for the patient to sign a procedural consent. */
  createProcedureConsentPatientQrSession(args: {
    patientId: string;
    completionId: string;
  }): Promise<{ token: string; expiresAt: Date } | undefined>;
  /** Completed submission for a patient (for chart review). */
  getCompletedClinicalFormCompletionForPatient(
    patientId: string,
    completionId: string,
  ): Promise<{ completion: ClinicalFormPatientCompletion; form: ClinicalForm } | undefined>;
  /** Any completion row for a patient (completed or pending). */
  getClinicalFormCompletionForPatientById(
    patientId: string,
    completionId: string,
  ): Promise<{ completion: ClinicalFormPatientCompletion; form: ClinicalForm } | undefined>;
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

  /** Aggregated metrics for the Systems administrator home dashboard. */
  getSystemsDashboardSnapshot(): Promise<SystemsDashboardSnapshot>;

  listUiActivityLayout(): Promise<UiActivityLayoutRow[]>;
  listUiActivityLayoutForRole(role: string): Promise<UiActivityLayoutRow[]>;
  upsertUiActivityLayout(row: {
    role: string;
    context: string;
    activityId: string;
    labelOverride?: string | null;
    sortOrder: number;
    hidden: boolean;
    readOnly: boolean;
  }): Promise<void>;
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

  async getBeds(facilityId?: string): Promise<Bed[]> {
    const base = db
      .select({
        id: beds.id,
        facilityId: beds.facilityId,
        name: beds.name,
        notes: beds.notes,
        isActive: beds.isActive,
        status: beds.status,
        statusReason: beds.statusReason,
        createdAt: beds.createdAt,
      })
      .from(beds);
    if (facilityId) {
      return base.where(eq(beds.facilityId, facilityId)).orderBy(asc(beds.createdAt));
    }
    return base.orderBy(asc(beds.createdAt));
  }

  async createBed(b: InsertBed): Promise<Bed> {
    const [created] = await db
      .insert(beds)
      .values({
        name: b.name,
        facilityId: b.facilityId ?? null,
        notes: b.notes ?? null,
        isActive: b.isActive ?? true,
        status: b.status ?? "open",
        statusReason: b.statusReason ?? null,
      })
      .returning();
    return created;
  }

  async updateBed(id: string, data: Partial<InsertBed>): Promise<Bed | undefined> {
    const [updated] = await db.update(beds).set(data).where(eq(beds.id, id)).returning();
    return updated;
  }

  async getAvailableBeds(facilityId?: string): Promise<Bed[]> {
    // Walk-in picker: operational status open, not removed, no active admission on this bed.
    const whereFacility = facilityId ? sql`${beds.facilityId} = ${facilityId}` : sql`true`;
    const rows = await db
      .select({ bed: beds })
      .from(beds)
      .leftJoin(bedAssignments, and(eq(bedAssignments.bedId, beds.id), isNull(bedAssignments.dischargedAt)))
      .where(
        and(
          eq(beds.status, "open"),
          eq(beds.isActive, true),
          whereFacility,
          isNull(bedAssignments.id),
        ),
      )
      .orderBy(asc(beds.name));
    return rows.map((r) => r.bed);
  }

  async bedHasActiveAssignment(bedId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: bedAssignments.id })
      .from(bedAssignments)
      .where(and(eq(bedAssignments.bedId, bedId), isNull(bedAssignments.dischargedAt)))
      .limit(1);
    return !!row;
  }

  async getOccupiedBedIds(facilityId?: string | null): Promise<Set<string>> {
    const active = isNull(bedAssignments.dischargedAt);
    const where = facilityId ? and(active, eq(beds.facilityId, facilityId)) : active;
    const rows = await db
      .select({ bedId: bedAssignments.bedId })
      .from(bedAssignments)
      .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
      .where(where);
    return new Set(rows.map((r) => r.bedId));
  }

  async getActivePatientDisplayByBedId(facilityId?: string): Promise<Map<string, string>> {
    const active = isNull(bedAssignments.dischargedAt);
    const where = facilityId ? and(active, eq(beds.facilityId, facilityId)) : active;
    const rows = await db
      .select({
        bedId: bedAssignments.bedId,
        firstName: patients.firstName,
        lastName: patients.lastName,
      })
      .from(bedAssignments)
      .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
      .innerJoin(patients, eq(patients.id, bedAssignments.patientId))
      .where(where)
      .orderBy(desc(bedAssignments.admittedAt));
    const map = new Map<string, string>();
    for (const r of rows) {
      if (map.has(r.bedId)) continue;
      const name = `${r.firstName} ${r.lastName}`.trim();
      map.set(r.bedId, name);
    }
    return map;
  }

  async setBedOnHold(id: string, reason: string): Promise<Bed | undefined> {
    const [bed] = await db.select().from(beds).where(eq(beds.id, id)).limit(1);
    if (!bed) return undefined;
    if (bed.status !== "open") {
      throw new Error("Only beds in Open status can be placed on hold.");
    }
    if (await this.bedHasActiveAssignment(id)) {
      throw new Error("Cannot place on hold while a patient is admitted to this bed.");
    }
    return this.updateBed(id, {
      status: "on_hold",
      statusReason: reason.trim(),
      isActive: true,
    });
  }

  async setBedRemoved(id: string, reason: string): Promise<Bed | undefined> {
    const [bed] = await db.select().from(beds).where(eq(beds.id, id)).limit(1);
    if (!bed) return undefined;
    if (bed.status === "removed") {
      throw new Error("This bed is already removed.");
    }
    if (await this.bedHasActiveAssignment(id)) {
      throw new Error("Cannot remove while a patient is admitted to this bed.");
    }
    return this.updateBed(id, {
      status: "removed",
      statusReason: reason.trim(),
      isActive: false,
    });
  }

  async setBedRestoredToOpen(id: string): Promise<Bed | undefined> {
    const [bed] = await db.select().from(beds).where(eq(beds.id, id)).limit(1);
    if (!bed) return undefined;
    if (bed.status !== "on_hold") {
      throw new Error("Only beds on hold can be restored to open.");
    }
    if (await this.bedHasActiveAssignment(id)) {
      throw new Error("Cannot restore while a patient is admitted to this bed.");
    }
    return this.updateBed(id, {
      status: "open",
      statusReason: null,
      isActive: true,
    });
  }

  async createBedAssignment(a: InsertBedAssignment): Promise<BedAssignment> {
    const [created] = await db.insert(bedAssignments).values(a).returning();
    return created;
  }

  async getBedAssignment(id: string): Promise<BedAssignment | undefined> {
    const [row] = await db.select().from(bedAssignments).where(eq(bedAssignments.id, id));
    return row;
  }

  async getActiveBedAssignmentByPatientId(patientId: string): Promise<BedAssignment | undefined> {
    const [row] = await db
      .select()
      .from(bedAssignments)
      .where(and(eq(bedAssignments.patientId, patientId), isNull(bedAssignments.dischargedAt)))
      .orderBy(desc(bedAssignments.admittedAt));
    return row;
  }

  async getActiveAdmissions(facilityId?: string): Promise<(BedAssignment & { bedName: string; clinicianId: string; scheduledDate: Date; status: string; reason: string | null })[]> {
    const whereFacility = facilityId ? sql`${beds.facilityId} = ${facilityId}` : sql`true`;
    const rows = await db
      .select({
        assignment: bedAssignments,
        bedName: beds.name,
        clinicianId: appointments.clinicianId,
        scheduledDate: appointments.scheduledDate,
        status: appointments.status,
        reason: appointments.reason,
      })
      .from(bedAssignments)
      .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
      .leftJoin(appointments, eq(appointments.id, bedAssignments.appointmentId))
      .where(and(isNull(bedAssignments.dischargedAt), whereFacility))
      .orderBy(desc(bedAssignments.admittedAt));
    return rows
      .filter((r) => !!r.clinicianId && !!r.scheduledDate && !!r.status)
      .map((r) => ({
        ...r.assignment,
        bedName: r.bedName,
        clinicianId: r.clinicianId!,
        scheduledDate: r.scheduledDate!,
        status: String(r.status),
        reason: (r.reason ?? null) as string | null,
      }));
  }

  async getRecentDischargedAdmissions(
    facilityId?: string,
    days = 14,
  ): Promise<(BedAssignment & { bedName: string; clinicianId: string | null; scheduledDate: Date | null; status: string | null; reason: string | null })[]> {
    const whereFacility = facilityId ? sql`${beds.facilityId} = ${facilityId}` : sql`true`;
    const boundedDays = Math.max(1, Math.min(90, days));
    const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        assignment: bedAssignments,
        bedName: beds.name,
        clinicianId: appointments.clinicianId,
        scheduledDate: appointments.scheduledDate,
        status: appointments.status,
        reason: appointments.reason,
      })
      .from(bedAssignments)
      .innerJoin(beds, eq(beds.id, bedAssignments.bedId))
      .leftJoin(appointments, eq(appointments.id, bedAssignments.appointmentId))
      .where(and(whereFacility, sql`${bedAssignments.dischargedAt} IS NOT NULL`, gte(bedAssignments.dischargedAt, since)))
      .orderBy(desc(bedAssignments.dischargedAt));
    return rows.map((r) => ({
      ...r.assignment,
      bedName: r.bedName,
      clinicianId: (r.clinicianId ?? null) as string | null,
      scheduledDate: (r.scheduledDate ?? null) as Date | null,
      status: (r.status != null ? String(r.status) : null) as string | null,
      reason: (r.reason ?? null) as string | null,
    }));
  }

  async attachEncounterToActiveAdmission(appointmentId: string, encounterId: string): Promise<BedAssignment | undefined> {
    const [updated] = await db
      .update(bedAssignments)
      .set({ encounterId })
      .where(and(eq(bedAssignments.appointmentId, appointmentId), isNull(bedAssignments.dischargedAt)))
      .returning();
    return updated;
  }

  async attachEncounterToBedAssignment(assignmentId: string, encounterId: string): Promise<BedAssignment | undefined> {
    const [updated] = await db
      .update(bedAssignments)
      .set({ encounterId })
      .where(eq(bedAssignments.id, assignmentId))
      .returning();
    return updated;
  }

  async dischargeBedAssignment(
    assignmentId: string,
    data: {
      dischargedBy: string;
      dischargeReason: string;
      dischargeNotes?: string | null;
      causeOfDeath?: string | null;
      timeOfDeath?: Date | null;
    }
  ): Promise<BedAssignment | undefined> {
    const [updated] = await db
      .update(bedAssignments)
      .set({
        dischargedAt: new Date(),
        dischargedBy: data.dischargedBy,
        dischargeReason: data.dischargeReason,
        dischargeNotes: data.dischargeNotes ?? null,
        causeOfDeath: data.causeOfDeath ?? null,
        timeOfDeath: data.timeOfDeath ?? null,
      })
      .where(eq(bedAssignments.id, assignmentId))
      .returning();
    return updated;
  }

  async getLabOrders(patientId?: string): Promise<LabOrder[]> {
    if (patientId) {
      return db.select().from(labOrders).where(eq(labOrders.patientId, patientId)).orderBy(desc(labOrders.createdAt));
    }
    return db.select().from(labOrders).orderBy(desc(labOrders.createdAt));
  }

  async getAdmissionLabOrders(admissionId: string): Promise<LabOrder[]> {
    return db
      .select()
      .from(labOrders)
      .where(eq((labOrders as any).admissionId, admissionId))
      .orderBy(desc(labOrders.createdAt));
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

  async getAdmissionImagingOrders(admissionId: string): Promise<ImagingOrder[]> {
    return db
      .select()
      .from(imagingOrders)
      .where(eq((imagingOrders as any).admissionId, admissionId))
      .orderBy(desc(imagingOrders.createdAt));
  }

  async getAdmissionPrescriptions(admissionId: string): Promise<Prescription[]> {
    return db
      .select()
      .from(prescriptions)
      .where(eq((prescriptions as any).admissionId, admissionId))
      .orderBy(desc(prescriptions.createdAt));
  }

  async getMedicationAdministrations(admissionId: string): Promise<MedicationAdministration[]> {
    return db
      .select()
      .from(medicationAdministrations)
      .where(eq(medicationAdministrations.admissionId, admissionId))
      .orderBy(desc(medicationAdministrations.administeredAt));
  }

  async createMedicationAdministration(a: InsertMedicationAdministration): Promise<MedicationAdministration> {
    const [created] = await db.insert(medicationAdministrations).values(a).returning();
    return created;
  }

  async getEncounterMedicationAdministrations(encounterId: string): Promise<EncounterMedicationAdministration[]> {
    return db
      .select()
      .from(encounterMedicationAdministrations)
      .where(eq((encounterMedicationAdministrations as any).encounterId, encounterId))
      .orderBy(desc((encounterMedicationAdministrations as any).administeredAt));
  }

  async createEncounterMedicationAdministration(
    a: InsertEncounterMedicationAdministration
  ): Promise<EncounterMedicationAdministration> {
    const [created] = await db.insert(encounterMedicationAdministrations).values(a as any).returning();
    return created;
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

  async ensurePrescriptionRouteColumn(): Promise<void> {
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prescriptions' AND column_name = 'route'
  ) THEN
    ALTER TABLE prescriptions ADD COLUMN route text;
  END IF;
END $$;
`));
  }

  async ensurePrescriptionRateColumn(): Promise<void> {
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prescriptions' AND column_name = 'rate'
  ) THEN
    ALTER TABLE prescriptions ADD COLUMN rate text;
  END IF;
END $$;
`));
  }

  async ensureEncounterMedicationAdministrationsTable(): Promise<void> {
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS encounter_medication_administrations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  encounter_id varchar NOT NULL,
  prescription_id varchar NOT NULL,
  patient_id varchar NOT NULL,
  administered_by varchar NOT NULL,
  administered_at timestamp DEFAULT now(),
  dose_given text,
  notes text
);
`));
  }

  async ensureBedsAndBedAssignmentsTables(): Promise<void> {
    await db.execute(sql.raw(`
DO $$ BEGIN
  CREATE TYPE bed_operational_status AS ENUM ('open', 'on_hold', 'removed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`));
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS beds (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  facility_id varchar,
  name text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  status bed_operational_status NOT NULL DEFAULT 'open',
  status_reason text,
  created_at timestamp DEFAULT now()
);
`));
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beds' AND column_name = 'notes'
  ) THEN
    ALTER TABLE beds ADD COLUMN notes text;
  END IF;
END $$;
`));
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beds' AND column_name = 'status'
  ) THEN
    ALTER TABLE beds ADD COLUMN status bed_operational_status NOT NULL DEFAULT 'open';
  END IF;
END $$;
`));
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'beds' AND column_name = 'status_reason'
  ) THEN
    ALTER TABLE beds ADD COLUMN status_reason text;
  END IF;
END $$;
`));
    await db.execute(sql.raw(`
UPDATE beds SET status = 'removed', status_reason = COALESCE(NULLIF(TRIM(status_reason), ''), 'Previously marked inactive')
WHERE is_active = false AND status = 'open';
`));
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS bed_assignments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bed_id varchar NOT NULL,
  patient_id varchar NOT NULL,
  appointment_id varchar,
  encounter_id varchar,
  admitted_by varchar NOT NULL,
  admitted_at timestamp DEFAULT now(),
  discharged_at timestamp,
  discharged_by varchar,
  discharge_reason text,
  discharge_notes text,
  cause_of_death text,
  time_of_death timestamp
);
`));
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bed_assignments' AND column_name = 'cause_of_death'
  ) THEN
    ALTER TABLE bed_assignments ADD COLUMN cause_of_death text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bed_assignments' AND column_name = 'time_of_death'
  ) THEN
    ALTER TABLE bed_assignments ADD COLUMN time_of_death timestamp;
  END IF;
END $$;
`));
  }

  async ensureClinicalFormsTable(): Promise<void> {
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS clinical_forms (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_user_id varchar,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
`));
    await db.execute(sql.raw(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinical_forms' AND column_name = 'public_fill_token'
  ) THEN
    DROP INDEX IF EXISTS clinical_forms_public_fill_token_unique;
    ALTER TABLE clinical_forms DROP COLUMN public_fill_token;
  END IF;
END $$;
`));
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS clinical_form_submissions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  form_id varchar NOT NULL REFERENCES clinical_forms (id),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);
`));
    await db.execute(sql.raw(`
CREATE INDEX IF NOT EXISTS clinical_form_submissions_form_id_idx ON clinical_form_submissions (form_id);
`));
    await db.execute(sql.raw(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinical_forms' AND column_name = 'template_kind'
  ) THEN
    ALTER TABLE clinical_forms ADD COLUMN template_kind varchar(32) NOT NULL DEFAULT 'form';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinical_forms' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE clinical_forms ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;
`));
    await this.ensureClinicalFormPatientCompletionsTable();
  }

  async ensureClinicalFormPatientCompletionsTable(): Promise<void> {
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS clinical_form_patient_completions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  patient_id varchar NOT NULL REFERENCES patients (id),
  form_id varchar NOT NULL REFERENCES clinical_forms (id),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_mode varchar(32) NOT NULL,
  qr_token varchar,
  qr_expires_at timestamp,
  provider_signed_at timestamp,
  provider_signed_by_user_id varchar,
  completed_at timestamp,
  completed_by_user_id varchar,
  created_at timestamp DEFAULT now()
);
`));
    // Backfill new columns for existing deployments.
    await db.execute(sql.raw(`
ALTER TABLE clinical_form_patient_completions
  ADD COLUMN IF NOT EXISTS provider_signed_at timestamp;
`));
    await db.execute(sql.raw(`
ALTER TABLE clinical_form_patient_completions
  ADD COLUMN IF NOT EXISTS provider_signed_by_user_id varchar;
`));
    await db.execute(sql.raw(`
CREATE UNIQUE INDEX IF NOT EXISTS clinical_form_patient_completions_qr_token_unique
  ON clinical_form_patient_completions (qr_token) WHERE qr_token IS NOT NULL;
`));
    await db.execute(sql.raw(`
CREATE INDEX IF NOT EXISTS clinical_form_patient_completions_patient_idx
  ON clinical_form_patient_completions (patient_id);
`));
    await db.execute(sql.raw(`
CREATE INDEX IF NOT EXISTS clinical_form_patient_completions_completed_idx
  ON clinical_form_patient_completions (patient_id, completed_at DESC NULLS LAST);
`));
  }

  async deletePendingQrCompletionsForPatientForm(patientId: string, formId: string): Promise<void> {
    await db
      .delete(clinicalFormPatientCompletions)
      .where(
        and(
          eq(clinicalFormPatientCompletions.patientId, patientId),
          eq(clinicalFormPatientCompletions.formId, formId),
          eq(clinicalFormPatientCompletions.completionMode, "patient_qr"),
          isNull(clinicalFormPatientCompletions.completedAt),
          isNotNull(clinicalFormPatientCompletions.qrToken),
        ),
      );
  }

  async createPendingQrFormCompletion(args: {
    patientId: string;
    formId: string;
  }): Promise<{ row: ClinicalFormPatientCompletion; token: string; expiresAt: Date }> {
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [row] = await db
      .insert(clinicalFormPatientCompletions)
      .values({
        patientId: args.patientId,
        formId: args.formId,
        answers: {},
        completionMode: "patient_qr",
        qrToken: token,
        qrExpiresAt: expiresAt,
        completedAt: null,
        completedByUserId: null,
      })
      .returning();
    return { row, token, expiresAt };
  }

  async getClinicalFormCompletionByQrToken(token: string): Promise<ClinicalFormPatientCompletion | undefined> {
    const [row] = await db
      .select()
      .from(clinicalFormPatientCompletions)
      .where(eq(clinicalFormPatientCompletions.qrToken, token))
      .limit(1);
    return row;
  }

  async completeClinicalFormPatientCompletion(
    id: string,
    args: { answers: Record<string, string | number | boolean>; completedByUserId?: string | null },
  ): Promise<ClinicalFormPatientCompletion | undefined> {
    const [row] = await db
      .update(clinicalFormPatientCompletions)
      .set({
        answers: args.answers,
        completedAt: new Date(),
        qrToken: null,
        qrExpiresAt: null,
        completedByUserId: args.completedByUserId ?? null,
      })
      .where(eq(clinicalFormPatientCompletions.id, id))
      .returning();
    return row;
  }

  async createStaffAssistedClinicalFormCompletion(args: {
    patientId: string;
    formId: string;
    answers: Record<string, string | number | boolean>;
    completedByUserId: string;
  }): Promise<ClinicalFormPatientCompletion> {
    const [row] = await db
      .insert(clinicalFormPatientCompletions)
      .values({
        patientId: args.patientId,
        formId: args.formId,
        answers: args.answers,
        completionMode: "staff_assisted",
        qrToken: null,
        qrExpiresAt: null,
        completedAt: new Date(),
        completedByUserId: args.completedByUserId,
      })
      .returning();
    return row;
  }

  async listCompletedClinicalFormsForPatient(patientId: string): Promise<
    {
      id: string;
      formId: string;
      formTitle: string;
      templateKind: "form" | "consent";
      completionMode: "staff_assisted" | "patient_qr";
      completedAt: Date;
      createdAt: Date | null;
    }[]
  > {
    const rows = await db
      .select({
        id: clinicalFormPatientCompletions.id,
        formId: clinicalFormPatientCompletions.formId,
        formTitle: clinicalForms.title,
        templateKind: clinicalForms.templateKind,
        completionMode: clinicalFormPatientCompletions.completionMode,
        completedAt: clinicalFormPatientCompletions.completedAt,
        createdAt: clinicalFormPatientCompletions.createdAt,
        providerSignedAt: clinicalFormPatientCompletions.providerSignedAt,
        answers: clinicalFormPatientCompletions.answers,
      })
      .from(clinicalFormPatientCompletions)
      .innerJoin(clinicalForms, eq(clinicalFormPatientCompletions.formId, clinicalForms.id))
      .where(
        and(eq(clinicalFormPatientCompletions.patientId, patientId), isNotNull(clinicalFormPatientCompletions.completedAt)),
      )
      .orderBy(desc(clinicalFormPatientCompletions.completedAt));
    return rows.map((r) => ({
      id: r.id,
      formId: r.formId,
      formTitle: r.formTitle,
      templateKind: r.templateKind === "consent" ? "consent" : "form",
      completionMode: r.completionMode,
      completedAt: r.completedAt!,
      createdAt: r.createdAt ?? null,
    }));
  }

  async listProcedureConsentsNeedingPatientSignature(patientId: string): Promise<
    {
      id: string;
      formId: string;
      formTitle: string;
      completionMode: "staff_assisted" | "patient_qr";
      clinicianSignedAt: Date;
      createdAt: Date | null;
    }[]
  > {
    const rows = await db
      .select({
        id: clinicalFormPatientCompletions.id,
        formId: clinicalFormPatientCompletions.formId,
        formTitle: clinicalForms.title,
        completionMode: clinicalFormPatientCompletions.completionMode,
        clinicianSignedAt: clinicalFormPatientCompletions.providerSignedAt,
        createdAt: clinicalFormPatientCompletions.createdAt,
      })
      .from(clinicalFormPatientCompletions)
      .innerJoin(clinicalForms, eq(clinicalFormPatientCompletions.formId, clinicalForms.id))
      .where(
        and(
          eq(clinicalFormPatientCompletions.patientId, patientId),
          isNotNull(clinicalFormPatientCompletions.providerSignedAt),
          isNull(clinicalFormPatientCompletions.completedAt),
          eq(clinicalForms.templateKind, "consent"),
        ),
      )
      .orderBy(desc(clinicalFormPatientCompletions.providerSignedAt));
    return rows.map((r) => ({
      id: r.id,
      formId: r.formId,
      formTitle: r.formTitle,
      completionMode: r.completionMode,
      clinicianSignedAt: r.clinicianSignedAt!,
      createdAt: r.createdAt ?? null,
    }));
  }

  async createClinicianSignedProcedureConsentCompletion(args: {
    patientId: string;
    formId: string;
    answers: Record<string, string | number | boolean>;
    clinicianUserId: string;
  }): Promise<ClinicalFormPatientCompletion> {
    const [row] = await db
      .insert(clinicalFormPatientCompletions)
      .values({
        patientId: args.patientId,
        formId: args.formId,
        answers: args.answers,
        completionMode: "staff_assisted",
        qrToken: null,
        qrExpiresAt: null,
        providerSignedAt: new Date(),
        providerSignedByUserId: args.clinicianUserId,
        completedAt: null,
        completedByUserId: null,
      })
      .returning();
    return row;
  }

  async createProcedureConsentPatientQrSession(args: {
    patientId: string;
    completionId: string;
  }): Promise<{ token: string; expiresAt: Date } | undefined> {
    const existing = await this.getClinicalFormCompletionForPatientById(args.patientId, args.completionId);
    if (!existing) return undefined;
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [row] = await db
      .update(clinicalFormPatientCompletions)
      .set({
        qrToken: token,
        qrExpiresAt: expiresAt,
      })
      .where(
        and(
          eq(clinicalFormPatientCompletions.id, args.completionId),
          eq(clinicalFormPatientCompletions.patientId, args.patientId),
          isNull(clinicalFormPatientCompletions.completedAt),
        ),
      )
      .returning();
    if (!row) return undefined;
    return { token, expiresAt };
  }

  async getCompletedClinicalFormCompletionForPatient(
    patientId: string,
    completionId: string,
  ): Promise<{ completion: ClinicalFormPatientCompletion; form: ClinicalForm } | undefined> {
    const [row] = await db
      .select()
      .from(clinicalFormPatientCompletions)
      .where(
        and(
          eq(clinicalFormPatientCompletions.id, completionId),
          eq(clinicalFormPatientCompletions.patientId, patientId),
          isNotNull(clinicalFormPatientCompletions.completedAt),
        ),
      )
      .limit(1);
    if (!row) return undefined;
    const form = await this.getClinicalFormById(row.formId);
    if (!form) return undefined;
    return { completion: row, form };
  }

  async getClinicalFormCompletionForPatientById(
    patientId: string,
    completionId: string,
  ): Promise<{ completion: ClinicalFormPatientCompletion; form: ClinicalForm } | undefined> {
    const [row] = await db
      .select()
      .from(clinicalFormPatientCompletions)
      .where(and(eq(clinicalFormPatientCompletions.id, completionId), eq(clinicalFormPatientCompletions.patientId, patientId)))
      .limit(1);
    if (!row) return undefined;
    const form = await this.getClinicalFormById(row.formId);
    if (!form) return undefined;
    return { completion: row, form };
  }

  async getClinicalForms(): Promise<ClinicalForm[]> {
    return db.select().from(clinicalForms).orderBy(desc(clinicalForms.createdAt));
  }

  async getClinicalFormById(id: string): Promise<ClinicalForm | undefined> {
    const [row] = await db.select().from(clinicalForms).where(eq(clinicalForms.id, id)).limit(1);
    return row;
  }

  async createClinicalForm(entry: {
    title: string;
    description?: string | null;
    fields: ClinicalFormField[];
    templateKind: "form" | "consent";
    createdByUserId?: string | null;
  }): Promise<ClinicalForm> {
    const [row] = await db
      .insert(clinicalForms)
      .values({
        title: entry.title.trim(),
        description: entry.description?.trim() ? entry.description.trim() : null,
        fields: entry.fields,
        templateKind: entry.templateKind,
        isActive: true,
        createdByUserId: entry.createdByUserId ?? null,
      })
      .returning();
    return row;
  }

  async updateClinicalForm(
    id: string,
    entry: { title: string; description?: string | null; fields: ClinicalFormField[]; templateKind: "form" | "consent" },
  ): Promise<ClinicalForm | undefined> {
    const [row] = await db
      .update(clinicalForms)
      .set({
        title: entry.title.trim(),
        description: entry.description?.trim() ? entry.description.trim() : null,
        fields: entry.fields,
        templateKind: entry.templateKind,
        updatedAt: new Date(),
      })
      .where(eq(clinicalForms.id, id))
      .returning();
    return row;
  }

  async setClinicalFormActive(id: string, isActive: boolean): Promise<ClinicalForm | undefined> {
    const [row] = await db
      .update(clinicalForms)
      .set({ isActive, updatedAt: new Date() } as any)
      .where(eq(clinicalForms.id, id))
      .returning();
    return row;
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

  async ensureFacilityOrganizationAndRoleTables(): Promise<void> {
    await db.execute(sql.raw(`
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facilities' AND column_name = 'patient_identifier_label'
  ) THEN
    ALTER TABLE facilities ADD COLUMN patient_identifier_label text NOT NULL DEFAULT 'MRN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facilities' AND column_name = 'time_zone'
  ) THEN
    ALTER TABLE facilities ADD COLUMN time_zone text NOT NULL DEFAULT 'UTC';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facilities' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE facilities ADD COLUMN logo_url text;
  END IF;
END $$;
`));
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS role_capability_overrides (
  role text NOT NULL,
  capability_id varchar(128) NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role, capability_id)
);
`));
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS ui_table_column_overrides (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  role text NOT NULL,
  table_key varchar(128) NOT NULL,
  column_id varchar(128) NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  label text,
  sort_order integer,
  UNIQUE (role, table_key, column_id)
);
`));
    await db.execute(sql.raw(`
ALTER TABLE ui_table_column_overrides ADD COLUMN IF NOT EXISTS sort_order integer;
`));
    await db.execute(sql.raw(`
CREATE TABLE IF NOT EXISTS ui_activity_layout (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  role text NOT NULL,
  context varchar(64) NOT NULL,
  activity_id varchar(128) NOT NULL,
  label_override text,
  sort_order int NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  UNIQUE (role, context, activity_id)
);
`));
    await pool.query(`ALTER TABLE ui_activity_layout ADD COLUMN IF NOT EXISTS read_only boolean NOT NULL DEFAULT false`);
    await pool.query(`UPDATE ui_activity_layout SET context = 'toolbar' WHERE context = 'header_nav'`);
    await pool.query(`
      DELETE FROM ui_activity_layout
      WHERE activity_id IN (
        'hdr_scheduled_appt',
        'hdr_laboratory',
        'hdr_uploads',
        'hdr_org_config',
        'hdr_user_mgmt',
        'hdr_role_mgmt',
        'hdr_administrative'
      )
    `);
  }

  async getRoleCapabilityOverridesForRole(role: string): Promise<{ capabilityId: string; allowed: boolean }[]> {
    const { rows } = await pool.query<{ capability_id: string; allowed: boolean }>(
      `SELECT capability_id, allowed FROM role_capability_overrides WHERE role = $1`,
      [role],
    );
    return rows.map((r) => ({ capabilityId: r.capability_id, allowed: r.allowed }));
  }

  async upsertRoleCapabilityOverride(role: string, capabilityId: string, allowed: boolean): Promise<void> {
    await pool.query(
      `INSERT INTO role_capability_overrides (role, capability_id, allowed)
       VALUES ($1, $2, $3)
       ON CONFLICT (role, capability_id) DO UPDATE SET allowed = EXCLUDED.allowed`,
      [role, capabilityId, allowed],
    );
  }

  async listUiTableColumnOverrides(): Promise<
    {
      role: string;
      tableKey: string;
      columnId: string;
      hidden: boolean;
      label: string | null;
      sortOrder: number | null;
    }[]
  > {
    const { rows } = await pool.query<{
      role: string;
      table_key: string;
      column_id: string;
      hidden: boolean;
      label: string | null;
      sort_order: number | null;
    }>(
      `SELECT role, table_key, column_id, hidden, label, sort_order FROM ui_table_column_overrides ORDER BY role, table_key, column_id`,
    );
    return rows.map((r) => ({
      role: r.role,
      tableKey: r.table_key,
      columnId: r.column_id,
      hidden: r.hidden,
      label: r.label,
      sortOrder: r.sort_order,
    }));
  }

  async upsertUiTableColumnOverride(args: {
    role: string;
    tableKey: string;
    columnId: string;
    hidden?: boolean;
    label?: string | null;
    sortOrder?: number | null;
  }): Promise<void> {
    const hidden = args.hidden ?? false;
    const label = args.label === undefined ? null : args.label;
    const sortOrder = args.sortOrder === undefined ? null : args.sortOrder;
    await pool.query(
      `INSERT INTO ui_table_column_overrides (role, table_key, column_id, hidden, label, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (role, table_key, column_id) DO UPDATE SET
         hidden = EXCLUDED.hidden,
         label = EXCLUDED.label,
         sort_order = COALESCE(EXCLUDED.sort_order, ui_table_column_overrides.sort_order)`,
      [args.role, args.tableKey, args.columnId, hidden, label, sortOrder],
    );
  }

  async deleteUiTableColumnOverride(role: string, tableKey: string, columnId: string): Promise<void> {
    await pool.query(
      `DELETE FROM ui_table_column_overrides WHERE role = $1 AND table_key = $2 AND column_id = $3`,
      [role, tableKey, columnId],
    );
  }

  async setUiTableColumnOrder(role: string, tableKey: string, orderedColumnIds: string[]): Promise<void> {
    const all = await this.listUiTableColumnOverrides();
    const byKey = new Map<string, { hidden: boolean; label: string | null }>();
    for (const o of all) {
      if (o.role === role && o.tableKey === tableKey) {
        byKey.set(o.columnId, { hidden: o.hidden, label: o.label });
      }
    }
    for (let i = 0; i < orderedColumnIds.length; i++) {
      const columnId = orderedColumnIds[i];
      const prev = byKey.get(columnId);
      await this.upsertUiTableColumnOverride({
        role,
        tableKey,
        columnId,
        hidden: prev?.hidden ?? false,
        label: prev?.label ?? null,
        sortOrder: i * 10,
      });
    }
  }

  async listUiActivityLayout(): Promise<UiActivityLayoutRow[]> {
    const { rows } = await pool.query<{
      role: string;
      context: string;
      activity_id: string;
      label_override: string | null;
      sort_order: number;
      hidden: boolean;
      read_only: boolean;
    }>(
      `SELECT role, context, activity_id, label_override, sort_order, hidden, read_only FROM ui_activity_layout ORDER BY role, context, sort_order, activity_id`,
    );
    return normalizeUiActivityLayoutRows(
      rows.map((r) => ({
        role: r.role,
        context: r.context,
        activityId: r.activity_id,
        labelOverride: r.label_override,
        sortOrder: r.sort_order,
        hidden: r.hidden,
        readOnly: r.read_only,
      })),
    );
  }

  async listUiActivityLayoutForRole(role: string): Promise<UiActivityLayoutRow[]> {
    const { rows } = await pool.query<{
      role: string;
      context: string;
      activity_id: string;
      label_override: string | null;
      sort_order: number;
      hidden: boolean;
      read_only: boolean;
    }>(
      `SELECT role, context, activity_id, label_override, sort_order, hidden, read_only FROM ui_activity_layout WHERE role = $1 ORDER BY context, sort_order, activity_id`,
      [role],
    );
    return normalizeUiActivityLayoutRows(
      rows.map((r) => ({
        role: r.role,
        context: r.context,
        activityId: r.activity_id,
        labelOverride: r.label_override,
        sortOrder: r.sort_order,
        hidden: r.hidden,
        readOnly: r.read_only,
      })),
    );
  }

  async upsertUiActivityLayout(row: {
    role: string;
    context: string;
    activityId: string;
    labelOverride?: string | null;
    sortOrder: number;
    hidden: boolean;
    readOnly: boolean;
  }): Promise<void> {
    const label = row.labelOverride === undefined ? null : row.labelOverride;
    await pool.query(
      `INSERT INTO ui_activity_layout (role, context, activity_id, label_override, sort_order, hidden, read_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (role, context, activity_id) DO UPDATE SET
         label_override = EXCLUDED.label_override,
         sort_order = EXCLUDED.sort_order,
         hidden = EXCLUDED.hidden,
         read_only = EXCLUDED.read_only`,
      [row.role, row.context, row.activityId, label, row.sortOrder, row.hidden, row.readOnly],
    );
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

  async getSystemsDashboardSnapshot(): Promise<SystemsDashboardSnapshot> {
    const allUsers = await this.getUsers();
    const facs = await this.getFacilities();
    const forms = await this.getClinicalForms();
    const userNameById = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const { rows: loginRows } = await pool.query<{ user_id: string; last_login: Date }>(
      `SELECT user_id, MAX(created_at) AS last_login
       FROM audit_logs
       WHERE action = 'LOGIN' AND resource = 'auth'
       GROUP BY user_id`,
    );
    const lastLoginByUser = new Map<string, Date>();
    for (const r of loginRows) {
      lastLoginByUser.set(r.user_id, new Date(r.last_login));
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);

    const staleItems: SystemsDashboardSnapshot["staleActiveAccounts"]["items"] = [];
    for (const u of allUsers) {
      if (!u.isActive) continue;
      const last = lastLoginByUser.get(u.id);
      const created = u.createdAt ? new Date(u.createdAt) : null;
      let isStale = false;
      if (!last) {
        if (created && created < cutoff) isStale = true;
      } else if (last < cutoff) {
        isStale = true;
      }
      if (isStale) {
        staleItems.push({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          role: u.role,
          lastLoginAt: last ? last.toISOString() : null,
          createdAt: created ? created.toISOString() : null,
        });
      }
    }
    staleItems.sort((a, b) => {
      const ta = a.lastLoginAt ?? a.createdAt ?? "";
      const tb = b.lastLoginAt ?? b.createdAt ?? "";
      return tb.localeCompare(ta);
    });

    const securityActions = [
      "UPDATE_ROLE_CAPABILITY",
      "CREATE_USER",
      "RESET_USER_PASSWORD",
      "UPDATE_ORGANIZATION_SETTINGS",
      "UPDATE_ORGANIZATION_LOGO",
      "UPDATE_UI_TABLE_COLUMN",
      "CREATE_CLINICAL_FORM",
      "UPDATE_CLINICAL_FORM",
    ];

    const { rows: recentRows } = await pool.query<{
      id: string;
      created_at: Date;
      action: string;
      resource: string;
      details: string | null;
      user_id: string;
    }>(
      `SELECT id, created_at, action, resource, details, user_id
       FROM audit_logs
       WHERE action = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT 25`,
      [securityActions],
    );

    const { rows: count24h } = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '24 hours'
         AND action = ANY($1::text[])`,
      [securityActions],
    );

    const { rows: login7d } = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c
       FROM audit_logs
       WHERE action = 'LOGIN' AND resource = 'auth'
         AND created_at >= NOW() - INTERVAL '7 days'`,
    );

    let roleCapabilityOverrideRows = 0;
    try {
      const { rows: rc } = await pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM role_capability_overrides`);
      roleCapabilityOverrideRows = parseInt(rc[0]?.c ?? "0", 10) || 0;
    } catch {
      roleCapabilityOverrideRows = 0;
    }

    const totalUsers = allUsers.length;
    const activeUsers = allUsers.filter((u) => u.isActive).length;
    const deactivated = totalUsers - activeUsers;

    const facActive = facs.filter((f) => f.isActive).length;
    const facInactive = facs.length - facActive;

    const formsActive = forms.filter((f) => f.isActive !== false).length;
    const formsInactive = forms.length - formsActive;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        deactivated,
      },
      staleActiveAccounts: {
        count: staleItems.length,
        items: staleItems.slice(0, 75),
      },
      facilities: {
        total: facs.length,
        active: facActive,
        inactive: facInactive,
      },
      clinicalForms: {
        total: forms.length,
        active: formsActive,
        inactive: formsInactive,
      },
      roleCapabilityOverrideRows,
      audit: {
        loginsLast7Days: parseInt(login7d[0]?.c ?? "0", 10) || 0,
        securityEventsLast24h: parseInt(count24h[0]?.c ?? "0", 10) || 0,
        recentSecurityEvents: recentRows.map((r) => ({
          id: r.id,
          createdAt: new Date(r.created_at).toISOString(),
          action: r.action,
          resource: r.resource,
          details: r.details,
          userId: r.user_id,
          actorFullName: userNameById.get(r.user_id) ?? null,
        })),
      },
    };
  }
}

export const storage = new DatabaseStorage();
