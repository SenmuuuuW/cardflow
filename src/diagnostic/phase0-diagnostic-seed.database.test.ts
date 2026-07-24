import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { provisionAccount } from "@/auth/provisioning";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "@/db/client";
import {
  accounts,
  phase0DiagnosticRecords,
  phase0DiagnosticSeedAccounts,
  phase0DiagnosticSeedRecordOwnership,
  sessions,
  users,
} from "@/db/schema";

import {
  phase0DiagnosticSeedRecords,
  resetPhase0DiagnosticData,
  seedPhase0DiagnosticData,
  type Phase0SeedCredentials,
} from "./phase0-diagnostic-seed";
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

function createTestCredentials(): Phase0SeedCredentials {
  const suffix = randomUUID();

  return {
    administratorEmail: `phase0-admin-${suffix}@cardflow.test`,
    administratorDisplayName: "Phase 0 Test Administrator",
    administratorPassword: "phase0-administrator-test-password",
    warehouseEmail: `phase0-warehouse-${suffix}@cardflow.test`,
    warehouseDisplayName: "Phase 0 Test Warehouse",
    warehousePassword: "phase0-warehouse-test-password",
  };
}

function getSeedOptions(credentials: Phase0SeedCredentials) {
  return {
    database: getConnection().db,
    credentials,
    environment: { NODE_ENV: "test" },
  };
}

function getResetOptions(credentials: Phase0SeedCredentials) {
  return {
    database: getConnection().db,
    accountIdentifiers: {
      administratorEmail: credentials.administratorEmail,
      warehouseEmail: credentials.warehouseEmail,
    },
    environment: { NODE_ENV: "test" },
  };
}

async function removeDeterministicDiagnosticRecords(): Promise<void> {
  await getConnection().db.delete(phase0DiagnosticRecords).where(
    inArray(
      phase0DiagnosticRecords.id,
      phase0DiagnosticSeedRecords.map((record) => record.id),
    ),
  );
}

