ALTER TYPE "public"."notification_entity_type" ADD VALUE 'event';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'event_invite';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'event_updated';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'event_cancelled';