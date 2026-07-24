import "server-only";

import { inArray, sql } from "drizzle-orm";

import { getDatabase, type CardflowDatabase } from "@/db/client";
import {
  phase0DiagnosticRecords,
  phase0DiagnosticSeedAccounts,
  phase0DiagnosticSeedRecordOwnership,
  phase0DiagnosticUploadSessions,
  users,
} from "@/db/schema";

import {
  provisionAccount,
  type ProvisionAccountResult,
} from "@/auth/provisioning";
import type { CardflowUserRole } from "@/auth/session";

import type { Phase0DiagnosticCurrency } from "./phase0-diagnostic-record";

type Phase0Environment = Record<string, string | undefined>;

const localDatabaseHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export type Phase0SeedAccountIdentifiers = {
  administratorEmail: string;
  warehouseEmail: string;
};

export type Phase0SeedCredentials = Phase0SeedAccountIdentifiers & {
  administratorDisplayName: string;
  administratorPassword: string;
  warehouseDisplayName: string;
  warehousePassword: string;
};

export type Phase0DiagnosticSeedRecord = {
  id: string;
  itemLabel: string;
  expectedQuantity: number;
  statusLabel: string;
  purchaseCostCents: number;
  purchaseCurrency: Phase0DiagnosticCurrency;
};

export const phase0DiagnosticSeedRecords: readonly Phase0DiagnosticSeedRecord[] = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    itemLabel: "Diagnostic Card Alpha (Mock)",
    expectedQuantity: 1,
    statusLabel: "Phase 0 diagnostic only",
    purchaseCostCents: 1_250,
    purchaseCurrency: "USD",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a2",
    itemLabel: "Diagnostic Card Beta (Mock)",
    expectedQuantity: 2,
    statusLabel: "Phase 0 diagnostic only",
    purchaseCostCents: 2_600,
    purchaseCurrency: "CNY",
  },
  {
    id: "00000000-0000-4000-8000-0000000000a3",
    itemLabel: "Diagnostic Card Gamma (Mock)",
    expectedQuantity: 1,
    statusLabel: "Phase 0 diagnostic only",
    purchaseCostCents: 0,
    purchaseCurrency: "USD",
  },
];

type Phase0SeedAccount = {
  email: string;
  displayName: string;
  password: string;
  role: CardflowUserRole;
};

export type Phase0SeedResult = {
  administrator: ProvisionAccountResult;
  warehouse: ProvisionAccountResult;
  reconciledDiagnosticRecordIds: string[];
};

export type Phase0ResetResult = {
  deletedDiagnosticRecordIds: string[];
  deletedSeedAccountCount: number;
};

