import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, date, decimal, jsonb, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** Canonical role ids (DB enum + Zod). Facility Admin, Pharmacist, and Finance were removed — use Clinic Administrator / super_admin for those duties. */
export const USER_ROLE_VALUES = [
  "super_admin",
  "clinician",
  "nurse",
  "lab_tech",
  "reception",
  "security",
] as const;

export const userRoleEnum = pgEnum("user_role", USER_ROLE_VALUES);

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
  /** Default country (ISO 3166-1 alpha-2) for new records and pickers org-wide. */
  country: text("country").default("KE"),
  /** IANA time zone id used for displaying dates/times across the app (e.g. "Africa/Nairobi"). */
  timeZone: text("time_zone").notNull().default("UTC"),
  /** ISO 4217 — default prices & billing UI for this facility. */
  billingCurrency: varchar("billing_currency", { length: 3 }).notNull().default("KES"),
  /** Label for the patient identifier (e.g. MRN, Hospital #) shown across the app. */
  patientIdentifierLabel: text("patient_identifier_label").notNull().default("MRN"),
  /** Organization / facility logo URL (e.g. /uploads/org-….png). */
  logoUrl: text("logo_url"),
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
  state: text("state"),
  country: text("country").default("KE"),
  bloodGroup: text("blood_group"),
  /** Profile image served from /uploads/… after upload */
  profilePhotoUrl: text("profile_photo_url"),
  allergies: text("allergies"),
  nextOfKinName: text("next_of_kin_name"),
  nextOfKinPhone: text("next_of_kin_phone"),
  nextOfKinRelation: text("next_of_kin_relation"),
  primaryProviderId: varchar("primary_provider_id"),
  facilityId: varchar("facility_id"),
  /** Registration / billing (front desk) */
  insuranceCarrier: text("insurance_carrier"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insuranceGroupNumber: text("insurance_group_number"),
  billingGuarantorName: text("billing_guarantor_name"),
  billingGuarantorPhone: text("billing_guarantor_phone"),
  billingGuarantorRelation: text("billing_guarantor_relation"),
  billingNotes: text("billing_notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const patientProblems = pgTable("patient_problems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  problem: text("problem").notNull(),
  addedBy: varchar("added_by"),
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
  /** Nullable for legacy rows; new rows should set addedBy from the API */
  addedBy: varchar("added_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const noteTypeEnum = pgEnum("note_type", ["nursing", "clinician"]);

export const patientNotes = pgTable("patient_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  /** When set, ties the note to a specific visit/encounter (e.g. schedule visit) */
  encounterId: varchar("encounter_id"),
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
  /** Set when the encounter was started from the schedule (visit summary eligibility) */
  appointmentId: varchar("appointment_id"),
  type: encounterTypeEnum("type").notNull().default("outpatient"),
  status: encounterStatusEnum("status").notNull().default("scheduled"),
  /** Billing: set by billing-capable staff after verifying charges for a completed visit. */
  chargesFinalizedAt: timestamp("charges_finalized_at"),
  chargesFinalizedBy: varchar("charges_finalized_by"),
  chiefComplaint: text("chief_complaint"),
  subjective: text("subjective"),
  objective: text("objective"),
  assessment: text("assessment"),
  plan: text("plan"),
  icdCodes: text("icd_codes"),
  /** Discharge / handout instructions for the patient; editable on Visit Summary */
  patientInstructions: text("patient_instructions"),
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
  /** Visit purpose; display everywhere as APPOINTMENT_REASON_FOR_VISIT_LABEL (@shared/appointment-labels). */
  reason: text("reason"),
  notes: text("notes"),
  /** Reception / staff note when status is set to cancelled */
  cancellationReason: text("cancellation_reason"),
  /** Captured at front-desk check-in (reception) */
  checkInCopayAmount: decimal("check_in_copay_amount"),
  checkInPaymentMethod: text("check_in_payment_method"),
  checkInAmountReceived: decimal("check_in_amount_received"),
  checkInPaymentNotes: text("check_in_payment_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Curated list for scheduling / visit reason pickers (seeded; extend via DB later). */
export const commonVisitReasons = pgTable("common_visit_reasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bedOperationalStatusEnum = pgEnum("bed_operational_status", ["open", "on_hold", "removed"]);

export const beds = pgTable("beds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id"),
  /** Human-readable bed/room name (e.g. "Ward A - Bed 3"). */
  name: text("name").notNull(),
  /** Optional documentation (location, equipment, notes for staff). */
  notes: text("notes"),
  /** Legacy flag; kept in sync with operational status (`removed` → false). */
  isActive: boolean("is_active").notNull().default(true),
  /** Open = selectable for walk-ins; on_hold / removed excluded from walk-in picker. */
  status: bedOperationalStatusEnum("status").notNull().default("open"),
  /** Required context when status is on_hold or removed. */
  statusReason: text("status_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bedAssignments = pgTable("bed_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bedId: varchar("bed_id").notNull(),
  patientId: varchar("patient_id").notNull(),
  appointmentId: varchar("appointment_id"),
  encounterId: varchar("encounter_id"),
  admittedBy: varchar("admitted_by").notNull(),
  admittedAt: timestamp("admitted_at").defaultNow(),
  dischargedAt: timestamp("discharged_at"),
  dischargedBy: varchar("discharged_by"),
  dischargeReason: text("discharge_reason"),
  dischargeNotes: text("discharge_notes"),
  causeOfDeath: text("cause_of_death"),
  timeOfDeath: timestamp("time_of_death"),
});

export const labOrderStatusEnum = pgEnum("lab_order_status", [
  "ordered", "collected", "processing", "completed", "resulted", "cancelled"
]);

export const labOrders = pgTable("lab_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id"),
  /** When ordered during an active admission (inpatient). */
  admissionId: varchar("admission_id"),
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
  /** When ordered during an active admission (inpatient). */
  admissionId: varchar("admission_id"),
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
  /** When document_type is patient_document: category from /api/patient-record-document-types */
  recordDocumentType: text("record_document_type"),
  documentUrl: text("document_url"),
  labOrderId: varchar("lab_order_id"),
  uploadedBy: varchar("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const followUpContactOutcomeEnum = pgEnum("follow_up_contact_outcome", [
  "picked_up",
  "did_not_pick_up",
  "left_message",
]);

/** Reception contact attempts for external-order follow-up outreach. */
export const followUpContacts = pgTable("follow_up_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull(),
  labOrderId: varchar("lab_order_id"),
  imagingOrderId: varchar("imaging_order_id"),
  /** When set, ties this contact to an appointment reminder call. */
  appointmentId: varchar("appointment_id"),
  contactedBy: varchar("contacted_by").notNull(),
  reasonForCall: text("reason_for_call"),
  outcome: followUpContactOutcomeEnum("outcome").notNull(),
  discussion: text("discussion"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const prescriptionStatusEnum = pgEnum("prescription_status", [
  "active", "dispensed", "cancelled", "expired"
]);

export const medicationOrderTypeEnum = pgEnum("medication_order_type", [
  "administered",
  "prescription",
]);

export const prescriptions = pgTable("prescriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id"),
  /** When ordered during an active admission (inpatient). */
  admissionId: varchar("admission_id"),
  patientId: varchar("patient_id").notNull(),
  prescribedBy: varchar("prescribed_by").notNull(),
  patientProblemId: varchar("patient_problem_id"),
  /** Controls whether this order is billed to the visit (administered) or not (prescription). */
  orderType: medicationOrderTypeEnum("order_type").notNull().default("prescription"),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  /** Route of administration (required for clinic/hospital administered orders). */
  route: text("route"),
  /** Infusion rate (only used for IV administered orders). */
  rate: text("rate"),
  duration: text("duration"),
  quantity: integer("quantity"),
  instructions: text("instructions"),
  status: prescriptionStatusEnum("status").notNull().default("active"),
  dispensedAt: timestamp("dispensed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const medicationAdministrations = pgTable("medication_administrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  admissionId: varchar("admission_id").notNull(),
  prescriptionId: varchar("prescription_id").notNull(),
  patientId: varchar("patient_id").notNull(),
  administeredBy: varchar("administered_by").notNull(),
  administeredAt: timestamp("administered_at").defaultNow(),
  doseGiven: text("dose_given"),
  notes: text("notes"),
});

export const encounterMedicationAdministrations = pgTable("encounter_medication_administrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: varchar("encounter_id").notNull(),
  prescriptionId: varchar("prescription_id").notNull(),
  patientId: varchar("patient_id").notNull(),
  administeredBy: varchar("administered_by").notNull(),
  administeredAt: timestamp("administered_at").defaultNow(),
  doseGiven: text("dose_given"),
  notes: text("notes"),
});

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft", "pending", "paid", "partial", "cancelled"
]);

/** Admin-configurable default prices for billing (lab, meds, imaging, problems, clinical). */
export const billingChargeCategoryEnum = pgEnum("billing_charge_category", [
  "lab_order",
  "medication",
  "imaging",
  "problem_list",
  "clinical_charge",
]);

/** Line items accumulated on an encounter for internal orders + visit type (excludes external orders). */
export const visitChargeLineKindEnum = pgEnum("visit_charge_line_kind", [
  "visit_type",
  "lab_order",
  "imaging_order",
  "prescription",
  /** Added from price list by billing staff (distinct source_id per line). */
  "manual",
]);

export const encounterVisitCharges = pgTable(
  "encounter_visit_charges",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    encounterId: varchar("encounter_id").notNull(),
    patientId: varchar("patient_id").notNull(),
    lineKind: visitChargeLineKindEnum("line_kind").notNull(),
    /** Idempotency key: FK to order/prescription id, or sentinel for visit type. */
    sourceId: varchar("source_id").notNull(),
    /** User id who placed the order / authored the line (for display in visit charges). */
    orderedByUserId: varchar("ordered_by_user_id"),
    catalogCategory: billingChargeCategoryEnum("catalog_category").notNull(),
    catalogItemKey: text("catalog_item_key").notNull(),
    description: text("description").notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("encounter_visit_charge_enc_kind_src").on(t.encounterId, t.lineKind, t.sourceId)],
);

export const billingChargeCatalog = pgTable(
  "billing_charge_catalog",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    category: billingChargeCategoryEnum("category").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("billing_charge_catalog_cat_item").on(t.category, t.itemKey)],
);

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

