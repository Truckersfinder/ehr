import type { User } from "@shared/schema";

/**
 * User-facing role titles. Database enum values (e.g. super_admin, security) are unchanged.
 */
export const USER_ROLE_LABELS: Record<User["role"], string> = {
  super_admin: "Clinic Administrator",
  clinician: "Clinician",
  nurse: "Nurse",
  lab_tech: "Lab Tech",
  reception: "Receptionist",
  security: "Systems administrator",
  pharmacist: "Pharmacist",
};

/** Role pickers (Admin → create user, etc.) */
export const ROLE_OPTIONS: { value: User["role"]; label: string }[] = [
  { value: "super_admin", label: USER_ROLE_LABELS.super_admin },
  { value: "clinician", label: USER_ROLE_LABELS.clinician },
  { value: "nurse", label: USER_ROLE_LABELS.nurse },
  { value: "lab_tech", label: USER_ROLE_LABELS.lab_tech },
  { value: "reception", label: USER_ROLE_LABELS.reception },
  { value: "security", label: USER_ROLE_LABELS.security },
];

/**
 * Text shown next to the user icon in the app header.
 * Generic privileged accounts use the role title; named staff keep their full name.
 */
export function headerUserDisplayName(user: {
  role: string;
  fullName?: string | null;
  username: string;
}): string {
  if (user.role === "super_admin") return USER_ROLE_LABELS.super_admin;
  if (user.role === "security") return USER_ROLE_LABELS.security;
  if (user.role === "pharmacist") return USER_ROLE_LABELS.pharmacist;
  return user.fullName?.trim() || user.username;
}
