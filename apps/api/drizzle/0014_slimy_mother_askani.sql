CREATE TYPE "public"."document_principal_type" AS ENUM('user', 'department', 'org');--> statement-breakpoint
CREATE TYPE "public"."document_role" AS ENUM('viewer', 'editor', 'manager', 'owner');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('doc', 'sheet', 'slide', 'mindnote', 'board');--> statement-breakpoint
CREATE TABLE "document_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"block_id" varchar(255),
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"thread_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"principal_id" uuid NOT NULL,
	"principal_type" "document_principal_type" NOT NULL,
	"role" "document_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"snapshot_blob" "bytea",
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"type" "document_type" NOT NULL,
	"yjs_doc_id" varchar(255),
	"owner_id" uuid NOT NULL,
	"template_id" uuid,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_yjs_doc_id_unique" UNIQUE("yjs_doc_id")
);
--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_thread_id_document_comments_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."document_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_comments_document_id_idx" ON "document_comments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_comments_block_id_idx" ON "document_comments" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "document_comments_user_id_idx" ON "document_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_comments_thread_id_idx" ON "document_comments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "document_comments_resolved_idx" ON "document_comments" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "document_permissions_document_id_idx" ON "document_permissions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_permissions_principal_id_idx" ON "document_permissions" USING btree ("principal_id");--> statement-breakpoint
CREATE INDEX "document_permissions_principal_type_idx" ON "document_permissions" USING btree ("principal_type");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_created_by_idx" ON "document_versions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "document_versions_created_at_idx" ON "document_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_org_id_idx" ON "documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "documents_owner_id_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "documents_type_idx" ON "documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "documents_yjs_doc_id_idx" ON "documents" USING btree ("yjs_doc_id");--> statement-breakpoint
CREATE INDEX "documents_template_id_idx" ON "documents" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "documents_deleted_at_idx" ON "documents" USING btree ("deleted_at");