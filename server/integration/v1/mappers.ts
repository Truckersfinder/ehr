import type { LabOrder, Patient } from "@shared/schema";

export function toFhirishPatient(p: Patient) {
  return {
    resourceType: "Patient",
    id: p.id,
    identifier: [{ system: "urn:oid:mrn", value: p.mrn }],
    name: [{ family: p.lastName, given: [p.firstName] }],
    gender: p.gender,
    birthDate: p.dateOfBirth,
    active: p.isActive,
    telecom: [
      ...(p.phone ? [{ system: "phone", value: p.phone }] : []),
      ...(p.email ? [{ system: "email", value: p.email }] : []),
    ],
    address: p.address ? [{ line: [p.address], city: p.city, state: p.state, country: p.country }] : undefined,
    meta: {
      facilityId: p.facilityId,
      lastUpdated: p.createdAt,
    },
  };
}

export function toFhirishObservationOrder(row: LabOrder) {
  return {
    resourceType: "ServiceRequest",
    id: row.id,
    code: { text: row.testName, code: row.testCode },
    status: row.status,
    subject: { reference: `Patient/${row.patientId}` },
    result: row.result
      ? [
          {
            resourceType: "Observation",
            valueString: row.result,
            valueQuantity: row.resultValue ? { value: row.resultValue } : undefined,
            referenceRange: row.referenceRange,
          },
        ]
      : [],
    meta: { critical: row.isCritical, completedAt: row.completedAt },
  };
}

