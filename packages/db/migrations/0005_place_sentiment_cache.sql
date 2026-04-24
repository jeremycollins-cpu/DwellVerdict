-- 0005_place_sentiment_cache.sql
--
-- place_sentiment_cache table per ADR-6: LLM-synthesized bullets
-- about businesses and physical environment near a lat/lng.
-- Strict fair-housing guardrails enforced in prompts/place-
-- sentiment.v1.md + deploy-blocking golden-file tests.
--
-- Breakpoint markers between each statement are required by
-- Drizzle's neon-http migrator (see 0002 for the full explanation).

CREATE TABLE "place_sentiment_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lat_bucket" text NOT NULL,
  "lng_bucket" text NOT NULL,
  "bullets" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "summary" text,
  "source_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "model_version" text,
  "prompt_version" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "cost_cents" integer,
  "last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "place_sentiment_cache_bucket_unique"
  ON "place_sentiment_cache" ("lat_bucket", "lng_bucket");
--> statement-breakpoint

CREATE INDEX "place_sentiment_cache_expires_idx"
  ON "place_sentiment_cache" ("expires_at");