/** Whether a clinical template is a general form or a consent document (systems admin chooses at creation). */
export const clinicalFormTemplateKinds = ["form", "consent"] as const;
export type ClinicalFormTemplateKind = (typeof clinicalFormTemplateKinds)[number];

/** Intake / forms & consent templates created by Systems administrator (security role). */
export type ClinicalFormField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox";
  required?: boolean;
  options?: string[];
};

export const clinicalForms = pgTable("clinical_forms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull().$type<ClinicalFormField[]>(),
  /** `form` = general form; `consent` = consent document. */
  templateKind: varchar("template_kind", { length: 32 }).notNull().default("form").$type<ClinicalFormTemplateKind>(),
  /** Only active templates should be selectable in the patient chart workflow. */
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** Historical table for prior anonymous submissions (no longer written by the API). */
export const clinicalFormSubmissions = pgTable("clinical_form_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formId: varchar("form_id")
    .notNull()
    .references(() => clinicalForms.id),
  answers: jsonb("answers").notNull().$type<Record<string, string | number | boolean>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

/** Patient-linked form/consent completions (staff-assisted or patient QR). */
export const clinicalFormCompletionModes = ["staff_assisted", "patient_qr"] as const;
export type ClinicalFormCompletionMode = (typeof clinicalFormCompletionModes)[number];

export const clinicalFormPatientCompletions = pgTable("clinical_form_patient_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id")
    .notNull()
    .references(() => patients.id),
  formId: varchar("form_id")
    .notNull()
    .references(() => clinicalForms.id),
  answers: jsonb("answers").notNull().default(sql`'{}'::jsonb`).$type<Record<string, string | number | boolean>>(),
  completionMode: varchar("completion_mode", { length: 32 })
    .notNull()
    .$type<ClinicalFormCompletionMode>(),
  /** Single-use style session token for mobile QR fill (cleared after completion). */
  qrToken: varchar("qr_token"),
  qrExpiresAt: timestamp("qr_expires_at"),
  /** Provider signature for procedural consents (set after staff/patient completion). */
  providerSignedAt: timestamp("provider_signed_at"),
  providerSignedByUserId: varchar("provider_signed_by_user_id"),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id"),
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
/**
 * API / JSON: `scheduledDate` is an ISO string; drizzle-zod defaults expect `Date`.
 * Use omit+extend so coercion reliably replaces the generated field (plain `.extend()` can still fail).
 * `duration` may arrive as a string from some clients — coerce to int.
 */
export const insertAppointmentSchema = createInsertSchema(appointments)
  .omit({ id: true, createdAt: true, scheduledDate: true, duration: true })
  .extend({
    scheduledDate: z.coerce.date(),
    duration: z.coerce.number().int().min(1).max(480).default(30),
  });
export const insertCommonVisitReasonSchema = createInsertSchema(commonVisitReasons).omit({ id: true, createdAt: true });
export const insertBedSchema = createInsertSchema(beds).omit({ id: true, createdAt: true });
/** Walk-in / API create: only name, notes, facility — server sets status `open`. */
export const createBedBodySchema = z.object({
  name: z.string().trim().min(1).max(500),
  /** Coerce null/missing to "" so JSON `notes: null` and omitted keys both trim to DB NULL when empty. */
  notes: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().max(4000)),
  facilityId: z.string().min(1).optional(),
});
export const bedStatusReasonBodySchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(2000),
});
export const bedRestoreBodySchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});
export const insertBedAssignmentSchema = createInsertSchema(bedAssignments).omit({
  id: true,
  admittedAt: true,
  dischargedAt: true,
});
export const insertLabOrderSchema = createInsertSchema(labOrders).omit({ id: true, createdAt: true, completedAt: true });
export const insertImagingOrderSchema = createInsertSchema(imagingOrders).omit({ id: true, createdAt: true, completedAt: true });
export const insertImagingResultSchema = createInsertSchema(imagingResults).omit({ id: true, createdAt: true });
export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({ id: true, createdAt: true });
export const insertFollowUpContactSchema = createInsertSchema(followUpContacts).omit({ id: true, createdAt: true });
export const insertPrescriptionSchema = createInsertSchema(prescriptions).omit({ id: true, createdAt: true, dispensedAt: true });
export const insertMedicationAdministrationSchema = createInsertSchema(medicationAdministrations)
  .omit({ id: true })
  .extend({
    // Allow client to supply a precise admin time; DB default still applies if omitted.
    administeredAt: z.coerce.date().optional(),
  });
