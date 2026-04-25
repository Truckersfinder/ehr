import type { Encounter, Patient, PatientAllergy, PatientProblem, Prescription } from "@shared/schema";

/** Static sample data for Systems Administrator portal preview only. */
export const PATIENT_PORTAL_PREVIEW_PATIENT = {
  id: "preview-patient",
  mrn: "MRN-2026-0000",
  firstName: "Sample",
  lastName: "Patient",
  dateOfBirth: "1985-06-15",
  gender: "female" as const,
  nationalId: null,
  phone: "+1 555 0100",
  email: "sample.patient@example.com",
  address: "123 Health Street",
  city: "Nairobi",
  state: null,
  country: "KE",
  bloodGroup: "O+",
  profilePhotoUrl: null,
  allergies: null,
  nextOfKinName: "Jamie Sample",
  nextOfKinPhone: "+1 555 0101",
  nextOfKinRelation: "Spouse",
  primaryProviderId: null,
  facilityId: null,
  insuranceCarrier: null,
  insurancePolicyNumber: null,
  insuranceGroupNumber: null,
  billingGuarantorName: null,
  billingGuarantorPhone: null,
  billingGuarantorRelation: null,
  billingNotes: null,
  isActive: true,
  createdAt: new Date(),
  portalEnabled: false,
  portalAccessEmail: null,
  portalInviteToken: null,
  portalPinHash: null,
  portalInviteSentAt: null,
} as unknown as Patient;

export const PATIENT_PORTAL_PREVIEW_USERS = [{ id: "u1", fullName: "Dr. Preview", username: "preview" }];

export const PATIENT_PORTAL_PREVIEW_PRESCRIBER_MAP = new Map<string, string>([["u1", "Dr. Preview"]]);

export const PATIENT_PORTAL_PREVIEW_PRESCRIPTIONS = [
  {
    id: "rx-preview-1",
    patientId: "preview-patient",
    encounterId: null,
    admissionId: null,
    prescribedBy: "u1",
    patientProblemId: null,
    orderType: "prescription",
    medicationName: "Sample Medication",
    dosage: "10 mg",
    frequency: "Once daily",
    route: "oral",
    rate: null,
    duration: null,
    quantity: 30,
    instructions: "Take with food.",
    status: "active",
    dispensedAt: null,
    createdAt: new Date(),
  },
] as unknown as Prescription[];

export const PATIENT_PORTAL_PREVIEW_PROBLEMS = [
  {
    id: "prob-preview-1",
    patientId: "preview-patient",
    problem: "Hypertension",
    addedBy: null,
    status: "active",
    problemStartDate: "2024-01-01",
    symptoms: null,
    resolution: null,
    createdAt: new Date(),
  },
] as unknown as PatientProblem[];

export const PATIENT_PORTAL_PREVIEW_ALLERGIES = [
  {
    id: "all-preview-1",
    patientId: "preview-patient",
    allergen: "Penicillin",
    severity: "HIGH" as const,
    reactionType: "Rash",
    addedBy: null,
    createdAt: new Date(),
  },
] as unknown as PatientAllergy[];

export const PATIENT_PORTAL_PREVIEW_ENCOUNTERS = [
  {
    id: "enc-preview-1",
    patientId: "preview-patient",
    clinicianId: "u1",
    facilityId: null,
    appointmentId: null,
    type: "outpatient",
    status: "completed",
    chargesFinalizedAt: null,
    chargesFinalizedBy: null,
    chiefComplaint: null,
    subjective: null,
    objective: null,
    assessment: null,
    plan: null,
    icdCodes: null,
    patientInstructions: null,
    visitDate: new Date(),
    createdAt: new Date(),
  },
] as unknown as Encounter[];
