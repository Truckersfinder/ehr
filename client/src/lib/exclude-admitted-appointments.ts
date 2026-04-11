import type { Appointment } from "@shared/schema";

type AdmissionLike = { appointmentId?: string | null };

/**
 * Visits with an active bed assignment (overnight walk-in) are listed under
 * "Admitted Patients" only — exclude them from the day appointment schedule.
 */
export function excludeAppointmentsWithActiveAdmission<T extends Pick<Appointment, "id">>(
  appointments: T[],
  admissions: AdmissionLike[],
): T[] {
  const admittedApptIds = new Set(
    admissions
      .map((a) => a.appointmentId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  if (admittedApptIds.size === 0) return appointments;
  return appointments.filter((apt) => !admittedApptIds.has(apt.id));
}
