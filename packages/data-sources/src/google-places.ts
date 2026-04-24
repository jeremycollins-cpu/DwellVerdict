import { coordBucketKey, TTL, withCache, type DbClient } from "./cache";
import {
  GooglePlacesSignalSchema,
  type GooglePlacesSignal,
  type SignalResult,
} from "./types";

/**
 * Google Places (New) API client per ADR-6 (place sentiment signal).
 *
 * Uses the new Places API (as of 2023) rather than the legacy Places
 * API. Endpoint: POST https://places.googleapis.com/v1/places:searchNearby.
 *
 * The new API returns Place objects with `rating`, `userRatingCount`,
 * and up to 5 recent reviews per place via the `reviews` field mask.
 * That gives us actual review text — unlike Yelp Fusion which only
 * returns aggregate data at the search level.
 *
 * Free tier: $200/mo credit covers ~6,000 Place Details calls or
 * ~20,000 Nearby Search calls. Plenty for v0.
 *
 * Needs `GOOGLE_PLACES_API_KEY` env var. Can be the same key used
 * for the address autocomplete — Google's Maps Platform is one
 * credential across products.
 *
 * TTL: 30 days, keyed by 100m lat/lng bucket.
 */

const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const SOURCE_URL = "https://www.google.com/maps";
const RADIUS_METERS = 800;

type Place = {
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  reviews?: Array<{
    text?: { text?: string };
    rating?: number;
    authorAttribution?: { displayName?: string };
  }>;
  primaryType?: string;
};

export async function fetchGooglePlaces(
  lat: number,
  lng: number,
): Promise<GooglePlacesSignal> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY not set. Enable Places API (New) on your " +
        "Google Cloud project and drop the key in Vercel env vars.",
    );
  }

  const res = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask — only pay for what we need. "reviews" is a
      // Places Enterprise SKU and charges per call, so keep the
      // fields minimal.
      "X-Goog-FieldMask":
        "places.displayName,places.rating,places.userRatingCount,places.primaryType,places.reviews",
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
    },
    body: JSON.stringify({
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: RADIUS_METERS,
        },
      },
      maxResultCount: 15,
      rankPreference: "POPULARITY",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google Places responded ${res.status}`);

  const payload = (await res.json()) as { places?: Place[] };
  const places = payload.places ?? [];

  const ratings = places
    .map((p) => p.rating)
    .filter((r): r is number => typeof r === "number");
  const averageRating =
    ratings.length > 0
      ? Number(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2),
        )
      : null;

  const reviewSnippets: GooglePlacesSignal["reviewSnippets"] = [];
  for (const place of places) {
    for (const r of place.reviews ?? []) {
      const text = r.text?.text;
      const rating = r.rating;
      const placeName = place.displayName?.text ?? "Unknown";
      if (typeof rating === "number" && typeof text === "string" && text.length > 0) {
        reviewSnippets.push({ placeName, rating, text: text.slice(0, 400) });
      }
      if (reviewSnippets.length >= 10) break;
    }
    if (reviewSnippets.length >= 10) break;
  }

  const summary = buildGoogleSummary({
    count: places.length,
    averageRating,
    reviewCount: reviewSnippets.length,
  });

  return GooglePlacesSignalSchema.parse({
    placeCount: places.length,
    averageRating,
    reviewSnippets,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

function buildGoogleSummary(p: {
  count: number;
  averageRating: number | null;
  reviewCount: number;
}): string {
  if (p.count === 0) return "No Google Places listed within 0.5mi.";
  const rating =
    p.averageRating != null ? ` averaging ${p.averageRating.toFixed(1)}★` : "";
  return `${p.count} Google Places within 0.5mi${rating}; ${p.reviewCount} review excerpts collected.`;
}

export async function getGooglePlacesSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<GooglePlacesSignal>> {
  try {
    const data = await withCache({
      db,
      source: "google_places",
      cacheKey: coordBucketKey(lat, lng),
      ttlMs: TTL.GOOGLE_PLACES,
      fetch: () => fetchGooglePlaces(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "google_places",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "google_places",
    };
  }
}