describe("P0-06 controlled Phase 0 mock data", () => {
  beforeAll(async () => {
    await applyMigrations(testDatabaseUrl, { resetTestDatabase: true });
    connection = createDatabaseConnection(testDatabaseUrl);
  });

  afterAll(async () => {
    await connection?.close();
    await resetTestDatabase(testDatabaseUrl);
  });

  it("applies the committed migration with provisional diagnostic and seed-ownership tables", async () => {
    const result = await getConnection().db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);

    expect(result.rows.map((row) => String(row.table_name))).toEqual(
      expect.arrayContaining([
        "phase0_diagnostic_records",
        "phase0_diagnostic_seed_accounts",
        "phase0_diagnostic_seed_records",
      ]),
    );
  });

  it("enforces diagnostic quantity and purchase-cost constraints", async () => {
    await expect(
      getConnection().db.execute(sql`
        insert into phase0_diagnostic_records (
          id,
          item_label,
          expected_quantity,
          status_label,
          purchase_cost_cents,
          purchase_currency
        )
        values (
          ${randomUUID()},
          'Invalid quantity diagnostic record',
          0,
          'Phase 0 diagnostic only',
          0,
          'USD'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });

    await expect(
      getConnection().db.execute(sql`
        insert into phase0_diagnostic_records (
          id,
          item_label,
          expected_quantity,
          status_label,
          purchase_cost_cents,
          purchase_currency
        )
        values (
          ${randomUUID()},
          'Invalid cost diagnostic record',
          1,
          'Phase 0 diagnostic only',
          -1,
          'USD'
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("creates exactly three deterministic records and one account for each initial role", async () => {
    const credentials = createTestCredentials();
    const result = await seedPhase0DiagnosticData(getSeedOptions(credentials));
    const diagnosticRecords = await getConnection().db
      .select({ id: phase0DiagnosticRecords.id })
      .from(phase0DiagnosticRecords);
    const seededUsers = await getConnection().db
      .select({
        accountIdentifier: users.accountIdentifier,
        role: users.role,
      })
      .from(users)
      .where(
        inArray(users.accountIdentifier, [
          credentials.administratorEmail,
          credentials.warehouseEmail,
        ]),
      );

    expect(result.administrator.status).toBe("created");
    expect(result.warehouse.status).toBe("created");
    expect(result.reconciledDiagnosticRecordIds.sort()).toEqual(
      phase0DiagnosticSeedRecords.map((record) => record.id).sort(),
    );
    expect(diagnosticRecords.map((record) => record.id).sort()).toEqual(
      phase0DiagnosticSeedRecords.map((record) => record.id).sort(),
    );
    expect(seededUsers).toEqual(
      expect.arrayContaining([
        {
          accountIdentifier: credentials.administratorEmail,
          role: "administrator",
        },
        {
          accountIdentifier: credentials.warehouseEmail,
          role: "china_warehouse",
        },
      ]),
    );
  });

  it("reconciles deterministic data without duplicating records or accounts", async () => {
    const credentials = createTestCredentials();

    await seedPhase0DiagnosticData(getSeedOptions(credentials));
    const replay = await seedPhase0DiagnosticData(getSeedOptions(credentials));
    const diagnosticRecords = await getConnection().db
      .select({ id: phase0DiagnosticRecords.id })
      .from(phase0DiagnosticRecords);
    const seededUsers = await getConnection().db
      .select({ id: users.id })
      .from(users)
      .where(
        inArray(users.accountIdentifier, [
          credentials.administratorEmail,
          credentials.warehouseEmail,
        ]),
      );
    const seedOwnershipRows = await getConnection().db
      .select({ userId: phase0DiagnosticSeedAccounts.userId })
      .from(phase0DiagnosticSeedAccounts)
      .where(
        inArray(phase0DiagnosticSeedAccounts.accountIdentifier, [
          credentials.administratorEmail,
          credentials.warehouseEmail,
        ]),
      );
    const diagnosticRecordOwnershipRows = await getConnection().db
      .select({ recordId: phase0DiagnosticSeedRecordOwnership.recordId })
      .from(phase0DiagnosticSeedRecordOwnership);

    expect(replay.administrator.status).toBe("existing");
    expect(replay.warehouse.status).toBe("existing");
    expect(diagnosticRecords).toHaveLength(3);
    expect(seededUsers).toHaveLength(2);
    expect(seedOwnershipRows).toHaveLength(2);
    expect(diagnosticRecordOwnershipRows.map((record) => record.recordId).sort()).toEqual(
      phase0DiagnosticSeedRecords.map((record) => record.id).sort(),
    );
  });

  it("rejects an existing configured account whose persisted role conflicts", async () => {
    const credentials = createTestCredentials();

    await removeDeterministicDiagnosticRecords();

    await provisionAccount(
      {
        email: credentials.administratorEmail,
        displayName: "Conflicting account",
        role: "china_warehouse",
        password: "conflicting-test-password",
      },
      getConnection().db,
    );

    await expect(seedPhase0DiagnosticData(getSeedOptions(credentials))).rejects.toThrow(
      "conflicting persisted role",
    );

    const diagnosticRecords = await getConnection().db
      .select({ id: phase0DiagnosticRecords.id })
      .from(phase0DiagnosticRecords);
    const warehouseAccount = await getConnection().db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.accountIdentifier, credentials.warehouseEmail));

    expect(diagnosticRecords).toHaveLength(0);
    expect(warehouseAccount).toHaveLength(0);
  });

  it("rejects an unowned fixed diagnostic record ID without modifying it or creating accounts", async () => {
    const credentials = createTestCredentials();
    const unownedRecord = {
      id: phase0DiagnosticSeedRecords[0].id,
      itemLabel: "Unowned diagnostic collision",
      expectedQuantity: 7,
      statusLabel: "Unrelated diagnostic data",
      purchaseCostCents: 999,
      purchaseCurrency: "USD" as const,
    };

    await removeDeterministicDiagnosticRecords();
    await getConnection().db.insert(phase0DiagnosticRecords).values(unownedRecord);

    try {
      await expect(seedPhase0DiagnosticData(getSeedOptions(credentials))).rejects.toThrow(
        "not owned by the seed process",
      );

      const [persistedRecord] = await getConnection().db
        .select({
          id: phase0DiagnosticRecords.id,
          itemLabel: phase0DiagnosticRecords.itemLabel,
          expectedQuantity: phase0DiagnosticRecords.expectedQuantity,
          statusLabel: phase0DiagnosticRecords.statusLabel,
          purchaseCostCents: phase0DiagnosticRecords.purchaseCostCents,
          purchaseCurrency: phase0DiagnosticRecords.purchaseCurrency,
        })
        .from(phase0DiagnosticRecords)
        .where(eq(phase0DiagnosticRecords.id, unownedRecord.id));
      const configuredAccounts = await getConnection().db
        .select({ id: users.id })
        .from(users)
        .where(
          inArray(users.accountIdentifier, [
            credentials.administratorEmail,
            credentials.warehouseEmail,
          ]),
        );

      expect(persistedRecord).toEqual(unownedRecord);
      expect(configuredAccounts).toHaveLength(0);
    } finally {
      await getConnection().db
        .delete(phase0DiagnosticRecords)
        .where(eq(phase0DiagnosticRecords.id, unownedRecord.id));
    }
  });

  it("resets only seed-owned accounts, their Better Auth rows, and deterministic records", async () => {
    const credentials = createTestCredentials();
    const seeded = await seedPhase0DiagnosticData(getSeedOptions(credentials));

    await getConnection().db.insert(sessions).values({
      userId: seeded.administrator.user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const reset = await resetPhase0DiagnosticData(getResetOptions(credentials));
    const remainingRecords = await getConnection().db
      .select({ id: phase0DiagnosticRecords.id })
      .from(phase0DiagnosticRecords);
    const remainingUsers = await getConnection().db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [seeded.administrator.user.id, seeded.warehouse.user.id]));
    const remainingAccounts = await getConnection().db
      .select({ id: accounts.id })
      .from(accounts)
      .where(inArray(accounts.userId, [seeded.administrator.user.id, seeded.warehouse.user.id]));
    const remainingSessions = await getConnection().db
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.userId, [seeded.administrator.user.id, seeded.warehouse.user.id]));

    expect(reset.deletedSeedAccountCount).toBe(2);
    expect(reset.deletedDiagnosticRecordIds.sort()).toEqual(
      phase0DiagnosticSeedRecords.map((record) => record.id).sort(),
    );
    expect(remainingRecords).toHaveLength(0);
    expect(remainingUsers).toHaveLength(0);
    expect(remainingAccounts).toHaveLength(0);
    expect(remainingSessions).toHaveLength(0);
  });

  it("preserves an unowned record that reuses a fixed diagnostic ID during reset", async () => {
    const credentials = createTestCredentials();
    const unownedRecord = {
      id: phase0DiagnosticSeedRecords[0].id,
      itemLabel: "Replacement unowned diagnostic record",
      expectedQuantity: 4,
      statusLabel: "Unrelated diagnostic data",
      purchaseCostCents: 555,
      purchaseCurrency: "USD" as const,
    };

    await seedPhase0DiagnosticData(getSeedOptions(credentials));
    await getConnection().db
      .delete(phase0DiagnosticRecords)
      .where(eq(phase0DiagnosticRecords.id, unownedRecord.id));
    await getConnection().db.insert(phase0DiagnosticRecords).values(unownedRecord);

    try {
      const reset = await resetPhase0DiagnosticData(getResetOptions(credentials));
      const [remainingRecord] = await getConnection().db
        .select({
          id: phase0DiagnosticRecords.id,
          itemLabel: phase0DiagnosticRecords.itemLabel,
          expectedQuantity: phase0DiagnosticRecords.expectedQuantity,
          statusLabel: phase0DiagnosticRecords.statusLabel,
          purchaseCostCents: phase0DiagnosticRecords.purchaseCostCents,
          purchaseCurrency: phase0DiagnosticRecords.purchaseCurrency,
        })
        .from(phase0DiagnosticRecords)
        .where(eq(phase0DiagnosticRecords.id, unownedRecord.id));

      expect(reset.deletedDiagnosticRecordIds.sort()).toEqual(
        phase0DiagnosticSeedRecords.slice(1).map((record) => record.id).sort(),
      );
      expect(remainingRecord).toEqual(unownedRecord);
    } finally {
      await getConnection().db
        .delete(phase0DiagnosticRecords)
        .where(eq(phase0DiagnosticRecords.id, unownedRecord.id));
    }
  });

  it("preserves unrelated users and matching pre-existing users that the seed does not own", async () => {
    const credentials = createTestCredentials();
    const preexistingAdministrator = await provisionAccount(
      {
        email: credentials.administratorEmail,
        displayName: "Pre-existing administrator",
        role: "administrator",
        password: "pre-existing-administrator-password",
      },
      getConnection().db,
    );
    const unrelated = await provisionAccount(
      {
        email: `unrelated-${randomUUID()}@cardflow.test`,
        displayName: "Unrelated user",
        role: "china_warehouse",
        password: "unrelated-user-test-password",
      },
      getConnection().db,
    );
    const seeded = await seedPhase0DiagnosticData(getSeedOptions(credentials));

    expect(seeded.administrator.status).toBe("existing");

    await resetPhase0DiagnosticData(getResetOptions(credentials));

    const preservedUsers = await getConnection().db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [preexistingAdministrator.user.id, unrelated.user.id]));
    const removedWarehouse = await getConnection().db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, seeded.warehouse.user.id));

    expect(preservedUsers.map((user) => user.id).sort()).toEqual(
      [preexistingAdministrator.user.id, unrelated.user.id].sort(),
    );
    expect(removedWarehouse).toHaveLength(0);
  });

  it("is safe to reset repeatedly", async () => {
    const credentials = createTestCredentials();

    await seedPhase0DiagnosticData(getSeedOptions(credentials));

    const firstReset = await resetPhase0DiagnosticData(getResetOptions(credentials));
    const secondReset = await resetPhase0DiagnosticData(getResetOptions(credentials));

    expect(firstReset.deletedSeedAccountCount).toBe(2);
    expect(firstReset.deletedDiagnosticRecordIds).toHaveLength(3);
    expect(secondReset.deletedSeedAccountCount).toBe(0);
    expect(secondReset.deletedDiagnosticRecordIds).toHaveLength(0);
  });

  it("refuses seed and reset execution in production-like environments before mutation", async () => {
    const credentials = createTestCredentials();

    await expect(
      seedPhase0DiagnosticData({
        database: getConnection().db,
        credentials,
        environment: { NODE_ENV: "production" },
      }),
    ).rejects.toThrow("refuse production-like environments");
    await expect(
      resetPhase0DiagnosticData({
        database: getConnection().db,
        accountIdentifiers: {
          administratorEmail: credentials.administratorEmail,
          warehouseEmail: credentials.warehouseEmail,
        },
        environment: { VERCEL_ENV: "production" },
      }),
    ).rejects.toThrow("refuse production-like environments");
    await expect(
      seedPhase0DiagnosticData({
        database: getConnection().db,
        credentials,
        environment: {
          DATABASE_URL: "postgresql://cardflow@production.example:5432/cardflow_production",
        },
      }),
    ).rejects.toThrow("require a local development or test DATABASE_URL");
    await expect(
      resetPhase0DiagnosticData({
        database: getConnection().db,
        accountIdentifiers: {
          administratorEmail: credentials.administratorEmail,
          warehouseEmail: credentials.warehouseEmail,
        },
        environment: {
          DATABASE_URL: "postgresql://cardflow@production.example:5432/cardflow_production",
        },
      }),
    ).rejects.toThrow("require a local development or test DATABASE_URL");

    const diagnosticRecords = await getConnection().db
      .select({ id: phase0DiagnosticRecords.id })
      .from(phase0DiagnosticRecords);

    expect(diagnosticRecords).toHaveLength(0);
  });
});
