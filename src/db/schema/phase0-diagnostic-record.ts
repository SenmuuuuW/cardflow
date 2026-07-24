import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userRole, users } from "./users";

export const phase0DiagnosticCurrencyValues = ["USD", "CNY"] as const;

export const phase0DiagnosticCurrency = pgEnum(
  "phase0_diagnostic_currency",
  phase0DiagnosticCurrencyValues,
);

// This table is provisional Phase 0 mock data, not a purchase-order or inventory model.
export const phase0DiagnosticRecords = pgTable(
  "phase0_diagnostic_records",
  {
    // Stable IDs are supplied by the deterministic Phase 0 seed data.
    id: uuid("id").primaryKey(),
    itemLabel: varchar("item_label", { length: 255 }).notNull(),
    expectedQuantity: integer("expected_quantity").notNull(),
    statusLabel: varchar("status_label", { length: 100 }).notNull(),
    purchaseCostCents: integer("purchase_cost_cents").notNull(),
    purchaseCurrency: phase0DiagnosticCurrency("purchase_currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "phase0_diagnostic_records_expected_quantity_positive",
      sql`${table.expectedQuantity} > 0`,
    ),
    check(
      "phase0_diagnostic_records_purchase_cost_cents_nonnegative",
      sql`${table.purchaseCostCents} >= 0`,
    ),
  ],
);

// This ownership marker lets reset leave unrelated records with matching IDs untouched.
export const phase0DiagnosticSeedRecordOwnership = pgTable(
  "phase0_diagnostic_seed_records",
  {
    recordId: uuid("record_id")
      .primaryKey()
      .references(() => phase0DiagnosticRecords.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

// Seed ownership is recorded only for accounts created by the Phase 0 seed process.
export const phase0DiagnosticSeedAccounts = pgTable(
  "phase0_diagnostic_seed_accounts",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    accountIdentifier: varchar("account_identifier", { length: 255 }).notNull().unique(),
    expectedRole: userRole("expected_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);
