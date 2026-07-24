import { describe, expect, it } from "vitest";

import {
  phase0DiagnosticRawRecord,
  toPhase0DiagnosticAdministratorRecord,
  toPhase0DiagnosticWarehouseRecord,
} from "./phase0-diagnostic-record";

function hasKeyAtAnyDepth(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasKeyAtAnyDepth(item, key));
  }

  const record = value as Record<string, unknown>;

  return (
    Object.hasOwn(record, key) ||
    Object.values(record).some((item) => hasKeyAtAnyDepth(item, key))
  );
}

describe("Phase 0 diagnostic response shapes", () => {
  it("allows administrators to receive the approved purchase-cost fields", () => {
    expect(toPhase0DiagnosticAdministratorRecord(phase0DiagnosticRawRecord)).toEqual({
      id: "phase0-diagnostic-record",
      itemLabel: "Phase 0 diagnostic card record",
      expectedQuantity: 1,
      statusLabel: "Diagnostic only",
      purchaseCostCents: 12_500,
      purchaseCurrency: "USD",
    });
  });

  it("uses an explicit warehouse allow-list when raw diagnostic data gains sensitive fields", () => {
    const rawRecordWithAdditionalSensitiveFields = {
      id: phase0DiagnosticRawRecord.id,
      itemLabel: phase0DiagnosticRawRecord.itemLabel,
      expectedQuantity: phase0DiagnosticRawRecord.expectedQuantity,
      statusLabel: phase0DiagnosticRawRecord.statusLabel,
      purchaseCostCents: phase0DiagnosticRawRecord.purchaseCostCents,
      purchaseCurrency: phase0DiagnosticRawRecord.purchaseCurrency,
      internalProcurementReference: phase0DiagnosticRawRecord.internalProcurementReference,
      futureProcurementMetadata: {
        purchaseCostCents: 9_999,
        purchaseCurrency: "USD",
        internalNote: "must never reach a warehouse browser",
      },
    };
    const warehouseRecord = toPhase0DiagnosticWarehouseRecord(
      rawRecordWithAdditionalSensitiveFields,
    );
    const serializedWarehouseRecord = JSON.parse(JSON.stringify(warehouseRecord)) as unknown;

    expect(warehouseRecord).toEqual({
      id: "phase0-diagnostic-record",
      itemLabel: "Phase 0 diagnostic card record",
      expectedQuantity: 1,
      statusLabel: "Diagnostic only",
    });
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "purchaseCurrency")).toBe(false);
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "internalProcurementReference")).toBe(false);
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "futureProcurementMetadata")).toBe(false);
  });
});
