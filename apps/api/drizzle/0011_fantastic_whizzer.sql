CREATE TYPE "public"."topic_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "topic_subscriptions" (
	"topic_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_subscriptions_topic_id_user_id_pk" PRIMARY KEY("topic_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"creator_id" uuid NOT NULL,
	"status" "topic_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "topic_id" uuid;--> statement-breakpoint
ALTER TABLE "topic_subscriptions" ADD CONSTRAINT "topic_subscriptions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_subscriptions" ADD CONSTRAINT "topic_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_subscriptions_user_id_idx" ON "topic_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "topics_chat_id_idx" ON "topics" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "topics_creator_id_idx" ON "topics" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "topics_status_idx" ON "topics" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_topic_id_idx" ON "messages" USING btree ("topic_id");