function readRequiredEnvironmentValue(environment: Phase0Environment, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set for the Phase 0 seed command.`);
  }

  return value;
}

function normalizeAccountIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function assertPhase0SeedEnvironment(environment: Phase0Environment = process.env): void {
  if (environment.NODE_ENV === "production" || environment.VERCEL_ENV === "production") {
    throw new Error("Phase 0 seed and reset commands refuse production-like environments.");
  }

  const databaseUrl = environment.DATABASE_URL;

  if (!databaseUrl) {
    return;
  }

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("Phase 0 seed and reset commands require a valid DATABASE_URL.");
  }

  const databaseName = parsedDatabaseUrl.pathname.slice(1).toLowerCase();

  if (
    !localDatabaseHosts.has(parsedDatabaseUrl.hostname.toLowerCase()) ||
    (!databaseName.includes("development") && !databaseName.includes("test"))
  ) {
    throw new Error(
      "Phase 0 seed and reset commands require a local development or test DATABASE_URL.",
    );
  }
}

export function getPhase0SeedAccountIdentifiers(
  environment: Phase0Environment = process.env,
): Phase0SeedAccountIdentifiers {
  const administratorEmail = normalizeAccountIdentifier(
    readRequiredEnvironmentValue(environment, "PHASE0_ADMIN_EMAIL"),
  );
  const warehouseEmail = normalizeAccountIdentifier(
    readRequiredEnvironmentValue(environment, "PHASE0_WAREHOUSE_EMAIL"),
  );

  if (administratorEmail === warehouseEmail) {
    throw new Error("Phase 0 administrator and warehouse accounts must use different emails.");
  }

  return { administratorEmail, warehouseEmail };
}

export function getPhase0SeedCredentials(
  environment: Phase0Environment = process.env,
): Phase0SeedCredentials {
  const accountIdentifiers = getPhase0SeedAccountIdentifiers(environment);

  return {
    ...accountIdentifiers,
    administratorDisplayName: readRequiredEnvironmentValue(
      environment,
      "PHASE0_ADMIN_DISPLAY_NAME",
    ),
    administratorPassword: readRequiredEnvironmentValue(environment, "PHASE0_ADMIN_PASSWORD"),
    warehouseDisplayName: readRequiredEnvironmentValue(
      environment,
      "PHASE0_WAREHOUSE_DISPLAY_NAME",
    ),
    warehousePassword: readRequiredEnvironmentValue(environment, "PHASE0_WAREHOUSE_PASSWORD"),
  };
}

function toSeedAccounts(credentials: Phase0SeedCredentials): [Phase0SeedAccount, Phase0SeedAccount] {
  return [
    {
      email: credentials.administratorEmail,
      displayName: credentials.administratorDisplayName,
      password: credentials.administratorPassword,
      role: "administrator",
    },
    {
      email: credentials.warehouseEmail,
      displayName: credentials.warehouseDisplayName,
      password: credentials.warehousePassword,
      role: "china_warehouse",
    },
  ];
}

async function assertNoSeedRoleConflicts(
  database: CardflowDatabase,
  accounts: readonly Phase0SeedAccount[],
): Promise<void> {
  const existingUsers = await database
    .select({
      accountIdentifier: users.accountIdentifier,
      role: users.role,
    })
    .from(users)
    .where(inArray(users.accountIdentifier, accounts.map((account) => account.email)));
  const existingRoles = new Map(
    existingUsers.map((user) => [user.accountIdentifier, user.role]),
  );

  for (const account of accounts) {
    const existingRole = existingRoles.get(account.email);

    if (existingRole && existingRole !== account.role) {
      throw new Error("A configured Phase 0 seed account has a conflicting persisted role.");
    }
  }
}

async function provisionSeedAccount(
  database: CardflowDatabase,
  account: Phase0SeedAccount,
): Promise<ProvisionAccountResult> {
  const result = await provisionAccount(account, database);

  if (result.user.role !== account.role) {
    throw new Error("A configured Phase 0 seed account has a conflicting persisted role.");
  }

  return result;
}

async function markSeedOwnedAccount(
  database: CardflowDatabase,
  account: Phase0SeedAccount,
  result: ProvisionAccountResult,
): Promise<void> {
  if (result.status !== "created") {
    return;
  }

  await database
    .insert(phase0DiagnosticSeedAccounts)
    .values({
      userId: result.user.id,
      accountIdentifier: account.email,
      expectedRole: account.role,
    })
    .onConflictDoNothing();
}

function getDeterministicDiagnosticRecordIds(): string[] {
  return phase0DiagnosticSeedRecords.map((record) => record.id);
}

async function assertNoUnownedDiagnosticSeedRecords(
  database: CardflowDatabase,
): Promise<void> {
  const deterministicRecordIds = getDeterministicDiagnosticRecordIds();
  const [existingRecords, ownedRecords] = await Promise.all([
    database
      .select({ id: phase0DiagnosticRecords.id })
      .from(phase0DiagnosticRecords)
      .where(inArray(phase0DiagnosticRecords.id, deterministicRecordIds)),
    database
      .select({ recordId: phase0DiagnosticSeedRecordOwnership.recordId })
      .from(phase0DiagnosticSeedRecordOwnership)
      .where(inArray(phase0DiagnosticSeedRecordOwnership.recordId, deterministicRecordIds)),
  ]);
  const ownedRecordIds = new Set(ownedRecords.map((record) => record.recordId));
  const unownedRecordIds = existingRecords
    .map((record) => record.id)
    .filter((recordId) => !ownedRecordIds.has(recordId));

  if (unownedRecordIds.length > 0) {
    throw new Error("A fixed Phase 0 diagnostic record ID is not owned by the seed process.");
  }
}

async function reconcilePhase0DiagnosticRecords(
  database: CardflowDatabase,
): Promise<string[]> {
  return database.transaction(async (transaction) => {
    await assertNoUnownedDiagnosticSeedRecords(transaction);

    const reconciledDiagnosticRecords = await transaction
      .insert(phase0DiagnosticRecords)
      .values(
        phase0DiagnosticSeedRecords.map((record) => ({
          id: record.id,
          itemLabel: record.itemLabel,
          expectedQuantity: record.expectedQuantity,
          statusLabel: record.statusLabel,
          purchaseCostCents: record.purchaseCostCents,
          purchaseCurrency: record.purchaseCurrency,
        })),
      )
      .onConflictDoUpdate({
        target: phase0DiagnosticRecords.id,
        set: {
          itemLabel: sql`excluded.item_label`,
          expectedQuantity: sql`excluded.expected_quantity`,
          statusLabel: sql`excluded.status_label`,
          purchaseCostCents: sql`excluded.purchase_cost_cents`,
          purchaseCurrency: sql`excluded.purchase_currency`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`exists (
          select 1
          from ${phase0DiagnosticSeedRecordOwnership}
          where ${phase0DiagnosticSeedRecordOwnership.recordId} = ${phase0DiagnosticRecords.id}
        )`,
      })
      .returning({ id: phase0DiagnosticRecords.id });

    const reconciledRecordIds = reconciledDiagnosticRecords.map((record) => record.id);

    if (reconciledRecordIds.length !== phase0DiagnosticSeedRecords.length) {
      throw new Error("A fixed Phase 0 diagnostic record ID is not owned by the seed process.");
    }

    await transaction
      .insert(phase0DiagnosticSeedRecordOwnership)
      .values(reconciledRecordIds.map((recordId) => ({ recordId })))
      .onConflictDoNothing();

    return reconciledRecordIds;
  });
}

export async function seedPhase0DiagnosticData(
  options: {
    database?: CardflowDatabase;
    credentials?: Phase0SeedCredentials;
    environment?: Phase0Environment;
  } = {},
): Promise<Phase0SeedResult> {
  const environment = options.environment ?? process.env;

  assertPhase0SeedEnvironment(environment);

  const database = options.database ?? getDatabase();
  const credentials = options.credentials ?? getPhase0SeedCredentials(environment);
  const [administratorAccount, warehouseAccount] = toSeedAccounts(credentials);

  await assertNoSeedRoleConflicts(database, [administratorAccount, warehouseAccount]);
  await assertNoUnownedDiagnosticSeedRecords(database);

  const administrator = await provisionSeedAccount(database, administratorAccount);
  await markSeedOwnedAccount(database, administratorAccount, administrator);

  const warehouse = await provisionSeedAccount(database, warehouseAccount);
  await markSeedOwnedAccount(database, warehouseAccount, warehouse);

  const reconciledDiagnosticRecordIds = await reconcilePhase0DiagnosticRecords(database);

  return {
    administrator,
    warehouse,
    reconciledDiagnosticRecordIds,
  };
}

export async function resetPhase0DiagnosticData(
  options: {
    database?: CardflowDatabase;
    accountIdentifiers?: Phase0SeedAccountIdentifiers;
    environment?: Phase0Environment;
  } = {},
): Promise<Phase0ResetResult> {
  const environment = options.environment ?? process.env;

  assertPhase0SeedEnvironment(environment);

  const database = options.database ?? getDatabase();
  const accountIdentifiers =
    options.accountIdentifiers ?? getPhase0SeedAccountIdentifiers(environment);
  const expectedAccounts = new Map<string, CardflowUserRole>([
    [accountIdentifiers.administratorEmail, "administrator"],
    [accountIdentifiers.warehouseEmail, "china_warehouse"],
  ]);

  return database.transaction(async (transaction) => {
    const ownedAccounts = await transaction
      .select({
        userId: phase0DiagnosticSeedAccounts.userId,
        accountIdentifier: phase0DiagnosticSeedAccounts.accountIdentifier,
        expectedRole: phase0DiagnosticSeedAccounts.expectedRole,
      })
      .from(phase0DiagnosticSeedAccounts)
      .where(
        inArray(phase0DiagnosticSeedAccounts.accountIdentifier, [
          accountIdentifiers.administratorEmail,
          accountIdentifiers.warehouseEmail,
        ]),
      );

    for (const account of ownedAccounts) {
      if (expectedAccounts.get(account.accountIdentifier) !== account.expectedRole) {
        throw new Error("A Phase 0 seed ownership record does not match the configured role.");
      }
    }

    const ownedUserIds = ownedAccounts.map((account) => account.userId);
    const ownedDiagnosticRecords = await transaction
      .select({ recordId: phase0DiagnosticSeedRecordOwnership.recordId })
      .from(phase0DiagnosticSeedRecordOwnership)
      .where(
        inArray(
          phase0DiagnosticSeedRecordOwnership.recordId,
          getDeterministicDiagnosticRecordIds(),
        ),
      );

    if (ownedUserIds.length > 0) {
      const ownedUsers = await transaction
        .select({
          id: users.id,
          accountIdentifier: users.accountIdentifier,
          role: users.role,
        })
        .from(users)
        .where(inArray(users.id, ownedUserIds));
      const usersById = new Map(ownedUsers.map((user) => [user.id, user]));

      for (const account of ownedAccounts) {
        const user = usersById.get(account.userId);

        if (
          !user ||
          user.accountIdentifier !== account.accountIdentifier ||
          user.role !== account.expectedRole
        ) {
          throw new Error("A Phase 0 seed account no longer matches its ownership record.");
        }
      }

      const uploadSessions = await transaction
        .select({ id: phase0DiagnosticUploadSessions.id })
        .from(phase0DiagnosticUploadSessions)
        .where(inArray(phase0DiagnosticUploadSessions.createdByUserId, ownedUserIds))
        .limit(1);

      if (uploadSessions.length > 0) {
        throw new Error("Phase 0 seed accounts have diagnostic upload data and cannot be reset.");
      }
    }

    const ownedDiagnosticRecordIds = ownedDiagnosticRecords.map((record) => record.recordId);
    const deletedDiagnosticRecords =
      ownedDiagnosticRecordIds.length === 0
        ? []
        : await transaction
            .delete(phase0DiagnosticRecords)
            .where(inArray(phase0DiagnosticRecords.id, ownedDiagnosticRecordIds))
            .returning({ id: phase0DiagnosticRecords.id });

    if (ownedUserIds.length > 0) {
      await transaction.delete(users).where(inArray(users.id, ownedUserIds));
    }

    return {
      deletedDiagnosticRecordIds: deletedDiagnosticRecords.map((record) => record.id),
      deletedSeedAccountCount: ownedUserIds.length,
    };
  });
}