export const insertEncounterMedicationAdministrationSchema = createInsertSchema(encounterMedicationAdministrations)
  .omit({ id: true })
  .extend({
    // Allow client to supply a precise admin time; DB default still applies if omitted.
    administeredAt: z.coerce.date().optional(),
  });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export const insertBillingChargeCatalogSchema = createInsertSchema(billingChargeCatalog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertEncounterVisitChargeSchema = createInsertSchema(encounterVisitCharges).omit({
  id: true,
  createdAt: true,
});
export const patchBillingChargeCatalogBodySchema = z.object({
  unitPrice: z.string().min(1).max(24),
  label: z.string().min(1).max(400).optional(),
});
export const createBillingChargeCatalogBodySchema = z.object({
  category: z.enum(["lab_order", "medication", "imaging", "problem_list", "clinical_charge"]),
  itemKey: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9_]+$/i, "Use letters, numbers, underscores"),
  label: z.string().min(1).max(400),
  unitPrice: z.string().min(1).max(24),
  sortOrder: z.number().int().optional(),
});

export const addManualVisitChargeBodySchema = z.object({
  catalogCategory: z.enum(["lab_order", "medication", "imaging", "problem_list", "clinical_charge"]),
  catalogItemKey: z.string().min(1).max(200),
  quantity: z.coerce.number().int().positive().max(999).optional().default(1),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

export const insertClinicalFormSchema = createInsertSchema(clinicalForms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const clinicalFormFieldSchema = z
  .object({
    id: z.string().min(1).max(80).optional(),
    label: z.string().min(1).max(200),
    type: z.enum(["text", "textarea", "number", "date", "select", "checkbox"]),
    required: z.boolean().optional().default(false),
    options: z.array(z.string().min(1).max(200)).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "select" && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select fields need at least one option",
        path: ["options"],
      });
    }
  });

