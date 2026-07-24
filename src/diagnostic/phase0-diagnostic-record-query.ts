import "server-only";

import { asc } from "drizzle-orm";

import { getDatabase, type CardflowDatabase } from "@/db/client";
import { phase0DiagnosticRecords } from "@/db/schema";

import type { Phase0DiagnosticRawRecord } from "./phase0-diagnostic-record";

export type Phase0DiagnosticRecordReader = {
  list: () => Promise<Phase0DiagnosticRawRecord[]>;
};

export function createPhase0DiagnosticRecordReader(
  database: CardflowDatabase,
): Phase0DiagnosticRecordReader {
  return {
    list: async () =>
      database
        .select({
          id: phase0DiagnosticRecords.id,
          itemLabel: phase0DiagnosticRecords.itemLabel,
          expectedQuantity: phase0DiagnosticRecords.expectedQuantity,
          statusLabel: phase0DiagnosticRecords.statusLabel,
          purchaseCostCents: phase0DiagnosticRecords.purchaseCostCents,
          purchaseCurrency: phase0DiagnosticRecords.purchaseCurrency,
        })
        .from(phase0DiagnosticRecords)
        .orderBy(asc(phase0DiagnosticRecords.itemLabel), asc(phase0DiagnosticRecords.id)),
  };
}

export async function listPhase0DiagnosticRecords(): Promise<Phase0DiagnosticRawRecord[]> {
  return createPhase0DiagnosticRecordReader(getDatabase()).list();
}
