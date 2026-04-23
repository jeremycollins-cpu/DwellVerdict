import { coordKey, TTL, withCache, type DbClient } from "./cache";
import {
  OverpassAmenitySignalSchema,
  type OverpassAmenitySignal,
  type SignalResult,
} from "./types";

/**
 * OpenStreetMap Overpass API client per ADR-6.
 *
 * Counts amenities within 0.5-mile and 1-mile radii of a lat/lng.
 * We derive a walk-score proxy from a weighted sum of amenity
 * counts — no licensed Walk Score API needed.
 *
 * Overpass is free but under fair-use guidelines. Default endpoint
 * (overpass-api.de) rate-limits aggressive use; polite UA +
 * per-address cache (7-day TTL) keep us well under any threshold.
 *
 * Weighting rationale (v0, tunable):
 *   Transit (stop):     10 pts each, cap 20 pts
 *   Grocery:            15 pts each, cap 30 pts
 *   Restaurant:          3 pts each, cap 25 pts
 *   Cafe:                3 pts each, cap 10 pts
 *   Bar:                 2 pts each, cap  5 pts
 *   Park:                5 pts each, cap 10 pts
 *   [schools excluded per fair-housing rules — school quality is
 *    a redlining proxy; counting schools as a positive signal
 *    embeds that proxy. We still collect the raw count for
 *    transparency but do not include it in the walk score.]
 *
 * Total cap: 100.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SOURCE_URL = "https://www.openstreetmap.org/copyright";
const HALF_MILE_METERS = 805;
const ONE_MILE_METERS = 1609;

type Counts = {
  grocery: number;
  restaurant: number;
  cafe: number;
  bar: number;
  transitStops: number;
  parks: number;
  schools: number;
};

const EMPTY_COUNTS: Counts = {
  grocery: 0,
  restaurant: 0,
  cafe: 0,
  bar: 0,
  transitStops: 0,
  parks: 0,
  schools: 0,
};

function buildQuery(lat: number, lng: number, radiusM: number): string {
  // Overpass QL: one union query pulling all categories we care
  // about in a single round-trip. `[out:json][timeout:25]` keeps
  // the server-side timeout tight.
  return `
[out:json][timeout:25];
(
  node[shop=supermarket](around:${radiusM},${lat},${lng});
  node[shop=grocery](around:${radiusM},${lat},${lng});
  node[amenity=restaurant](around:${radiusM},${lat},${lng});
  node[amenity=cafe](around:${radiusM},${lat},${lng});
  node[amenity=bar](around:${radiusM},${lat},${lng});
  node[amenity=pub](around:${radiusM},${lat},${lng});
  node[public_transport=stop_position](around:${radiusM},${lat},${lng});
  node[highway=bus_stop](around:${radiusM},${lat},${lng});
  node[railway=station](around:${radiusM},${lat},${lng});
  way[leisure=park](around:${radiusM},${lat},${lng});
  node[amenity=school](around:${radiusM},${lat},${lng});
);
out tags;
`.trim();
}

export async function fetchOverpassAmenities(
  lat: number,
  lng: number,
): Promise<OverpassAmenitySignal> {
  const halfMile = await queryRadius(lat, lng, HALF_MILE_METERS);
  const oneMile = await queryRadius(lat, lng, ONE_MILE_METERS);
  const walkScore = computeWalkScore(halfMile, oneMile);

  const summary = buildOverpassSummary(halfMile, oneMile, walkScore);

  return OverpassAmenitySignalSchema.parse({
    halfMile,
    oneMile,
    walkScore,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

async function queryRadius(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<Counts> {
  const query = buildQuery(lat, lng, radiusM);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);

  const payload = (await res.json()) as {
    elements?: Array<{ tags?: Record<string, string> }>;
  };

  const counts = { ...EMPTY_COUNTS };
  for (const el of payload.elements ?? []) {
    const tags = el.tags ?? {};
    if (tags.shop === "supermarket" || tags.shop === "grocery") counts.grocery += 1;
    if (tags.amenity === "restaurant") counts.restaurant += 1;
    if (tags.amenity === "cafe") counts.cafe += 1;
    if (tags.amenity === "bar" || tags.amenity === "pub") counts.bar += 1;
    if (
      tags.public_transport === "stop_position" ||
      tags.highway === "bus_stop" ||
      tags.railway === "station"
    ) {
      counts.transitStops += 1;
    }
    if (tags.leisure === "park") counts.parks += 1;
    if (tags.amenity === "school") counts.schools += 1;
  }
  return counts;
}

function computeWalkScore(halfMile: Counts, oneMile: Counts): number {
  // Close-in amenities (0.5mi) count full; further (1mi) count half.
  const closeValue = weightedValue(halfMile, 1);
  const farValue = weightedValue(oneMile, 0.5);
  const raw = closeValue + farValue;
  return Math.min(100, Math.round(raw));
}

function weightedValue(c: Counts, scale: number): number {
  return (
    cap(c.transitStops * 10 * scale, 20) +
    cap(c.grocery * 15 * scale, 30) +
    cap(c.restaurant * 3 * scale, 25) +
    cap(c.cafe * 3 * scale, 10) +
    cap(c.bar * 2 * scale, 5) +
    cap(c.parks * 5 * scale, 10)
    // Schools excluded from scoring per ADR-7 fair-housing rules.
  );
}

function cap(value: number, max: number): number {
  return Math.min(value, max);
}

function buildOverpassSummary(
  halfMile: Counts,
  oneMile: Counts,
  walkScore: number,
): string {
  const bucket =
    walkScore >= 80
      ? "very walkable"
      : walkScore >= 60
        ? "somewhat walkable"
        : walkScore >= 40
          ? "car-oriented"
          : "car-dependent";
  return (
    `Walk score ${walkScore}/100 (${bucket}). ` +
    `Within 0.5mi: ${halfMile.restaurant} restaurants, ${halfMile.grocery} grocery, ` +
    `${halfMile.transitStops} transit stops, ${halfMile.parks} parks. ` +
    `Within 1mi: ${oneMile.restaurant} restaurants, ${oneMile.grocery} grocery.`
  );
}

export async function getOverpassSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<OverpassAmenitySignal>> {
  try {
    const data = await withCache({
      db,
      source: "overpass",
      cacheKey: coordKey(lat, lng),
      ttlMs: TTL.OVERPASS,
      fetch: () => fetchOverpassAmenities(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "overpass",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "overpass",
    };
  }
}
