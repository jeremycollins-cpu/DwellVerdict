-- 0003_data_source_cache.sql
--
-- data_source_cache table per ADR-6: per-signal caching layer for
-- the free-data clients (FEMA, USGS, FBI, Census, Overpass, Yelp,
-- Google Places). Every client reads-through this table before
-- hitting its external API.
--
-- Breakpoint markers between each statement are required by
-- Drizzle's neon-http migrator (see 0002 for the full explanation).

CREATE TABLE "data_source_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "cache_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "r2_key" text,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX "data_source_cache_source_key_unique"
  ON "data_source_cache" ("source", "cache_key");
--> statement-breakpoint

CREATE INDEX "data_source_cache_expires_idx"
  ON "data_source_cache" ("expires_at");
