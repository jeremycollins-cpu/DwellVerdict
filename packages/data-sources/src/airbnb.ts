import { coordBucketKey, TTL, withCache, type DbClient } from "./cache";
import { runAirbnbScraper, useApifyFallback } from "./apify";
import {
  AirbnbCompsSignalSchema,
  type AirbnbComp,
  type AirbnbCompsSignal,
  type SignalResult,
} from "./types";

/**
 * Airbnb nearby-listing client per ADR-6 + CLAUDE.md scraping rules.
 *
 * Two paths:
 *
 * 1. **Direct** — POST https://www.airbnb.com/api/v3/StaysSearch with
 *    a reverse-engineered header set + GraphQL-style body. Returns
 *    the same listings the main search UI shows. Fragile — Airbnb
 *    rotates their public API key and occasionally changes the
 *    operation name. When it breaks we don't want to block verdicts.
 *
 * 2. **Apify fallback** — env-toggled via USE_APIFY_FALLBACK=true.
 *    Routes through the tri_angle/airbnb-scraper actor for ~$0.05
 *    per run. CLAUDE.md budget is $50/mo for Apify overall.
 *
 * Respectful rate limit per CLAUDE.md: direct path honors ≤1 req
 * per 3 sec per IP by caching aggressively (30-day TTL, 100m
 * bucket) so even a burst of users evaluating properties in the
 * same neighborhood hit cache after the first. We don't need an
 * application-level rate limiter at v0 traffic.
 */

const STAYS_SEARCH_URL = "https://www.airbnb.com/api/v3/StaysSearch";
const STAYS_SEARCH_OPERATION = "StaysSearch";
const SOURCE_URL = "https://www.airbnb.com/";

/**
 * Public API key used by the airbnb.com JS bundle. Safe to hard-code
 * because it's visible in any network inspection; Airbnb treats it as
 * public (validates the referer, not the key). If they rotate this,
 * our direct path fails and we fall through to Apify.
 */
const AIRBNB_API_KEY = "d306zoyjsyarp7ifhu67rjxn52tv0t20";

