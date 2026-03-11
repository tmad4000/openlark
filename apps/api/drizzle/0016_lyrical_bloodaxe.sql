CREATE TYPE "public"."wiki_space_member_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."wiki_space_type" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_page_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_space_members" (
	"space_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "wiki_space_member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"type" "wiki_space_type" DEFAULT 'private' NOT NULL,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_space_id_wiki_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."wiki_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_parent_page_id_wiki_pages_id_fk" FOREIGN KEY ("parent_page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_space_members" ADD CONSTRAINT "wiki_space_members_space_id_wiki_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."wiki_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_space_members" ADD CONSTRAINT "wiki_space_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_spaces" ADD CONSTRAINT "wiki_spaces_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wiki_pages_space_id_idx" ON "wiki_pages" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "wiki_pages_document_id_idx" ON "wiki_pages" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "wiki_pages_parent_page_id_idx" ON "wiki_pages" USING btree ("parent_page_id");--> statement-breakpoint
CREATE INDEX "wiki_pages_position_idx" ON "wiki_pages" USING btree ("position");--> statement-breakpoint
CREATE INDEX "wiki_pages_created_by_idx" ON "wiki_pages" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "wiki_space_members_space_id_idx" ON "wiki_space_members" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "wiki_space_members_user_id_idx" ON "wiki_space_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wiki_spaces_org_id_idx" ON "wiki_spaces" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "wiki_spaces_type_idx" ON "wiki_spaces" USING btree ("type");