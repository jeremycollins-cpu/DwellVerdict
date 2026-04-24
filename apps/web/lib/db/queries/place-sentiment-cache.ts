import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { PlaceSentimentCacheRow } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { placeSentimentCache } = schema;

/** 30-day TTL per ADR-6. */
export const PLACE_SENTIMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 3-decimal lat/lng bucket = ~111m. */
export function latLngBucket(lat: number, lng: number): {
  latBucket: string;
  lngBucket: string;
} {
  return { latBucket: lat.toFixed(3), lngBucket: lng.toFixed(3) };
}

export async function getPlaceSentimentCacheRow(params: {
  lat: number;
  lng: number;
}): Promise<PlaceSentimentCacheRow | null> {
  const db = getDb();
  const { latBucket, lngBucket } = latLngBucket(params.lat, params.lng);
  const [row] = await db
    .select()
    .from(placeSentimentCache)
    .where(
      and(
        eq(placeSentimentCache.latBucket, latBucket),
        eq(placeSentimentCache.lngBucket, lngBucket),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function isPlaceSentimentCacheFresh(
  row: PlaceSentimentCacheRow,
): boolean {
  return row.expiresAt > new Date();
}

export async function upsertPlaceSentimentCacheRow(params: {
  lat: number;
  lng: number;
  bullets: string[];
  summary: string;
  sourceRefs: Array<{ source: "yelp" | "google_places"; name: string }>;
  modelVersion: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PLACE_SENTIMENT_TTL_MS);
  const { latBucket, lngBucket } = latLngBucket(params.lat, params.lng);

  await db
    .insert(placeSentimentCache)
    .values({
      latBucket,
      lngBucket,
      bullets: params.bullets,
      summary: params.summary,
      sourceRefs: params.sourceRefs,
      modelVersion: params.modelVersion,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costCents: params.costCents,
      lastVerifiedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [placeSentimentCache.latBucket, placeSentimentCache.lngBucket],
      set: {
        bullets: params.bullets,
        summary: params.summary,
        sourceRefs: params.sourceRefs,
        modelVersion: params.modelVersion,
        promptVersion: params.promptVersion,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costCents: params.costCents,
        lastVerifiedAt: now,
        expiresAt,
        updatedAt: sql`NOW()`,
      },
    });
}
