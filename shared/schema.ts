import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, decimal, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin", "facility_admin", "clinician", "nurse",
  "lab_tech", "pharmacist", "finance", "reception"
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("reception"),
  facilityId: varchar("facility_id"),
  email: text("email"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const facilities = pgTable("facilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  country: text("country").default("KE"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mrn: text("mrn").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  gender: genderEnum("gender").notNull(),
  nationalId: text("national_id"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  country: text("country").default("KE"),
  bloodGroup: text("blood_group"),
  allergies: text("allergies"),
  nextOfKinName: text("next_of_kin_name"),
  nextOfKinPhone: text("next_of_kin_phone"),
  nextOfKinRelation: text("next_of_kin_relation"),
  primaryProviderId: varchar("primary_provider_id"),
  facilityId: varchar("facility_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const patientProblems = pgTable("patient_problems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  problem: text("problem").notNull(),
  addedBy: varchar("added_by").notNull(),
  status: text("status").notNull().default("active"),
  problemStartDate: date("problem_start_date"),
  symptoms: text("symptoms"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const allergySeverityEnum = pgEnum("allergy_severity", ["LOW", "MEDIUM", "HIGH"]);

export const patientAllergies = pgTable("patient_allergies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  allergen: text("allergen").notNull(),
  severity: allergySeverityEnum("severity").notNull().default("HIGH"),
  reactionType: text("reaction_type"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const noteTypeEnum = pgEnum("note_type", ["nursing", "clinician"]);

export const patientNotes = pgTable("patient_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  authorId: varchar("author_id").notNull(),
  authorRole: noteTypeEnum("author_role").notNull(),
  noteKind: text("note_kind").default("Progress Note"),
  content: text("content").notNull(),
  status: text("status").default("signed"),
  signedAt: timestamp("signed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const familyMembers = pgTable("family_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  relationship: text("relationship").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const familyMemberConditions = pgTable("family_member_conditions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyMemberId: varchar("family_member_id").notNull(),
  condition: text("condition").notNull(),
  notes: text("notes"),
  addedBy: varchar("added_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const encounterStatusEnum = pgEnum("encounter_status", [
  "scheduled", "in_progress", "completed", "cancelled"
]);

export const encounterTypeEnum = pgEnum("encounter_type", [
  "outpatient", "inpatient", "emergency"
]);

export const encounters = pgTable("encounters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  clinicianId: varchar("clinician_id").notNull(),
  facilityId: varchar("facility_id"),
  type: encounterTypeEnum("type").notNull().default("outpatient"),
  status: encounterStatusEnum("status").notNull().default("scheduled"),
  chiefComplaint: text("chief_complaint"),
  subjective: text("subjective"),
  objective: text("objective"),
  assessment: text("assessment"),
  plan: text("plan"),
  icdCodes: text("icd_codes"),
  visitDate: timestamp("visit_date").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vitals = pgTable("vitals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id").notNull(),
  patientId: varchar("patient_id").notNull(),
  temperature: decimal("temperature"),
  bloodPressureSystolic: integer("blood_pressure_systolic"),
  bloodPressureDiastolic: integer("blood_pressure_diastolic"),
  heartRate: integer("heart_rate"),
  respiratoryRate: integer("respiratory_rate"),
  oxygenSaturation: integer("oxygen_saturation"),
  weight: decimal("weight"),
  height: decimal("height"),
  recordedBy: varchar("recorded_by"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"
]);

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  clinicianId: varchar("clinician_id").notNull(),
  facilityId: varchar("facility_id"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  duration: integer("duration").default(30),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  reason: text("reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const labOrderStatusEnum = pgEnum("lab_order_status", [
  "ordered", "collected", "processing", "completed", "resulted", "cancelled"
]);

export const labOrders = pgTable("lab_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id"),
  patientId: varchar("patient_id").notNull(),
  orderedBy: varchar("ordered_by").notNull(),
  testName: text("test_name").notNull(),
  testCode: text("test_code"),
  status: labOrderStatusEnum("status").notNull().default("ordered"),
  priority: text("priority").default("routine"),
  internalExternal: text("internal_external").default("internal"),
  result: text("result"),
  resultValue: text("result_value"),
  referenceRange: text("reference_range"),
  isCritical: boolean("is_critical").default(false),
  documentUrl: text("document_url"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const imagingOrderStatusEnum = pgEnum("imaging_order_status", [
  "ordered", "completed", "cancelled"
]);

export const imagingOrders = pgTable("imaging_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id"),
  patientId: varchar("patient_id").notNull(),
  patientProblemId: varchar("patient_problem_id"),
  orderedBy: varchar("ordered_by").notNull(),
  title: text("title").notNull(),
  modality: text("modality").notNull(),
  internalExternal: text("internal_external").default("internal"),
  status: imagingOrderStatusEnum("status").notNull().default("ordered"),
  documentUrl: text("document_url"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const patientDocumentTypeEnum = pgEnum("patient_document_type", [
  "lab_result", "imaging", "patient_document"
]);

export const patientDocuments = pgTable("patient_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  documentType: patientDocumentTypeEnum("document_type").notNull(),
  title: text("title").notNull(),
  documentUrl: text("document_url"),
  labOrderId: varchar("lab_order_id"),
  uploadedBy: varchar("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const prescriptionStatusEnum = pgEnum("prescription_status", [
  "active", "dispensed", "cancelled", "expired"
]);

export const prescriptions = pgTable("prescriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id"),
  patientId: varchar("patient_id").notNull(),
  prescribedBy: varchar("prescribed_by").notNull(),
  patientProblemId: varchar("patient_problem_id"),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  duration: text("duration"),
  quantity: integer("quantity"),
  instructions: text("instructions"),
  status: prescriptionStatusEnum("status").notNull().default("active"),
  dispensedAt: timestamp("dispensed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft", "pending", "paid", "partial", "cancelled"
]);

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id"),
  patientId: varchar("patient_id").notNull(),
  facilityId: varchar("facility_id"),
  totalAmount: decimal("total_amount").notNull(),
  paidAmount: decimal("paid_amount").default("0"),
  status: invoiceStatusEnum("status").notNull().default("pending"),
  items: jsonb("items"),
  paymentMethod: text("payment_method"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const imagingResults = pgTable("imaging_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  encounterId: varchar("encounter_id"),
  modality: text("modality").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  documentUrl: text("document_url"),
  performedAt: timestamp("performed_at").defaultNow(),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: varchar("resource_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertFacilitySchema = createInsertSchema(facilities).omit({ id: true, createdAt: true });
export const insertPatientSchema = createInsertSchema(patients).omit({ id: true, createdAt: true });
export const insertPatientProblemSchema = createInsertSchema(patientProblems).omit({ id: true, createdAt: true });
export const insertPatientAllergySchema = createInsertSchema(patientAllergies).omit({ id: true, createdAt: true });
export const insertPatientNoteSchema = createInsertSchema(patientNotes).omit({ id: true, createdAt: true, signedAt: true });
export const insertFamilyMemberSchema = createInsertSchema(familyMembers).omit({ id: true, createdAt: true });
export const insertFamilyMemberConditionSchema = createInsertSchema(familyMemberConditions).omit({ id: true, createdAt: true });
export const insertEncounterSchema = createInsertSchema(encounters).omit({ id: true, createdAt: true });
export const insertVitalsSchema = createInsertSchema(vitals).omit({ id: true, recordedAt: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true });
export const insertLabOrderSchema = createInsertSchema(labOrders).omit({ id: true, createdAt: true, completedAt: true });
export const insertImagingOrderSchema = createInsertSchema(imagingOrders).omit({ id: true, createdAt: true, completedAt: true });
export const insertImagingResultSchema = createInsertSchema(imagingResults).omit({ id: true, createdAt: true });
export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({ id: true, createdAt: true });
export const insertPrescriptionSchema = createInsertSchema(prescriptions).omit({ id: true, createdAt: true, dispensedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type Facility = typeof facilities.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;
export type InsertPatientProblem = z.infer<typeof insertPatientProblemSchema>;
export type PatientProblem = typeof patientProblems.$inferSelect;
export type InsertPatientAllergy = z.infer<typeof insertPatientAllergySchema>;
export type PatientAllergy = typeof patientAllergies.$inferSelect;
export type InsertPatientNote = z.infer<typeof insertPatientNoteSchema>;
export type PatientNote = typeof patientNotes.$inferSelect;
export type InsertFamilyMember = z.infer<typeof insertFamilyMemberSchema>;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMemberCondition = z.infer<typeof insertFamilyMemberConditionSchema>;
export type FamilyMemberCondition = typeof familyMemberConditions.$inferSelect;
export type InsertEncounter = z.infer<typeof insertEncounterSchema>;
export type Encounter = typeof encounters.$inferSelect;
export type InsertVitals = z.infer<typeof insertVitalsSchema>;
export type Vitals = typeof vitals.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertLabOrder = z.infer<typeof insertLabOrderSchema>;
export type LabOrder = typeof labOrders.$inferSelect;
export type InsertImagingOrder = z.infer<typeof insertImagingOrderSchema>;
export type ImagingOrder = typeof imagingOrders.$inferSelect;
export type InsertImagingResult = z.infer<typeof insertImagingResultSchema>;
export type ImagingResult = typeof imagingResults.$inferSelect;
export type InsertPatientDocument = z.infer<typeof insertPatientDocumentSchema>;
export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptions.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
