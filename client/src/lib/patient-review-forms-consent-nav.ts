/**
 * Patient chart Review nav may link to Forms & Consent for point-of-care staff.
 * Clinic and systems administrators already have global Admin / toolbar access, so the
 * duplicate shortcut is hidden for those roles.
 */
export function showFormsConsentInPatientReviewNav(role: string | undefined): boolean {
  if (!role) return false;
  return role !== "super_admin" && role !== "security";
}
