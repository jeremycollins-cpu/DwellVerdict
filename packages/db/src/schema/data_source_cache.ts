import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * data_source_cache — generic per-signal cache per ADR-6.
 *
 * One row per (source, cache_key). Every free-data client
 * (FEMA, USGS, FBI, Census, Overpass, Yelp, Google Places)
 * writes its normalized payload here and checks this table
 * before hitting the external API.
 *
 * Key shape:
 *   source       text — "fema" | "usgs" | "fbi" | "census" |
 *                       "overpass" | "yelp" | "google_places"
 *   cache_key    text — source-specific key:
 *                       - coordinate-based: "lat,lng" rounded to
 *                         4 decimals (~11m resolution) for FEMA /
 *                         USGS / Overpass
 *                       - tract-based: "state_fips-county_fips-
 *                         tract_code" for Census ACS
 *                       - city-based: "ori_code" for FBI
 *                       - bucket-based: lat/lng 3-decimal bucket
 *                         for Yelp / Google Places
 *
 * TTLs vary by source and are set by the caller via expires_at:
 *   - FEMA / USGS flood-wildfire: 30 days (stable)
 *   - Census ACS: 90 days (stable, yearly release)
 *   - FBI Crime: 30 days (annual release, but changes possible)
 *   - Overpass: 7 days (OSM edits constantly)
 *   - Yelp / Google Places: 30 days (review counts drift slowly)
 *
 * Payload shape is source-specific and validated by each client's
 * Zod schema on read. We store as jsonb to stay flexible without
 * schema migrations every time a source adds a field.
 *
 * R2 snapshot linkage: `r2_key` is nullable for v0 (we log
 * provenance to R2 only for regulatory per ADR-6). Other sources
 * may adopt provenance later without schema changes.
 */
export const dataSourceCache = pgTable(
  "data_source_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    cacheKey: text("cache_key").notNull(),
    payload: jsonb("payload").notNull(),
    r2Key: text("r2_key"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    // Unique index per source+key so upsert-on-conflict works.
    sourceKeyUnique: uniqueIndex("data_source_cache_source_key_unique").on(
      table.source,
      table.cacheKey,
    ),
    // Query-by-expires for cleanup / Inngest background refresh.
    expiresIdx: index("data_source_cache_expires_idx").on(table.expiresAt),
  }),
);

export type DataSourceCacheRow = typeof dataSourceCache.$inferSelect;
export type NewDataSourceCacheRow = typeof dataSourceCache.$inferInsert;
