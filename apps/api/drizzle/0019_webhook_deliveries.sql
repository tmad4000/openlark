DO $$ BEGIN
  CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_id" uuid NOT NULL,
  "event_type" varchar(255) NOT NULL,
  "payload" jsonb NOT NULL,
  "status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_event_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."event_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "webhook_deliveries_subscription_id_idx" ON "webhook_deliveries" USING btree ("subscription_id");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_created_at_idx" ON "webhook_deliveries" USING btree ("created_at");