export const createClinicalFormBodySchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  kind: z.enum(clinicalFormTemplateKinds),
  /** Custom fields only; server merges mandatory patient identifier fields (MRN, name, DOB). */
  fields: z.array(clinicalFormFieldSchema).min(0).max(100),
});

export const updateClinicalFormBodySchema = createClinicalFormBodySchema;

export const clinicalFormSubmitAnswersBodySchema = z.object({
  answers: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

/** API: plain-text password; server hashes before insert. */
export const createUserBodySchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.enum(USER_ROLE_VALUES),
  email: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().email().optional()),
  phone: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().max(80).optional()),
  facilityId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().uuid().optional()
  ),
  isActive: z.boolean().optional().default(true),
});

/** Admin reset password for an existing user (plain password; server hashes). */
export const resetUserPasswordBodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const patchOrganizationSettingsBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  billingCurrency: z.string().length(3).optional(),
  patientIdentifierLabel: z.string().min(1).max(40).optional(),
  country: z.string().min(2).max(2).optional(),
  timeZone: z.string().min(1).max(120).optional(),
  logoUrl: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
});

export const patchRoleCapabilityBodySchema = z.object({
  role: z.enum(USER_ROLE_VALUES),
  capabilityId: z.string().min(1).max(128),
  allowed: z.boolean(),
});

