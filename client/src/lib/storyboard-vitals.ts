import type { Vitals } from "@shared/schema";

/** Per-field “most recent value” from across vitals rows (each metric from the latest row that recorded it). */
export type StoryboardVitalsMerged = {
  pulseRate: number | null;
  pulseRecordedAt: string | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  bpRecordedAt: string | null;
  respiratoryRate: number | null;
  rrRecordedAt: string | null;
  temperature: number | null;
  temperatureRecordedAt: string | null;
  oxygenSaturation: number | null;
  oxygenSaturationRecordedAt: string | null;
  weight: number | null;
  weightRecordedAt: string | null;
  height: number | null;
  heightRecordedAt: string | null;
};

function toDecimal(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function recordedAtToIsoString(recordedAt: Vitals["recordedAt"]): string | null {
  if (recordedAt == null) return null;
  return recordedAt instanceof Date ? recordedAt.toISOString() : String(recordedAt);
}

export function mergeLatestStoryboardVitals(vitals: Vitals[]): StoryboardVitalsMerged | null {
  if (!vitals.length) return null;
  const sorted = [...vitals].sort(
    (a, b) => new Date(b.recordedAt ?? 0).getTime() - new Date(a.recordedAt ?? 0).getTime(),
  );
  const pulse = sorted.find((v) => v.heartRate != null);
  const bp = sorted.find((v) => v.bloodPressureSystolic != null || v.bloodPressureDiastolic != null);
  const rr = sorted.find((v) => v.respiratoryRate != null);
  const tempRow = sorted.find((v) => toDecimal(v.temperature) != null);
  const spo2Row = sorted.find((v) => v.oxygenSaturation != null);
  const wtRow = sorted.find((v) => toDecimal(v.weight) != null);
  const htRow = sorted.find((v) => toDecimal(v.height) != null);

  const pulseRate = pulse?.heartRate != null ? Number(pulse.heartRate) : null;
  const respiratoryRate = rr?.respiratoryRate != null ? Number(rr.respiratoryRate) : null;
  const oxygenSaturation = spo2Row?.oxygenSaturation != null ? Number(spo2Row.oxygenSaturation) : null;

  return {
    pulseRate: pulseRate != null && Number.isFinite(pulseRate) ? pulseRate : null,
    pulseRecordedAt: pulse ? recordedAtToIsoString(pulse.recordedAt) : null,
    bloodPressureSystolic: bp?.bloodPressureSystolic ?? null,
    bloodPressureDiastolic: bp?.bloodPressureDiastolic ?? null,
    bpRecordedAt: bp ? recordedAtToIsoString(bp.recordedAt) : null,
    respiratoryRate: respiratoryRate != null && Number.isFinite(respiratoryRate) ? respiratoryRate : null,
    rrRecordedAt: rr ? recordedAtToIsoString(rr.recordedAt) : null,
    temperature: tempRow ? toDecimal(tempRow.temperature) : null,
    temperatureRecordedAt: tempRow ? recordedAtToIsoString(tempRow.recordedAt) : null,
    oxygenSaturation: oxygenSaturation != null && Number.isFinite(oxygenSaturation) ? oxygenSaturation : null,
    oxygenSaturationRecordedAt: spo2Row ? recordedAtToIsoString(spo2Row.recordedAt) : null,
    weight: wtRow ? toDecimal(wtRow.weight) : null,
    weightRecordedAt: wtRow ? recordedAtToIsoString(wtRow.recordedAt) : null,
    height: htRow ? toDecimal(htRow.height) : null,
    heightRecordedAt: htRow ? recordedAtToIsoString(htRow.recordedAt) : null,
  };
}

/** Latest timestamp among all displayed metrics (for a single “last updated” line). */
export function storyboardVitalsLatestTimestamp(s: StoryboardVitalsMerged | null | undefined): Date | null {
  if (!s) return null;
  const times = [
    s.pulseRecordedAt,
    s.bpRecordedAt,
    s.rrRecordedAt,
    s.temperatureRecordedAt,
    s.oxygenSaturationRecordedAt,
    s.weightRecordedAt,
    s.heightRecordedAt,
  ].filter(Boolean) as string[];
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((t) => new Date(t).getTime())));
}

export function storyboardVitalsHasAnyValue(s: StoryboardVitalsMerged | null | undefined): boolean {
  if (!s) return false;
  return (
    s.pulseRate != null ||
    s.bloodPressureSystolic != null ||
    s.bloodPressureDiastolic != null ||
    s.respiratoryRate != null ||
    s.temperature != null ||
    s.oxygenSaturation != null ||
    s.weight != null ||
    s.height != null
  );
}
