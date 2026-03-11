CREATE TYPE "public"."automation_run_status" AS ENUM('pending', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."automation_type" AS ENUM('automation', 'workflow');--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automation_id" uuid NOT NULL,
	"trigger_event" jsonb NOT NULL,
	"status" "automation_run_status" DEFAULT 'pending' NOT NULL,
	"error" varchar(2000),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "base_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"trigger" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"type" "automation_type" DEFAULT 'automation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_base_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."base_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_automations" ADD CONSTRAINT "base_automations_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_runs_automation_id_idx" ON "automation_runs" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "automation_runs_status_idx" ON "automation_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "automation_runs_started_at_idx" ON "automation_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "base_automations_base_id_idx" ON "base_automations" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "base_automations_enabled_idx" ON "base_automations" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "base_automations_type_idx" ON "base_automations" USING btree ("type");