-- Central log of every AI call across all surfaces.
-- Powers: cost analytics dashboard (M9.2), per-user cost cap enforcement
-- (future), model performance tracking (M3.3 verdict feedback correlation,
-- M6.1 Scout quality).
--
-- Surface-specific cost columns (verdicts.cost_cents, scout_messages.cost_cents,
-- regulatory_cache.cost_cents, place_sentiment_cache.cost_cents) keep their
-- current behavior — they're still the fast path for surface UIs. This table
-- is the source of truth for analytics and aggregation.
CREATE TABLE "ai_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,

  -- What was called
  "task" text NOT NULL,
  "model" text NOT NULL,
  "routing_reason" text,

  -- Token economics — cache_read + cache_creation reflect Anthropic prompt
  -- caching usage. cost_cents already accounts for the cache discount math
  -- (see packages/ai/src/pricing.ts).
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "cache_read_input_tokens" integer NOT NULL DEFAULT 0,
  "cache_creation_input_tokens" integer NOT NULL DEFAULT 0,
  "web_search_count" integer NOT NULL DEFAULT 0,
  "cost_cents" integer NOT NULL,

  -- Foreign keys to surface-specific records (nullable; only one set per row)
  "verdict_id" uuid REFERENCES "verdicts"("id") ON DELETE SET NULL,
  "scout_message_id" uuid REFERENCES "scout_messages"("id") ON DELETE SET NULL,

  -- Metadata
  "duration_ms" integer,
  "batch_id" text,
  "error" text,

  "created_at" timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT "ai_usage_events_task_check"
    CHECK ("task" IN (
      'regulatory-lookup',
      'place-sentiment',
      'scout-chat',
      'verdict-narrative',
      'briefs',
      'alerts',
      'compare',
      'portfolio'
    ))
);
--> statement-breakpoint

CREATE INDEX "ai_usage_events_user_id_created_at_idx"
  ON "ai_usage_events" ("user_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "ai_usage_events_task_created_at_idx"
  ON "ai_usage_events" ("task", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX "ai_usage_events_org_id_created_at_idx"
  ON "ai_usage_events" ("org_id", "created_at" DESC)
  WHERE "org_id" IS NOT NULL;
