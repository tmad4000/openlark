CREATE TYPE "public"."base_view_type" AS ENUM('grid', 'kanban', 'calendar', 'gantt', 'gallery', 'form');--> statement-breakpoint
CREATE TABLE "base_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"type" "base_view_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"icon" varchar(100),
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "base_fields" ADD CONSTRAINT "base_fields_table_id_base_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."base_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_records" ADD CONSTRAINT "base_records_table_id_base_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."base_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_records" ADD CONSTRAINT "base_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_tables" ADD CONSTRAINT "base_tables_base_id_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_views" ADD CONSTRAINT "base_views_table_id_base_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."base_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases" ADD CONSTRAINT "bases_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bases" ADD CONSTRAINT "bases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "base_fields_table_id_idx" ON "base_fields" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "base_fields_position_idx" ON "base_fields" USING btree ("position");--> statement-breakpoint
CREATE INDEX "base_records_table_id_idx" ON "base_records" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "base_records_created_by_idx" ON "base_records" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "base_records_created_at_idx" ON "base_records" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "base_tables_base_id_idx" ON "base_tables" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "base_tables_position_idx" ON "base_tables" USING btree ("position");--> statement-breakpoint
CREATE INDEX "base_views_table_id_idx" ON "base_views" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "base_views_type_idx" ON "base_views" USING btree ("type");--> statement-breakpoint
CREATE INDEX "base_views_position_idx" ON "base_views" USING btree ("position");--> statement-breakpoint
CREATE INDEX "bases_org_id_idx" ON "bases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bases_owner_id_idx" ON "bases" USING btree ("owner_id");