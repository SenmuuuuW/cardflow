import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import {
  phase0DiagnosticUploadIntents,
  phase0DiagnosticUploadSessions,
  users,
} from "@/db/schema";
import { applyMigrations, resetTestDatabase } from "../../scripts/db-migrations";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set before running database tests.");
}

let connection: DatabaseConnection | undefined;

function getConnection(): DatabaseConnection {
  if (!connection) {
    throw new Error("The test database connection has not been initialized.");
  }

  return connection;
}

describe("P0-03 persistence foundation", () => {
  beforeAll(async () => {
    await applyMigrations(testDatabaseUrl, { resetTestDatabase: true });
    connection = createDatabaseConnection(testDatabaseUrl);
  });

  afterAll(async () => {
    await connection?.close();
    await resetTestDatabase(testDatabaseUrl);
  });

  it("applies the committed migrations to a clean test database", async () => {
    const result = await getConnection().db.execute(sql`
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('drizzle', 'public')
      order by table_schema, table_name
    `);

    expect(
      result.rows.map((row) => `${String(row.table_schema)}.${String(row.table_name)}`),
    ).toEqual(
      expect.arrayContaining([
        "drizzle.__drizzle_migrations",
        "public.phase0_diagnostic_upload_intents",
        "public.phase0_diagnostic_upload_sessions",
        "public.users",
      ]),
    );
  });

  it("persists both initial role values through the server database module", async () => {
    const administratorIdentifier = `administrator-${randomUUID()}`;
    const warehouseIdentifier = `warehouse-${randomUUID()}`;

    await getConnection().db.insert(users).values([
      {
        accountIdentifier: administratorIdentifier,
        displayName: "Phase 0 Administrator",
        role: "administrator",
      },
      {
        accountIdentifier: warehouseIdentifier,
        displayName: "Phase 0 Warehouse",
        role: "china_warehouse",
      },
    ]);

    const persistedRoles = await getConnection().db.execute(sql`
      select role
      from users
      where account_identifier = ${administratorIdentifier}
        or account_identifier = ${warehouseIdentifier}
      order by account_identifier
    `);

    expect(persistedRoles.rows.map((row) => String(row.role)).sort()).toEqual([
      "administrator",
      "china_warehouse",
    ]);
  });

  it("rejects roles outside the two persisted values", async () => {
    await expect(
      getConnection().db.execute(sql`
        insert into users (account_identifier, display_name, role)
        values (${`invalid-role-${randomUUID()}`}, 'Invalid role', 'untrusted_browser_role')
      `),
    ).rejects.toMatchObject({ cause: { code: "22P02" } });
  });

  it("keeps one diagnostic upload intent for an idempotency key in a session", async () => {
    const [user] = await getConnection().db
      .insert(users)
      .values({
        accountIdentifier: `upload-owner-${randomUUID()}`,
        displayName: "Diagnostic Upload Owner",
        role: "china_warehouse",
      })
      .returning();

    const [session] = await getConnection().db
      .insert(phase0DiagnosticUploadSessions)
      .values({ createdByUserId: user.id })
      .returning();

    const idempotencyKey = randomUUID();

    await getConnection().db.insert(phase0DiagnosticUploadIntents).values({
      sessionId: session.id,
      idempotencyKey,
      originalFileName: "front.jpg",
      contentType: "image/jpeg",
      byteSize: 1_024,
    });

    await expect(
      getConnection().db.insert(phase0DiagnosticUploadIntents).values({
        sessionId: session.id,
        idempotencyKey,
        originalFileName: "front-retry.jpg",
        contentType: "image/jpeg",
        byteSize: 1_024,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    const logicalFiles = await getConnection().db.execute(sql`
      select id
      from phase0_diagnostic_upload_intents
      where session_id = ${session.id}
        and idempotency_key = ${idempotencyKey}
    `);

    expect(logicalFiles.rows).toHaveLength(1);
  });
});
