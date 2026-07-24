CREATE TYPE "public"."phase0_diagnostic_currency" AS ENUM('USD', 'CNY');--> statement-breakpoint
CREATE TABLE "phase0_diagnostic_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_label" varchar(255) NOT NULL,
	"expected_quantity" integer NOT NULL,
	"status_label" varchar(100) NOT NULL,
	"purchase_cost_cents" integer NOT NULL,
	"purchase_currency" "phase0_diagnostic_currency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phase0_diagnostic_records_expected_quantity_positive" CHECK ("phase0_diagnostic_records"."expected_quantity" > 0),
	CONSTRAINT "phase0_diagnostic_records_purchase_cost_cents_nonnegative" CHECK ("phase0_diagnostic_records"."purchase_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "phase0_diagnostic_seed_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"account_identifier" varchar(255) NOT NULL,
	"expected_role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phase0_diagnostic_seed_accounts_account_identifier_unique" UNIQUE("account_identifier")
);
--> statement-breakpoint
ALTER TABLE "phase0_diagnostic_seed_accounts" ADD CONSTRAINT "phase0_diagnostic_seed_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;