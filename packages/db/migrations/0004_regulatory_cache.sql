-- 0004_regulatory_cache.sql
--
-- regulatory_cache table per ADR-6: LLM-generated STR regulation
-- lookups per (city, state), 30-day TTL, sourced from Haiku +
-- web_search.
--
-- Breakpoint markers between each statement are required by
-- Drizzle's neon-http migrator (see 0002 for the full explanation).

CREATE TABLE "regulatory_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "str_legal" text,
  "permit_required" text,
  "owner_occupied_only" text,
  "cap_on_non_oo" text,
  "renewal_frequency" text,
  "minimum_stay_days" integer,
  "summary" text,
  "source_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "r2_snapshot_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "model_version" text,
  "prompt_version" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "cost_cents" integer,
  "last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "regulatory_cache_str_legal_check"
    CHECK ("str_legal" IS NULL OR "str_legal" IN ('yes', 'restricted', 'no', 'unclear'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX "regulatory_cache_city_state_unique"
  ON "regulatory_cache" ("city", "state");
--> statement-breakpoint

CREATE INDEX "regulatory_cache_expires_idx"
  ON "regulatory_cache" ("expires_at");
