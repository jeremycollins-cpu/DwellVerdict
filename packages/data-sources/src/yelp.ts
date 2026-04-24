import { coordBucketKey, TTL, withCache, type DbClient } from "./cache";
import {
  YelpSentimentSignalSchema,
  type YelpSentimentSignal,
  type SignalResult,
} from "./types";

/**
 * Yelp Fusion API client per ADR-6 (place sentiment signal).
 *
 * Pulls nearby businesses with their aggregate ratings and review
 * counts. Used as input to the place-sentiment narrative prompt —
 * strictly about *places*, never about residents. Fair-housing
 * rules enforced in the narrative prompt, not in this client
 * (this client just collects raw data).
 *
 * Yelp Fusion API:
 *   GET /v3/businesses/search?latitude=&longitude=&radius=805
 *
 * Free tier: 5,000 calls/day (generous for v0). Needs `YELP_API_KEY`
 * env var. Get one at https://www.yelp.com/developers/v3/manage_app.
 *
 * TTL: 30 days, keyed by 100m lat/lng bucket so nearby properties
 * share a cache row.
 */

const YELP_URL = "https://api.yelp.com/v3/businesses/search";
const SOURCE_URL = "https://www.yelp.com/";
const RADIUS_METERS = 805; // 0.5 mile

type YelpBusiness = {
  name?: string;
  rating?: number;
  review_count?: number;
  categories?: Array<{ title?: string }>;
};

export async function fetchYelpSentiment(
  lat: number,
  lng: number,
): Promise<YelpSentimentSignal> {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    throw new Error(
      "YELP_API_KEY not set. Get a free key at " +
        "https://www.yelp.com/developers/v3/manage_app",
    );
  }

  const url = new URL(YELP_URL);
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lng.toString());
  url.searchParams.set("radius", String(RADIUS_METERS));
  url.searchParams.set("limit", "20");
  url.searchParams.set("sort_by", "rating");

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Yelp responded ${res.status}`);

  const payload = (await res.json()) as {
    businesses?: YelpBusiness[];
  };

  const businesses = payload.businesses ?? [];
  const ratings = businesses
    .map((b) => b.rating)
    .filter((r): r is number => typeof r === "number");
  const averageRating =
    ratings.length > 0
      ? Number(
          (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2),
        )
      : null;

  // Top 5 category titles by frequency.
  const categoryCounts = new Map<string, number>();
  for (const b of businesses) {
    for (const c of b.categories ?? []) {
      if (c.title) {
        categoryCounts.set(c.title, (categoryCounts.get(c.title) ?? 0) + 1);
      }
    }
  }
  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  // Yelp Fusion's /search endpoint returns ratings but not full
  // review text. Proper review snippets require the per-business
  // /reviews endpoint — deferred to the place-sentiment task
  // since we'd need one extra call per business (~5-10x latency).
  // For v0 we surface aggregate data only; the place-sentiment
  // narrative works from the aggregate + category mix.
  const sampleReviewSnippets: YelpSentimentSignal["sampleReviewSnippets"] = [];

  const summary = buildYelpSummary({
    count: businesses.length,
    averageRating,
    topCategories,
  });

  return YelpSentimentSignalSchema.parse({
    businessCount: businesses.length,
    averageRating,
    topCategories,
    sampleReviewSnippets,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

function buildYelpSummary(p: {
  count: number;
  averageRating: number | null;
  topCategories: string[];
}): string {
  if (p.count === 0) {
    return "No Yelp-listed businesses within 0.5mi.";
  }
  const rating =
    p.averageRating != null ? ` averaging ${p.averageRating.toFixed(1)}★` : "";
  const cats =
    p.topCategories.length > 0 ? ` (${p.topCategories.slice(0, 3).join(", ")})` : "";
  return `${p.count} Yelp businesses within 0.5mi${rating}${cats}.`;
}

export async function getYelpSentimentSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<YelpSentimentSignal>> {
  try {
    const data = await withCache({
      db,
      source: "yelp",
      cacheKey: coordBucketKey(lat, lng),
      ttlMs: TTL.YELP,
      fetch: () => fetchYelpSentiment(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "yelp",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "yelp",
    };
  }
}
