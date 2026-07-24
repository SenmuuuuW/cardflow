CREATE TABLE "phase0_diagnostic_seed_records" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "phase0_diagnostic_seed_records" ADD CONSTRAINT "phase0_diagnostic_seed_records_record_id_phase0_diagnostic_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."phase0_diagnostic_records"("id") ON DELETE cascade ON UPDATE no action;