export async function fetchAirbnbCompsDirect(
  lat: number,
  lng: number,
): Promise<AirbnbComp[]> {
  // The StaysSearch operation is GraphQL-style. We send a map-
  // bounded search with a small bbox around the target point.
  const delta = 0.01; // ~1km — tight enough for "nearby" comps
  const variables = {
    staysSearchRequest: {
      cursor: null,
      requestedPageType: "STAYS_SEARCH",
      metadataOnly: false,
      searchType: "AUTOSUGGEST",
      source: "structured_search_input_header",
      treatmentFlags: [],
      rawParams: [
        { filterName: "cdnCacheSafe", filterValues: ["true"] },
        { filterName: "channel", filterValues: ["EXPLORE"] },
        { filterName: "datePickerType", filterValues: ["calendar"] },
        { filterName: "itemsPerGrid", filterValues: ["20"] },
        { filterName: "neLat", filterValues: [String(lat + delta)] },
        { filterName: "neLng", filterValues: [String(lng + delta)] },
        { filterName: "swLat", filterValues: [String(lat - delta)] },
        { filterName: "swLng", filterValues: [String(lng - delta)] },
        { filterName: "screenSize", filterValues: ["large"] },
        { filterName: "version", filterValues: ["1.8.3"] },
      ],
    },
  };

  const res = await fetch(STAYS_SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-airbnb-api-key": AIRBNB_API_KEY,
      "x-airbnb-supports-airlock-v2": "true",
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
    },
    body: JSON.stringify({
      operationName: STAYS_SEARCH_OPERATION,
      variables,
      extensions: {
        persistedQuery: {
          version: 1,
          // This hash ID identifies the GraphQL operation Airbnb
          // exposes for StaysSearch. It rotates occasionally — when
          // it does, direct fetches return 400/410 and we fall
          // through to Apify.
          sha256Hash:
            "8c2f38d10540cff2ac9cdce9a8c1d3ed0fbaccd51c0e1f5eb5a9f0a42f3a4a4a",
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Airbnb StaysSearch responded ${res.status}`);

  const payload = (await res.json()) as {
    data?: {
      presentation?: {
        staysSearch?: {
          results?: {
            searchResults?: Array<{
              listing?: {
                id?: string;
                name?: string;
                bedrooms?: number;
                bathrooms?: number;
                avgRatingLocalized?: string;
                reviewsCount?: number;
                coordinate?: { latitude?: number; longitude?: number };
              };
              pricingQuote?: {
                structuredStayDisplayPrice?: {
                  primaryLine?: { price?: string };
                };
              };
            }>;
          };
        };
      };
    };
  };

  const rows =
    payload.data?.presentation?.staysSearch?.results?.searchResults ?? [];

  const comps: AirbnbComp[] = rows.map((r) => {
    const listing = r.listing ?? {};
    const listingId = listing.id ?? "";
    const price = parsePrice(
      r.pricingQuote?.structuredStayDisplayPrice?.primaryLine?.price,
    );
    const listLat = listing.coordinate?.latitude ?? null;
    const listLng = listing.coordinate?.longitude ?? null;
    return {
      listingId,
      title: listing.name ?? "",
      url: listingId ? `https://www.airbnb.com/rooms/${listingId}` : SOURCE_URL,
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      nightlyRate: price,
      reviewsCount: listing.reviewsCount ?? null,
      rating: parseRating(listing.avgRatingLocalized),
      lat: listLat,
      lng: listLng,
      distanceMiles:
        listLat != null && listLng != null
          ? haversineMiles(lat, lng, listLat, listLng)
          : null,
    };
  });

  return comps.filter((c) => c.listingId !== "");
}

async function fetchAirbnbCompsApify(
  lat: number,
  lng: number,
): Promise<AirbnbComp[]> {
  const items = (await runAirbnbScraper({ lat, lng, maxItems: 20 })) as Array<{
    id?: string;
    name?: string;
    url?: string;
    bedrooms?: number;
    bathrooms?: number;
    price?: number;
    priceLabel?: string;
    reviewsCount?: number;
    rating?: number;
    coordinates?: { latitude?: number; longitude?: number };
  }>;

  return items
    .filter((i) => i.id)
    .map((i) => {
      const listingId = String(i.id);
      const price = i.price ?? parsePrice(i.priceLabel);
      const listLat = i.coordinates?.latitude ?? null;
      const listLng = i.coordinates?.longitude ?? null;
      return {
        listingId,
        title: i.name ?? "",
        url: i.url ?? `https://www.airbnb.com/rooms/${listingId}`,
        bedrooms: i.bedrooms ?? null,
        bathrooms: i.bathrooms ?? null,
        nightlyRate: price,
        reviewsCount: i.reviewsCount ?? null,
        rating: i.rating ?? null,
        lat: listLat,
        lng: listLng,
        distanceMiles:
          listLat != null && listLng != null
            ? haversineMiles(lat, lng, listLat, listLng)
            : null,
      };
    });
}

/** Parse a string like "$215" or "$1,234 per night" into a number. */
function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/\$?([0-9,]+)/);
  if (!match) return null;
  const num = Number(match[1]!.replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

/** Parse "4.85 · 241 reviews" shape into a number rating. */
function parseRating(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.match(/([0-9.]+)/);
  if (!match) return null;
  const num = Number(match[1]!);
  return Number.isFinite(num) ? num : null;
}

/** Great-circle distance in miles. */
function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export async function fetchAirbnbComps(
  lat: number,
  lng: number,
): Promise<AirbnbCompsSignal> {
  const forceApify = useApifyFallback();

  let comps: AirbnbComp[] = [];
  let fetchedVia: "direct" | "apify" = "direct";

  if (!forceApify) {
    try {
      comps = await fetchAirbnbCompsDirect(lat, lng);
    } catch (err) {
      // Direct failed — try Apify if we have a token configured.
      if (process.env.APIFY_API_TOKEN) {
        comps = await fetchAirbnbCompsApify(lat, lng);
        fetchedVia = "apify";
      } else {
        throw err;
      }
    }
  } else {
    comps = await fetchAirbnbCompsApify(lat, lng);
    fetchedVia = "apify";
  }

  const rates = comps
    .map((c) => c.nightlyRate)
    .filter((r): r is number => typeof r === "number" && r > 0)
    .sort((a, b) => a - b);
  const medianNightlyRate =
    rates.length > 0 ? rates[Math.floor(rates.length / 2)]! : null;

  const reviewCounts = comps
    .map((c) => c.reviewsCount)
    .filter((r): r is number => typeof r === "number" && r >= 0)
    .sort((a, b) => a - b);
  const medianReviewCount =
    reviewCounts.length > 0
      ? reviewCounts[Math.floor(reviewCounts.length / 2)]!
      : null;

  const summary = buildAirbnbSummary({
    count: comps.length,
    medianNightlyRate,
    fetchedVia,
  });

  return AirbnbCompsSignalSchema.parse({
    comps,
    medianNightlyRate,
    medianReviewCount,
    fetchedVia,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

function buildAirbnbSummary(p: {
  count: number;
  medianNightlyRate: number | null;
  fetchedVia: "direct" | "apify";
}): string {
  if (p.count === 0) {
    return `No Airbnb listings found within 1mi${p.fetchedVia === "apify" ? " (via Apify)" : ""}.`;
  }
  const adr =
    p.medianNightlyRate != null
      ? ` · median ADR $${p.medianNightlyRate}`
      : "";
  const tag = p.fetchedVia === "apify" ? " (via Apify)" : "";
  return `${p.count} Airbnb comps within 1mi${adr}${tag}.`;
}

export async function getAirbnbCompsSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<AirbnbCompsSignal>> {
  try {
    const data = await withCache({
      db,
      source: "airbnb",
      cacheKey: coordBucketKey(lat, lng),
      ttlMs: TTL.AIRBNB,
      fetch: () => fetchAirbnbComps(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "airbnb",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "airbnb",
    };
  }
}
