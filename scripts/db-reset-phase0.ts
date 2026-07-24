import { config as loadEnvironment } from "dotenv";

import { closeDatabaseConnection } from "@/db/client";
import { resetPhase0DiagnosticData } from "@/diagnostic/phase0-diagnostic-seed";

loadEnvironment({ path: ".env.local" });

async function main(): Promise<void> {
  try {
    const result = await resetPhase0DiagnosticData();

    console.log(
      `Phase 0 reset complete: ${result.deletedSeedAccountCount} seed-owned accounts and ${result.deletedDiagnosticRecordIds.length} diagnostic records removed.`,
    );
    console.log(`Removed diagnostic record IDs: ${result.deletedDiagnosticRecordIds.join(", ")}`);
  } finally {
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
