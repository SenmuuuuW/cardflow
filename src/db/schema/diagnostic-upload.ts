import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

// These tables are provisional Phase 0 diagnostics, not the final media model.
export const phase0DiagnosticUploadSessions = pgTable(
  "phase0_diagnostic_upload_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

// A later upload implementation can resume this one logical intent by key.
export const phase0DiagnosticUploadIntents = pgTable(
  "phase0_diagnostic_upload_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => phase0DiagnosticUploadSessions.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    originalFileName: varchar("original_file_name", { length: 512 }).notNull(),
    contentType: varchar("content_type", { length: 255 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("phase0_diagnostic_upload_intents_session_idempotency_key_unique").on(
      table.sessionId,
      table.idempotencyKey,
    ),
    check(
      "phase0_diagnostic_upload_intents_byte_size_nonnegative",
      sql`${table.byteSize} >= 0`,
    ),
  ],
);
