/**
 * Shared React Query key factories so list/detail invalidation stays consistent.
 * Prefix matches (e.g. ["/api/patient-documents"]) still invalidate all patient-specific lists.
 */
export const queryKeys = {
  patientDocuments: {
    root: ["/api/patient-documents"] as const,
    list: (patientId: string) => ["/api/patient-documents", `?patientId=${patientId}`] as const,
  },
  labOrders: {
    root: ["/api/lab-orders"] as const,
    list: (patientId: string) => ["/api/lab-orders", `?patientId=${patientId}`] as const,
  },
  imagingOrders: {
    root: ["/api/imaging-orders"] as const,
    list: (patientId: string) => ["/api/imaging-orders", `?patientId=${patientId}`] as const,
  },
  imagingResults: {
    root: ["/api/imaging-results"] as const,
    list: (patientId: string) => ["/api/imaging-results", `?patientId=${patientId}`] as const,
  },
  patients: {
    root: ["/api/patients"] as const,
    /** Matches Patients list: `["/api/patients", search ? "?search=..." : ""]` */
    list: (searchQueryOrEmpty: string) => ["/api/patients", searchQueryOrEmpty] as const,
    detail: (patientId: string) => ["/api/patients", patientId] as const,
  },
  users: {
    root: ["/api/users"] as const,
  },
  appointments: {
    root: ["/api/appointments"] as const,
    dayRange: (startIso: string, endIso: string) => ["/api/appointments", "day", startIso, endIso] as const,
    detail: (appointmentId: string) => ["/api/appointments", appointmentId] as const,
  },
  encounters: {
    root: ["/api/encounters"] as const,
    detail: (encounterId: string) => ["/api/encounters", encounterId] as const,
    listByPatient: (patientId: string) => ["/api/encounters", `?patientId=${patientId}`] as const,
  },
  prescriptions: {
    root: ["/api/prescriptions"] as const,
    list: (patientId: string) => ["/api/prescriptions", `?patientId=${patientId}`] as const,
  },
  invoices: {
    root: ["/api/invoices"] as const,
    detail: (invoiceId: string) => ["/api/invoices", invoiceId] as const,
  },
  billing: {
    todaysVisits: (dateISO: string) => ["/api/billing/todays-visits", dateISO] as const,
  },
  billingChargeCatalog: {
    root: ["/api/billing/charge-catalog"] as const,
  },
  facilityBillingSettings: {
    root: ["/api/facility/billing-settings"] as const,
  },
  dashboard: {
    stats: ["/api/dashboard/stats"] as const,
    overdueVisits: (startISO: string, endISO: string) => ["/api/dashboard/overdue-visits", startISO, endISO] as const,
  },
  commonVisitReasons: {
    root: ["/api/common-visit-reasons"] as const,
  },
  vitals: {
    byEncounter: (encounterId: string) => ["/api/vitals", encounterId] as const,
  },
  followUpContacts: {
    root: ["/api/follow-up-contacts"] as const,
    list: (patientId: string) => ["/api/follow-up-contacts", `?patientId=${patientId}`] as const,
  },
} as const;
