import { randomUUID } from "node:crypto";
import type { Encounter, ImagingOrder, InsertEncounterVisitCharge, LabOrder, Prescription } from "@shared/schema";
import * as rules from "@shared/visit-charge-rules";
import { storage } from "./storage";

type LineKind = InsertEncounterVisitCharge["lineKind"];

async function insertChargeLine(args: {
  encounterId: string;
  patientId: string;
  lineKind: LineKind;
  sourceId: string;
  orderedByUserId?: string | null;
  catalogCategory: InsertEncounterVisitCharge["catalogCategory"];
  catalogItemKey: string;
  fallbackDescription: string;
  descriptionOverride?: string | null;
  quantity?: number;
}): Promise<void> {
  const catalogRow = await storage.getBillingChargeCatalogItem(args.catalogCategory, args.catalogItemKey);
  const unitPrice = catalogRow?.unitPrice ?? "0";
  const description = args.descriptionOverride?.trim() || catalogRow?.label || args.fallbackDescription;
  const qty = args.quantity != null && args.quantity > 0 ? Math.floor(args.quantity) : 1;
  const amount = rules.formatMoneyAmount(unitPrice, qty);
  await storage.tryInsertEncounterVisitCharge({
    encounterId: args.encounterId,
    patientId: args.patientId,
    lineKind: args.lineKind,
    sourceId: args.sourceId,
    orderedByUserId: args.orderedByUserId ?? null,
    catalogCategory: args.catalogCategory,
    catalogItemKey: args.catalogItemKey,
    description,
    unitPrice,
    quantity: qty,
    amount,
  });
}

export async function applyVisitTypeCharge(encounter: Encounter): Promise<void> {
  if (!encounter?.id || !encounter.patientId) return;
  const catalogItemKey = rules.visitTypeCatalogItemKey(encounter.type);
  await insertChargeLine({
    encounterId: encounter.id,
    patientId: encounter.patientId,
    lineKind: "visit_type",
    sourceId: rules.VISIT_TYPE_CHARGE_SOURCE_ID,
    orderedByUserId: (encounter as any).clinicianId ?? null,
    catalogCategory: "clinical_charge",
    catalogItemKey,
    fallbackDescription: `Visit (${encounter.type})`,
  });
}

export async function applyLabOrderCharge(order: LabOrder): Promise<void> {
  if (!order.encounterId || rules.isExternalOrder(order.internalExternal)) return;
  const catalogItemKey = rules.labCatalogItemKeyFromOrder(order.testCode, order.testName);
  await insertChargeLine({
    encounterId: order.encounterId,
    patientId: order.patientId,
    lineKind: "lab_order",
    sourceId: order.id,
    orderedByUserId: (order as any).orderedBy ?? null,
    catalogCategory: "lab_order",
    catalogItemKey,
    fallbackDescription: order.testName || catalogItemKey,
  });
}

export async function applyImagingOrderCharge(order: ImagingOrder): Promise<void> {
  if (!order.encounterId || rules.isExternalOrder(order.internalExternal)) return;
  const catalogItemKey = rules.imagingCatalogItemKeyFromOrder(order.modality, order.title);
  await insertChargeLine({
    encounterId: order.encounterId,
    patientId: order.patientId,
    lineKind: "imaging_order",
    sourceId: order.id,
    orderedByUserId: (order as any).orderedBy ?? null,
    catalogCategory: "imaging",
    catalogItemKey,
    fallbackDescription: order.title || catalogItemKey,
  });
}

export async function applyManualCatalogCharge(args: {
  encounterId: string;
  patientId: string;
  catalogCategory: InsertEncounterVisitCharge["catalogCategory"];
  catalogItemKey: string;
  quantity: number;
  orderedByUserId: string | null;
}): Promise<void> {
  const catalogRow = await storage.getBillingChargeCatalogItem(args.catalogCategory, args.catalogItemKey);
  if (!catalogRow) {
    throw new Error("Price list item not found for this category and key");
  }
  const sourceId = randomUUID();
  await insertChargeLine({
    encounterId: args.encounterId,
    patientId: args.patientId,
    lineKind: "manual",
    sourceId,
    orderedByUserId: args.orderedByUserId ?? null,
    catalogCategory: args.catalogCategory,
    catalogItemKey: args.catalogItemKey,
    fallbackDescription: catalogRow.label || args.catalogItemKey,
    quantity: args.quantity,
  });
}

export async function applyPrescriptionCharge(rx: Prescription): Promise<void> {
  if (!rx.encounterId) return;
  if (rx.status === "cancelled") return;
  if (!rules.isClinicAdministeredMedicationOrder((rx as any).orderType)) return;
  const catalogItemKey = rules.medicationCatalogItemKeyFromPrescription();
  const qty = rx.quantity != null && rx.quantity > 0 ? rx.quantity : 1;
  await insertChargeLine({
    encounterId: rx.encounterId,
    patientId: rx.patientId,
    lineKind: "prescription",
    sourceId: rx.id,
    orderedByUserId: (rx as any).prescribedBy ?? null,
    catalogCategory: "medication",
    catalogItemKey,
    fallbackDescription: rx.medicationName || "Medication",
    descriptionOverride: rx.medicationName || null,
    quantity: qty,
  });
}

export async function removeLabOrderVisitCharge(order: Pick<LabOrder, "id">): Promise<void> {
  await storage.deleteEncounterVisitChargeByKindAndSource("lab_order", order.id);
}

export async function removeImagingOrderVisitCharge(order: Pick<ImagingOrder, "id">): Promise<void> {
  await storage.deleteEncounterVisitChargeByKindAndSource("imaging_order", order.id);
}

export async function removePrescriptionVisitCharge(rx: Pick<Prescription, "id">): Promise<void> {
  await storage.deleteEncounterVisitChargeByKindAndSource("prescription", rx.id);
}

/** After lab order update: drop line then re-add if still internal (handles internal ↔ external). */
export async function syncLabOrderVisitCharge(order: LabOrder): Promise<void> {
  if (!order.encounterId) return;
  await removeLabOrderVisitCharge(order);
  if (!rules.isExternalOrder(order.internalExternal)) {
    await applyLabOrderCharge(order);
  }
}

export async function syncImagingOrderVisitCharge(order: ImagingOrder): Promise<void> {
  if (!order.encounterId) return;
  await removeImagingOrderVisitCharge(order);
  if (!rules.isExternalOrder(order.internalExternal)) {
    await applyImagingOrderCharge(order);
  }
}

export async function syncPrescriptionVisitCharge(rx: Prescription): Promise<void> {
  if (!rx.encounterId) return;
  await removePrescriptionVisitCharge(rx);
  await applyPrescriptionCharge(rx);
}
