import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const userRoleValues = ["administrator", "china_warehouse"] as const;

export const userRole = pgEnum("user_role", userRoleValues);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountIdentifier: varchar("account_identifier", { length: 255 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
