import "server-only";

import {
  getYelpSentimentSignal,
  getGooglePlacesSignal,
} from "@dwellverdict/data-sources";
import {
  synthesizePlaceSentiment,
  lintPlaceSentiment,
} from "@dwellverdict/ai";
import type { PlaceSentimentCacheRow } from "@dwellverdict/db";

import { getDb } from "@/lib/db";
import {
  getPlaceSentimentCacheRow,
  isPlaceSentimentCacheFresh,
  upsertPlaceSentimentCacheRow,
} from "@/lib/db/queries/place-sentiment-cache";

/**
 * Place-sentiment orchestrator per ADR-6. Same pattern as the
 * regulatory signal:
 *
 *   - Cache hit + fresh → return cached bullets. $0 AI cost.
 *   - Cache hit + stale → synchronous refresh for v0 (Inngest
 *     background refresh is a TODO).
 *   - Cache miss → pull Yelp + Google Places data, feed to
 *     Haiku, upsert, return.
 *
 * Fair-housing compliance enforced in the prompt + by
 * deploy-blocking golden-file tests (packages/ai/tests/place-
 * sentiment-*.test.ts).
 */

export type PlaceSentimentSignal =
  | {
      ok: true;
      fromCache: boolean;
      isStale: boolean;
      bullets: string[];
      summary: string;
      sourceRefs: Array<{ source: "yelp" | "google_places"; name: string }>;
      lastVerifiedAt: string;
    }
  | { ok: false; error: string };

export async function getPlaceSentimentSignal(params: {
  lat: number;
  lng: number;
}): Promise<PlaceSentimentSignal> {
  const { lat, lng } = params;
  const db = getDb();

  const cached = await getPlaceSentimentCacheRow({ lat, lng });
  if (cached && isPlaceSentimentCacheFresh(cached)) {
    return rowToSignal({ row: cached, isStale: false });
  }

  // Fetch inputs in parallel — both are cached too, so repeat
  // callers in the same area mostly hit cache all the way down.
  const [yelpResult, googleResult] = await Promise.all([
    getYelpSentimentSignal(db, lat, lng),
    getGooglePlacesSignal(db, lat, lng),
  ]);

  if (!yelpResult.ok && !googleResult.ok) {
    // Both upstream signals failed — degrade gracefully.
    if (cached) return rowToSignal({ row: cached, isStale: true });
    return {
      ok: false,
      error: `place sentiment inputs unavailable: yelp=${yelpResult.error}; google=${googleResult.error}`,
    };
  }

  const data = {
    yelp: yelpResult.ok
      ? {
          businessCount: yelpResult.data.businessCount,
          averageRating: yelpResult.data.averageRating,
          topCategories: yelpResult.data.topCategories,
          sampleReviewSnippets: yelpResult.data.sampleReviewSnippets,
        }
      : {
          businessCount: 0,
          averageRating: null,
          topCategories: [],
          sampleReviewSnippets: [],
        },
    googlePlaces: googleResult.ok
      ? {
          placeCount: googleResult.data.placeCount,
          averageRating: googleResult.data.averageRating,
          reviewSnippets: googleResult.data.reviewSnippets,
        }
      : {
          placeCount: 0,
          averageRating: null,
          reviewSnippets: [],
        },
  };

  const result = await synthesizePlaceSentiment({ lat, lng, data });
  if (!result.ok) {
    if (cached) return rowToSignal({ row: cached, isStale: true });
    return { ok: false, error: result.error };
  }

  // Fail-closed: even though the prompt forbids FHA-violating
  // phrases, run an offline lint as defense-in-depth. If the LLM
  // echoed a review snippet verbatim that contained a flagged
  // phrase, we drop this result rather than persist + show it.
  const flags = lintPlaceSentiment({
    bullets: result.output.bullets,
    summary: result.output.summary,
  });
  if (flags.length > 0) {
    console.error("[place-sentiment] fair-housing lint blocked output", {
      lat,
      lng,
      flags,
    });
    if (cached) return rowToSignal({ row: cached, isStale: true });
    return {
      ok: false,
      error: `fair_housing_lint_blocked: ${flags.map((f) => f.reason).join("; ")}`,
    };
  }

  await upsertPlaceSentimentCacheRow({
    lat,
    lng,
    bullets: result.output.bullets,
    summary: result.output.summary,
    sourceRefs: result.output.source_refs,
    modelVersion: result.observability.modelVersion,
    promptVersion: result.observability.promptVersion,
    inputTokens: result.observability.inputTokens,
    outputTokens: result.observability.outputTokens,
    costCents: result.observability.costCents,
  });

  return {
    ok: true,
    fromCache: false,
    isStale: false,
    bullets: result.output.bullets,
    summary: result.output.summary,
    sourceRefs: result.output.source_refs,
    lastVerifiedAt: new Date().toISOString(),
  };
}

function rowToSignal(params: {
  row: PlaceSentimentCacheRow;
  isStale: boolean;
}): PlaceSentimentSignal {
  const { row, isStale } = params;
  return {
    ok: true,
    fromCache: true,
    isStale,
    bullets: Array.isArray(row.bullets) ? (row.bullets as string[]) : [],
    summary: row.summary ?? "",
    sourceRefs: Array.isArray(row.sourceRefs)
      ? (row.sourceRefs as Array<{
          source: "yelp" | "google_places";
          name: string;
        }>)
      : [],
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
  };
}
