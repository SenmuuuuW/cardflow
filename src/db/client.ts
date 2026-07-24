import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type CardflowDatabase = NodePgDatabase<typeof schema>;

export type DatabaseConnection = {
  db: CardflowDatabase;
  close: () => Promise<void>;
};

declare global {
  var cardflowDatabaseConnection: DatabaseConnection | undefined;
}

export function createDatabaseConnection(connectionString: string): DatabaseConnection {
  const pool = new Pool({ connectionString });

  return {
    db: drizzle({ client: pool, schema }),
    close: () => pool.end(),
  };
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set before server database access.");
  }

  return databaseUrl;
}

export function getDatabaseConnection(): DatabaseConnection {
  if (!globalThis.cardflowDatabaseConnection) {
    globalThis.cardflowDatabaseConnection = createDatabaseConnection(getDatabaseUrl());
  }

  return globalThis.cardflowDatabaseConnection;
}

export function getDatabase(): CardflowDatabase {
  return getDatabaseConnection().db;
}
