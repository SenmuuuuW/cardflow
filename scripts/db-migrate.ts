import { config as loadEnvironment } from "dotenv";
import { applyMigrations } from "./db-migrations";

async function main(): Promise<void> {
  loadEnvironment({ path: ".env.local" });

  const useTestDatabase = process.argv.includes("--test");
  const environmentVariable = useTestDatabase ? "TEST_DATABASE_URL" : "DATABASE_URL";
  const connectionString = process.env[environmentVariable];

  if (!connectionString) {
    throw new Error(`${environmentVariable} must be set before applying migrations.`);
  }

  await applyMigrations(connectionString, { resetTestDatabase: useTestDatabase });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
