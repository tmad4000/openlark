ALTER TABLE "chat_members" ADD COLUMN "done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;