export const patchUiTableColumnBodySchema = z.object({
  role: z.enum(USER_ROLE_VALUES),
  tableKey: z.string().min(1).max(128),
  columnId: z.string().min(1).max(128),
  hidden: z.boolean().optional(),
  label: z.union([z.string().max(200), z.null()]).optional(),
  sortOrder: z.number().int().min(0).max(99999).optional().nullable(),
});

export const postUiTableCustomColumnBodySchema = z.object({
  role: z.enum(USER_ROLE_VALUES),
  tableKey: z.string().min(1).max(128),
  label: z.string().min(1).max(200),
});

export const putUiTableColumnOrderBodySchema = z.object({
  role: z.enum(USER_ROLE_VALUES),
  tableKey: z.string().min(1).max(128),
  orderedColumnIds: z.array(z.string().min(1).max(128)).min(1),
});

export const deleteUiTableColumnQuerySchema = z.object({
  role: z.enum(USER_ROLE_VALUES),
  tableKey: z.string().min(1).max(128),
  columnId: z.string().min(1).max(128),
});

export const patchUiActivityLayoutBodySchema = z.object({
  role: z.enum(USER_ROLE_VALUES),
  context: z.enum(["toolbar", "patient_chart_review", "patient_chart_visit_doc", "admin_activities"]),
  activityId: z.string().min(1).max(128),
  labelOverride: z.union([z.string().max(200), z.literal(""), z.null()]).optional(),
  sortOrder: z.number().int().min(0).max(9999),
  hidden: z.boolean(),
  readOnly: z.boolean(),
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
export type InsertCommonVisitReason = z.infer<typeof insertCommonVisitReasonSchema>;
export type CommonVisitReason = typeof commonVisitReasons.$inferSelect;
export type InsertBed = z.infer<typeof insertBedSchema>;
export type Bed = typeof beds.$inferSelect;
export type InsertBedAssignment = z.infer<typeof insertBedAssignmentSchema>;
export type BedAssignment = typeof bedAssignments.$inferSelect;
export type InsertLabOrder = z.infer<typeof insertLabOrderSchema>;
export type LabOrder = typeof labOrders.$inferSelect;
export type InsertImagingOrder = z.infer<typeof insertImagingOrderSchema>;
export type ImagingOrder = typeof imagingOrders.$inferSelect;
export type InsertImagingResult = z.infer<typeof insertImagingResultSchema>;
export type ImagingResult = typeof imagingResults.$inferSelect;
export type InsertPatientDocument = z.infer<typeof insertPatientDocumentSchema>;
export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertFollowUpContact = z.infer<typeof insertFollowUpContactSchema>;
export type FollowUpContact = typeof followUpContacts.$inferSelect;
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type Prescription = typeof prescriptions.$inferSelect;
export type InsertMedicationAdministration = z.infer<typeof insertMedicationAdministrationSchema>;
export type MedicationAdministration = typeof medicationAdministrations.$inferSelect;
export type InsertEncounterMedicationAdministration = z.infer<typeof insertEncounterMedicationAdministrationSchema>;
export type EncounterMedicationAdministration = typeof encounterMedicationAdministrations.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertBillingChargeCatalog = z.infer<typeof insertBillingChargeCatalogSchema>;
export type BillingChargeCatalog = typeof billingChargeCatalog.$inferSelect;
export type InsertEncounterVisitCharge = z.infer<typeof insertEncounterVisitChargeSchema>;
export type EncounterVisitCharge = typeof encounterVisitCharges.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertClinicalForm = z.infer<typeof insertClinicalFormSchema>;
export type ClinicalForm = typeof clinicalForms.$inferSelect;
export type ClinicalFormSubmission = typeof clinicalFormSubmissions.$inferSelect;
export type ClinicalFormPatientCompletion = typeof clinicalFormPatientCompletions.$inferSelect;
