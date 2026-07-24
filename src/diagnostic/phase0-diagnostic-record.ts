import "server-only";

import type { CardflowUserRole } from "@/auth/session";
import type { phase0DiagnosticCurrencyValues } from "@/db/schema";

export type Phase0DiagnosticCurrency = (typeof phase0DiagnosticCurrencyValues)[number];

export type Phase0DiagnosticRawRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
  purchaseCostCents: number;
  purchaseCurrency: Phase0DiagnosticCurrency;
};

export type Phase0DiagnosticAdministratorRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
  purchaseCostCents: number;
  purchaseCurrency: Phase0DiagnosticCurrency;
};

export type Phase0DiagnosticWarehouseRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
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
  record: Phase0DiagnosticRawRecord,
): Phase0DiagnosticAdministratorRecord | Phase0DiagnosticWarehouseRecord {
  if (role === "administrator") {
    return toPhase0DiagnosticAdministratorRecord(record);
  }

  return toPhase0DiagnosticWarehouseRecord(record);
}

export function toPhase0DiagnosticRecordsForRole(
  role: CardflowUserRole,
  records: readonly Phase0DiagnosticRawRecord[],
): Array<Phase0DiagnosticAdministratorRecord | Phase0DiagnosticWarehouseRecord> {
  return records.map((record) => toPhase0DiagnosticRecordForRole(role, record));
}
