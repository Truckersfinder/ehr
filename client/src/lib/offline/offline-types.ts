import type { Patient } from "@shared/schema";

/** Mirrors domain types used in offline paths (subset of @shared/schema). */
export type OfflineEntityType = "patient" | "clinical_form_completion" | "generic";

export type PendingSyncAction = "create" | "update";

export interface PendingSyncItem {
  id: string;
  queuedAt: number;
  action: PendingSyncAction;
  method: "POST" | "PATCH" | "PUT";
  /** Path including query string, e.g. `/api/patients/uuid` */
  path: string;
  body: unknown;
  entityType: OfflineEntityType;
  entityId?: string;
  /** stableStringify(slimPatient(serverPatient)) at edit start — offline conflict detection vs server GET */
  baseEntitySnapshotJson?: string;
}

export interface OfflineConflictRecord {
  id: string;
  createdAt: number;
  pendingItemId: string;
  path: string;
  method: "POST" | "PATCH" | "PUT";
  /** Payload we attempted to apply */
  queuedBody: unknown;
  /** Latest server entity when conflict was detected (Patient for demographics) */
  serverSnapshot: unknown;
  message: string;
}

/** Demographics-related fields used for optimistic PATCH merge + conflict base snapshot. */
export function slimPatientForOfflineCompare(p: Patient): Record<string, unknown> {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    nationalId: p.nationalId,
    phone: p.phone,
    email: p.email,
    address: p.address,
    city: p.city,
    state: p.state,
    country: p.country,
    bloodGroup: p.bloodGroup,
    allergies: p.allergies,
    nextOfKinName: p.nextOfKinName,
    nextOfKinPhone: p.nextOfKinPhone,
    nextOfKinRelation: p.nextOfKinRelation,
    insuranceCarrier: p.insuranceCarrier,
    insurancePolicyNumber: p.insurancePolicyNumber,
    insuranceGroupNumber: p.insuranceGroupNumber,
    billingGuarantorName: p.billingGuarantorName,
    billingGuarantorPhone: p.billingGuarantorPhone,
    billingGuarantorRelation: p.billingGuarantorRelation,
    billingNotes: p.billingNotes,
    portalEnabled: p.portalEnabled,
    portalAccessEmail: p.portalAccessEmail,
    primaryProviderId: p.primaryProviderId,
  };
}
