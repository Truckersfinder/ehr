import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { encounters, prescriptions } from "@shared/schema";

export async function getMedsAdminCounts(args: { appointmentIds: string[]; admissionIds: string[] }) {
  const appointmentIds = args.appointmentIds.filter(Boolean);
  const admissionIds = args.admissionIds.filter(Boolean);

  const appointmentCounts = appointmentIds.length
    ? await db
        .select({
          appointmentId: encounters.appointmentId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(prescriptions)
        .innerJoin(encounters, eq(prescriptions.encounterId, encounters.id))
        .where(
          and(
            inArray(encounters.appointmentId, appointmentIds),
            eq(prescriptions.orderType, "administered" as any),
            sql`${prescriptions.status} <> 'cancelled'`,
          ),
        )
        .groupBy(encounters.appointmentId)
    : [];

  const admissionCounts = admissionIds.length
    ? await db
        .select({
          admissionId: (prescriptions as any).admissionId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(prescriptions)
        .where(
          and(
            inArray((prescriptions as any).admissionId, admissionIds),
            eq(prescriptions.orderType, "administered" as any),
            sql`${prescriptions.status} <> 'cancelled'`,
          ),
        )
        .groupBy((prescriptions as any).admissionId)
    : [];

  return {
    byAppointmentId: Object.fromEntries(
      appointmentCounts
        .filter((r) => !!r.appointmentId)
        .map((r) => [String(r.appointmentId), Number(r.count)]),
    ) as Record<string, number>,
    byAdmissionId: Object.fromEntries(
      admissionCounts
        .filter((r) => !!(r as any).admissionId)
        .map((r: any) => [String(r.admissionId), Number(r.count)]),
    ) as Record<string, number>,
  };
}

