CREATE TYPE "public"."buzz_status" AS ENUM('pending', 'delivered', 'read');--> statement-breakpoint
CREATE TYPE "public"."buzz_type" AS ENUM('in_app', 'sms', 'phone');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'buzz';--> statement-breakpoint
CREATE TABLE "buzz_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "buzz_type" DEFAULT 'in_app' NOT NULL,
	"status" "buzz_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "buzz_notifications" ADD CONSTRAINT "buzz_notifications_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buzz_notifications" ADD CONSTRAINT "buzz_notifications_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buzz_notifications" ADD CONSTRAINT "buzz_notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buzz_notifications_message_id_idx" ON "buzz_notifications" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "buzz_notifications_recipient_id_idx" ON "buzz_notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "buzz_notifications_sender_id_created_at_idx" ON "buzz_notifications" USING btree ("sender_id","created_at");