import { describe, expect, it } from "vitest";

import {
  toPhase0DiagnosticAdministratorRecord,
  toPhase0DiagnosticRecordsForRole,
  toPhase0DiagnosticWarehouseRecord,
  type Phase0DiagnosticRawRecord,
} from "./phase0-diagnostic-record";

const rawDiagnosticRecord: Phase0DiagnosticRawRecord = {
  id: "00000000-0000-4000-8000-0000000000a1",
  itemLabel: "Diagnostic Card Alpha (Mock)",
  expectedQuantity: 1,
  statusLabel: "Phase 0 diagnostic only",
  purchaseCostCents: 1_250,
  purchaseCurrency: "USD",
};

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
    expect(toPhase0DiagnosticAdministratorRecord(rawDiagnosticRecord)).toEqual({
      id: "00000000-0000-4000-8000-0000000000a1",
      itemLabel: "Diagnostic Card Alpha (Mock)",
      expectedQuantity: 1,
      statusLabel: "Phase 0 diagnostic only",
      purchaseCostCents: 1_250,
      purchaseCurrency: "USD",
    });
  });

  it("uses an explicit warehouse allow-list when raw diagnostic data gains sensitive fields", () => {
    const rawRecordWithAdditionalSensitiveFields = {
      id: rawDiagnosticRecord.id,
      itemLabel: rawDiagnosticRecord.itemLabel,
      expectedQuantity: rawDiagnosticRecord.expectedQuantity,
      statusLabel: rawDiagnosticRecord.statusLabel,
      purchaseCostCents: rawDiagnosticRecord.purchaseCostCents,
      purchaseCurrency: rawDiagnosticRecord.purchaseCurrency,
      internalProcurementReference: "synthetic internal reference",
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
      id: "00000000-0000-4000-8000-0000000000a1",
      itemLabel: "Diagnostic Card Alpha (Mock)",
      expectedQuantity: 1,
      statusLabel: "Phase 0 diagnostic only",
    });
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "purchaseCurrency")).toBe(false);
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "internalProcurementReference")).toBe(false);
    expect(hasKeyAtAnyDepth(serializedWarehouseRecord, "futureProcurementMetadata")).toBe(false);
  });

  it("maps a diagnostic list without widening the warehouse response shape", () => {
    expect(toPhase0DiagnosticRecordsForRole("china_warehouse", [rawDiagnosticRecord])).toEqual([
      {
        id: "00000000-0000-4000-8000-0000000000a1",
        itemLabel: "Diagnostic Card Alpha (Mock)",
        expectedQuantity: 1,
        statusLabel: "Phase 0 diagnostic only",
      },
    ]);
  });
});
