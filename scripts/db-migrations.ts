import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = path.resolve(process.cwd(), "drizzle");
const localDatabaseHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function assertTestDatabaseUrl(connectionString: string): void {
  const testUrl = new URL(connectionString);
  const databaseName = testUrl.pathname.slice(1).toLowerCase();

  if (!databaseName.includes("test")) {
    throw new Error("TEST_DATABASE_URL must target a database whose name includes 'test'.");
  }

  if (!localDatabaseHosts.has(testUrl.hostname.toLowerCase())) {
    throw new Error("TEST_DATABASE_URL must target a local database for the destructive test reset.");
  }

  const developmentUrl = process.env.DATABASE_URL;

  if (developmentUrl) {
    const developmentDatabaseName = new URL(developmentUrl).pathname.slice(1).toLowerCase();

    if (developmentDatabaseName === databaseName) {
      throw new Error("TEST_DATABASE_URL must target a different database from DATABASE_URL.");
    }
  }
}

export async function resetTestDatabase(connectionString: string): Promise<void> {
  assertTestDatabaseUrl(connectionString);

  const pool = new Pool({ connectionString });

  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
  } finally {
    await pool.end();
  }
}

export async function applyMigrations(
  connectionString: string,
  options: { resetTestDatabase?: boolean } = {},
): Promise<void> {
  if (options.resetTestDatabase) {
    await resetTestDatabase(connectionString);
  }

  const pool = new Pool({ connectionString });

  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
