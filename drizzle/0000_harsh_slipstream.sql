CREATE TYPE "public"."user_role" AS ENUM('administrator', 'china_warehouse');--> statement-breakpoint
CREATE TABLE "phase0_diagnostic_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"original_file_name" varchar(512) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phase0_diagnostic_upload_intents_session_idempotency_key_unique" UNIQUE("session_id","idempotency_key"),
	CONSTRAINT "phase0_diagnostic_upload_intents_byte_size_nonnegative" CHECK ("phase0_diagnostic_upload_intents"."byte_size" >= 0)
);
--> statement-breakpoint
CREATE TABLE "phase0_diagnostic_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_identifier" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_account_identifier_unique" UNIQUE("account_identifier")
);
--> statement-breakpoint
COMMENT ON TABLE "phase0_diagnostic_upload_sessions" IS 'Provisional Phase 0 diagnostic upload-test session metadata; not a final authentication or media model.';--> statement-breakpoint
COMMENT ON TABLE "phase0_diagnostic_upload_intents" IS 'Provisional Phase 0 diagnostic upload intent metadata; not a final MediaAttachment model.';--> statement-breakpoint
ALTER TABLE "phase0_diagnostic_upload_intents" ADD CONSTRAINT "phase0_diagnostic_upload_intents_session_id_phase0_diagnostic_upload_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."phase0_diagnostic_upload_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase0_diagnostic_upload_sessions" ADD CONSTRAINT "phase0_diagnostic_upload_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
