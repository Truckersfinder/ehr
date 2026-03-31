import type { PatientCallReasonOption } from "@shared/patient-call-reasons";

const REASONS: PatientCallReasonOption[] = [
  { value: "appointment_reminder", label: "Appointment reminder" },
  { value: "results_follow_up", label: "Lab / imaging results follow-up" },
  { value: "medication_follow_up", label: "Medication follow-up" },
  { value: "care_plan_check_in", label: "Care plan check-in" },
  { value: "billing_insurance", label: "Billing / insurance clarification" },
  { value: "referral_coordination", label: "Referral coordination" },
  { value: "no_show_follow_up", label: "No-show follow-up" },
  { value: "wellness_outreach", label: "Wellness outreach" },
  { value: "other", label: "Other" },
];

export function getPatientCallReasons(): PatientCallReasonOption[] {
  return REASONS;
}

