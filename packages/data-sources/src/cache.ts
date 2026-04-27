import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { schema } from "@dwellverdict/db";

const { dataSourceCache } = schema;

/**
 * Generic read-through cache helpers for the free-data clients
 * per ADR-6. Every client module imports `withCache` to wrap its
 * HTTP fetch; cache keys and TTLs are source-specific.
 *
 * We pass the db instance in rather than importing from an app
 * module so this package can be used from web + modeling + Inngest
 * functions without circular deps.
 */

/** Drizzle client shape — matches @dwellverdict/db's createDb() output. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = NeonDatabase<any>;

export type SourceName =
  | "fema"
  | "usgs"
  | "fbi"
  | "census"
  | "overpass"
  | "yelp"
  | "google_places"
  | "airbnb"
  | "zillow"
  | "redfin"
  | "schools";

export type WithCacheParams<T> = {
  db: DbClient;
  source: SourceName;
  cacheKey: string;
  /**
   * How long the fetched value is considered fresh, in ms. Clients
   * pick this per-source (FEMA 30d, Overpass 7d, etc.). Callers
   * reading a stale row can either (a) block and refresh
   * synchronously via `withCache`, or (b) return the stale value
   * and enqueue a background refresh — v0 uses the synchronous
   * path for simplicity; Inngest-backed background refresh arrives
   * with the regulatory signal.
   */
  ttlMs: number;
  fetch: () => Promise<T>;
};

/**
 * Read-through cache. Returns the cached payload if present and
 * unexpired; otherwise runs `fetch()`, writes the result, and
 * returns it.
 *
 * Errors in `fetch()` propagate up — the caller decides whether
 * to fall back to stale data or surface the error.
 */
export async function withCache<T>(params: WithCacheParams<T>): Promise<T> {
  const { db, source, cacheKey, ttlMs, fetch } = params;

  const [existing] = await db
    .select({
      payload: dataSourceCache.payload,
      expiresAt: dataSourceCache.expiresAt,
    })
    .from(dataSourceCache)
    .where(
      and(
        eq(dataSourceCache.source, source),
        eq(dataSourceCache.cacheKey, cacheKey),
      ),
    )
    .limit(1);

  const now = new Date();
  if (existing && existing.expiresAt > now) {
    return existing.payload as T;
  }

  const fresh = await fetch();
  const expiresAt = new Date(now.getTime() + ttlMs);

  await db
    .insert(dataSourceCache)
    .values({
      source,
      cacheKey,
      payload: fresh as unknown as object,
      fetchedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [dataSourceCache.source, dataSourceCache.cacheKey],
      set: {
        payload: fresh as unknown as object,
        fetchedAt: now,
        expiresAt,
      },
    });

  return fresh;
}

/**
 * Common cache-key helpers. Clients use these to build consistent
 * keys so independent call sites hit the same cache row.
 */

/** Coordinate key at ~11m resolution. Used by FEMA / USGS / Overpass. */
export function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Coordinate bucket key at ~111m resolution (3 decimals). Used by
 * Yelp / Google Places so nearby properties share a sentiment row
 * instead of hammering these APIs once per address.
 */
export function coordBucketKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/** TTL constants per ADR-6. */
export const TTL = {
  FEMA: 30 * 24 * 60 * 60 * 1000, // 30 days
  USGS: 30 * 24 * 60 * 60 * 1000, // 30 days
  FBI: 30 * 24 * 60 * 60 * 1000, // 30 days
  CENSUS: 90 * 24 * 60 * 60 * 1000, // 90 days
  OVERPASS: 7 * 24 * 60 * 60 * 1000, // 7 days
  YELP: 30 * 24 * 60 * 60 * 1000, // 30 days
  GOOGLE_PLACES: 30 * 24 * 60 * 60 * 1000, // 30 days
  AIRBNB: 7 * 24 * 60 * 60 * 1000, // 7 days — STR nightly rates drift seasonally
  ZILLOW: 7 * 24 * 60 * 60 * 1000, // 7 days — Zestimates recompute weekly-ish
  REDFIN: 7 * 24 * 60 * 60 * 1000, // 7 days
  // M3.10 — schools data is LLM-cached and city/state-keyed.
  // School ratings shift slowly (annual GreatSchools refresh), so
  // 90 days is appropriate. First call per city pays Haiku ~$0.001;
  // subsequent calls in that window are free.
  SCHOOLS: 90 * 24 * 60 * 60 * 1000, // 90 days
} as const;

/**
 * Silence the warning: also fits a one-shot use when the client
 * doesn't yet need caching (e.g. golden-file tests invoking the
 * fetch path directly).
 */
export async function withoutCache<T>(fetchFn: () => Promise<T>): Promise<T> {
  return fetchFn();
}
