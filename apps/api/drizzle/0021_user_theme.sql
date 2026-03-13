DO $$ BEGIN
 CREATE TYPE "public"."user_theme" AS ENUM('light', 'dark', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" "user_theme" DEFAULT 'system' NOT NULL;
