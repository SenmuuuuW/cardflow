import "server-only";

import type { CardflowUserRole } from "@/auth/session";

export type Phase0DiagnosticRawRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
  purchaseCostCents: number;
  purchaseCurrency: string;
  internalProcurementReference: string;
};

export type Phase0DiagnosticAdministratorRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
  purchaseCostCents: number;
  purchaseCurrency: string;
};

export type Phase0DiagnosticWarehouseRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
};

// This deterministic fixture is non-production Phase 0 diagnostic data, not a purchase-order model.
export const phase0DiagnosticRawRecord: Phase0DiagnosticRawRecord = {
  id: "phase0-diagnostic-record",
  itemLabel: "Phase 0 diagnostic card record",
  expectedQuantity: 1,
  statusLabel: "Diagnostic only",
  purchaseCostCents: 12_500,
  purchaseCurrency: "USD",
  internalProcurementReference: "phase0-internal-procurement-reference",
};

export function toPhase0DiagnosticAdministratorRecord(
  record: Phase0DiagnosticRawRecord,
): Phase0DiagnosticAdministratorRecord {
  return {
    id: record.id,
    itemLabel: record.itemLabel,
    expectedQuantity: record.expectedQuantity,
    statusLabel: record.statusLabel,
    purchaseCostCents: record.purchaseCostCents,
    purchaseCurrency: record.purchaseCurrency,
  };
}

export function toPhase0DiagnosticWarehouseRecord(
  record: Phase0DiagnosticRawRecord,
): Phase0DiagnosticWarehouseRecord {
  return {
    id: record.id,
    itemLabel: record.itemLabel,
    expectedQuantity: record.expectedQuantity,
    statusLabel: record.statusLabel,
  };
}

export function toPhase0DiagnosticRecordForRole(
  role: CardflowUserRole,
  record: Phase0DiagnosticRawRecord = phase0DiagnosticRawRecord,
): Phase0DiagnosticAdministratorRecord | Phase0DiagnosticWarehouseRecord {
  if (role === "administrator") {
    return toPhase0DiagnosticAdministratorRecord(record);
  }

  return toPhase0DiagnosticWarehouseRecord(record);
}
