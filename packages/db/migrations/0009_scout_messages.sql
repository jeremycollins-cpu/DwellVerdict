-- 0009_scout_messages.sql
--
-- scout_messages table per ADR-8: per-property Pro-tier Scout chat
-- transcripts. User + assistant turns both persist for audit +
-- conversation restoration.
--
-- Breakpoint markers required by the neon-http migrator.

CREATE TABLE "scout_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "model_version" text,
  "prompt_version" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "cost_cents" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "scout_messages_role_check"
    CHECK ("role" IN ('user', 'assistant'))
);
--> statement-breakpoint

CREATE INDEX "scout_messages_property_recency_idx"
  ON "scout_messages" ("property_id", "created_at" ASC);
--> statement-breakpoint

CREATE INDEX "scout_messages_org_idx"
  ON "scout_messages" ("org_id");
