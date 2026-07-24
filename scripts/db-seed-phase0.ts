import { config as loadEnvironment } from "dotenv";

import { closeDatabaseConnection } from "@/db/client";
import { seedPhase0DiagnosticData } from "@/diagnostic/phase0-diagnostic-seed";

loadEnvironment({ path: ".env.local" });

async function main(): Promise<void> {
  try {
    const result = await seedPhase0DiagnosticData();

    console.log(
      `Phase 0 seed complete: administrator ${result.administrator.status}, warehouse ${result.warehouse.status}, ${result.reconciledDiagnosticRecordIds.length} diagnostic records reconciled.`,
    );
    console.log(`Diagnostic record IDs: ${result.reconciledDiagnosticRecordIds.join(", ")}`);
  } finally {
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
