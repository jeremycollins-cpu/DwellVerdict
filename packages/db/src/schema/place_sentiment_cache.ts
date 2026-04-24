import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * place_sentiment_cache — LLM-synthesized bullet summary of what
 * reviewers say about the *businesses and physical environment*
 * within walking distance of a lat/lng. Per ADR-6.
 *
 * Keyed by 3-decimal lat/lng bucket (~111m resolution) so nearby
 * properties share a cache row. TTL 30 days.
 *
 * FAIR-HOUSING CRITICAL: this signal is the most legally exposed
 * surface in the product. Everything we store here must be about
 * places (restaurants, parks, noise patterns, tourist proximity)
 * and nothing about residents (demographics, subjective safety,
 * "family-friendly" etc.). Enforcement:
 *   - Prompt allow/deny lists in prompts/place-sentiment.v1.md
 *   - Golden-file tests blocking deploy on regression
 *   - UI flags when bullets are stale for user review
 *
 * Source review IDs / URLs in `source_refs` let the user see the
 * raw data that generated each bullet.
 */
export const placeSentimentCache = pgTable(
  "place_sentiment_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    latBucket: text("lat_bucket").notNull(), // "36.163" for 3-decimal bucket
    lngBucket: text("lng_bucket").notNull(),

    // 2-4 factual bullets. jsonb array of strings.
    bullets: jsonb("bullets").notNull().default(sql`'[]'::jsonb`),

    // Summary for the verdict narrative. 1-2 sentences.
    summary: text("summary"),

    // Source references the LLM actually used. jsonb array of objects
    // with { source: 'yelp'|'google_places', id: string, name: string }.
    sourceRefs: jsonb("source_refs").notNull().default(sql`'[]'::jsonb`),

    // Observability per CLAUDE.md AI non-negotiables.
    modelVersion: text("model_version"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCents: integer("cost_cents"),

    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    bucketUnique: uniqueIndex("place_sentiment_cache_bucket_unique").on(
      table.latBucket,
      table.lngBucket,
    ),
    expiresIdx: index("place_sentiment_cache_expires_idx").on(table.expiresAt),
  }),
);

export type PlaceSentimentCacheRow = typeof placeSentimentCache.$inferSelect;
export type NewPlaceSentimentCacheRow =
  typeof placeSentimentCache.$inferInsert;
