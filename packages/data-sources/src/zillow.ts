import { TTL, withCache, type DbClient } from "./cache";
import { runZillowScraper, useApifyFallback } from "./apify";
import { USER_AGENTS } from "./user-agents";
import {
  PropertyValuationSchema,
  type PropertyValuation,
  type SignalResult,
} from "./types";

/**
 * Zillow property valuation client per CLAUDE.md data-sourcing
 * strategy (direct `__NEXT_DATA__` extraction with Apify fallback).
 *
 * Flow:
 *   1. URL-encode the address → hit Zillow's search URL.
 *   2. Zillow's search page JavaScript injects a <script id=
 *      "__NEXT_DATA__"> JSON blob containing the top search results.
 *   3. Pick the first result's `zpid` (Zillow Property ID).
 *   4. Fetch the detail page for that zpid; extract its
 *      `__NEXT_DATA__` and pull out the Zestimate, sale history,
 *      listing status, beds/baths/sqft.
 *
 * If any step fails and `USE_APIFY_FALLBACK` is set, we route
 * through the maxcopell/zillow-scraper actor. The Apify path
 * lands at the same typed output shape.
 *
 * Legal / ToS note per CLAUDE.md: Zillow's ToS prohibits
 * automated scraping. Our direct path operates under the same
 * "reasonable research-use" assumption as our Airbnb scraping,
 * with respectful rate limits. When direct breaks, Apify is the
 * legal escape hatch — they handle the ToS question on their side.
 *
 * Cached 7 days per address (Zestimates recompute ~weekly).
 */

const SOURCE_URL = "https://www.zillow.com/";

type ZillowSearchResult = {
  zpid?: number | string;
  detailUrl?: string;
  address?: string;
};

type ZillowNextData = {
  props?: {
    pageProps?: {
      componentProps?: {
        initialReduxState?: {
          // shape varies; we robust-access
          [key: string]: unknown;
        };
      };
      gdpClientCache?: string; // JSON string sometimes used on detail pages
    };
  };
};

export async function fetchZillowValuation(
  addressFull: string,
): Promise<PropertyValuation> {
  // Step 1: search page
  const searchUrl = `https://www.zillow.com/homes/${encodeURIComponent(addressFull)}_rb/`;
  const searchHtml = await fetchHtml(searchUrl);
  const searchData = extractNextData<ZillowNextData>(searchHtml);
  if (!searchData) throw new Error("Zillow search page missing __NEXT_DATA__");

  // The Zillow search page stores results under a deeply nested key
  // that changes per rollout. We flatten-and-filter for any object
  // with a zpid + detailUrl pattern.
  const searchResult = findFirstWithKeys(searchData, ["zpid", "detailUrl"]) as
    | ZillowSearchResult
    | null;
  if (!searchResult?.detailUrl) {
    throw new Error("No Zillow search result for this address");
  }
  const detailUrl = searchResult.detailUrl.startsWith("http")
    ? searchResult.detailUrl
    : `https://www.zillow.com${searchResult.detailUrl}`;

  // Step 2: detail page
  const detailHtml = await fetchHtml(detailUrl);
  const detailData = extractNextData<ZillowNextData>(detailHtml);
  if (!detailData) throw new Error("Zillow detail page missing __NEXT_DATA__");

  // Zillow's detail pages embed the property record as a JSON-in-
  // JSON string at different keys across rollouts. We look for a
  // node with the typical Zestimate-carrying shape.
  const prop = findFirstWithKeys(detailData, [
    "zestimate",
    "price",
  ]) as {
    zpid?: number | string;
    zestimate?: number;
    zestimateHighPercent?: number;
    zestimateLowPercent?: number;
    price?: number;
    listPrice?: number;
    homeStatus?: string;
    bedrooms?: number;
    bathrooms?: number;
    livingArea?: number;
    yearBuilt?: number;
    priceHistory?: Array<{ date?: string; price?: number; event?: string }>;
  } | null;
  if (!prop) throw new Error("Zillow detail page had no recognizable property record");

  const lastSold = prop.priceHistory?.find(
    (h) => (h.event ?? "").toLowerCase().includes("sold"),
  );

  const summary = buildZillowSummary({
    zestimate: prop.zestimate ?? null,
    listPrice: prop.listPrice ?? prop.price ?? null,
    status: prop.homeStatus ?? null,
    lastSold: lastSold ?? null,
  });

  return PropertyValuationSchema.parse({
    source: "zillow",
    url: detailUrl,
    zpid: prop.zpid != null ? String(prop.zpid) : null,
    bedrooms: prop.bedrooms ?? null,
    bathrooms: prop.bathrooms ?? null,
    sqft: prop.livingArea ?? null,
    yearBuilt: prop.yearBuilt ?? null,
    currentEstimate: prop.zestimate ?? null,
    currentEstimateHigh:
      prop.zestimate != null && prop.zestimateHighPercent != null
        ? Math.round(prop.zestimate * (1 + prop.zestimateHighPercent / 100))
        : null,
    currentEstimateLow:
      prop.zestimate != null && prop.zestimateLowPercent != null
        ? Math.round(prop.zestimate * (1 - prop.zestimateLowPercent / 100))
        : null,
    listPrice: prop.listPrice ?? prop.price ?? null,
    listStatus: prop.homeStatus ?? null,
    lastSoldPrice: lastSold?.price ?? null,
    lastSoldDate: lastSold?.date ?? null,
    summary,
  });
}

async function fetchZillowValuationApify(
  addressFull: string,
): Promise<PropertyValuation> {
  const url = `https://www.zillow.com/homes/${encodeURIComponent(addressFull)}_rb/`;
  const items = (await runZillowScraper({ url })) as Array<{
    zpid?: number | string;
    detailUrl?: string;
    zestimate?: number;
    price?: number;
    listPrice?: number;
    homeStatus?: string;
    bedrooms?: number;
    bathrooms?: number;
    livingArea?: number;
    yearBuilt?: number;
    lastSoldPrice?: number;
    lastSoldDate?: string;
  }>;
  const p = items[0];
  if (!p) throw new Error("Apify Zillow scraper returned no items");

  const detailUrl = p.detailUrl
    ? p.detailUrl.startsWith("http")
      ? p.detailUrl
      : `https://www.zillow.com${p.detailUrl}`
    : url;

  const summary = buildZillowSummary({
    zestimate: p.zestimate ?? null,
    listPrice: p.listPrice ?? p.price ?? null,
    status: p.homeStatus ?? null,
    lastSold:
      p.lastSoldPrice != null
        ? { price: p.lastSoldPrice, date: p.lastSoldDate }
        : null,
  });

  return PropertyValuationSchema.parse({
    source: "zillow",
    url: detailUrl,
    zpid: p.zpid != null ? String(p.zpid) : null,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    sqft: p.livingArea ?? null,
    yearBuilt: p.yearBuilt ?? null,
    currentEstimate: p.zestimate ?? null,
    currentEstimateHigh: null,
    currentEstimateLow: null,
    listPrice: p.listPrice ?? p.price ?? null,
    listStatus: p.homeStatus ?? null,
    lastSoldPrice: p.lastSoldPrice ?? null,
    lastSoldDate: p.lastSoldDate ?? null,
    summary,
  });
}

function buildZillowSummary(p: {
  zestimate: number | null;
  listPrice: number | null;
  status: string | null;
  lastSold: { price?: number; date?: string } | null;
}): string {
  const parts: string[] = [];
  if (p.zestimate != null) parts.push(`Zestimate $${p.zestimate.toLocaleString()}`);
  if (p.listPrice != null) parts.push(`listed $${p.listPrice.toLocaleString()}`);
  if (p.status) parts.push(p.status.toLowerCase().replace(/_/g, " "));
  if (p.lastSold?.price != null) {
    const dateText = p.lastSold.date ? ` (${p.lastSold.date})` : "";
    parts.push(`last sold $${p.lastSold.price.toLocaleString()}${dateText}`);
  }
  return parts.length > 0 ? `Zillow: ${parts.join(" · ")}.` : "Zillow data unavailable.";
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // Zillow sits behind Akamai; any UA without a browser shape
      // returns 403 at the edge. Present as current-stable Chrome.
      "user-agent": USER_AGENTS.browser,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "accept-encoding": "gzip, deflate, br",
      "upgrade-insecure-requests": "1",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Zillow page responded ${res.status}`);
  return res.text();
}

function extractNextData<T>(html: string): T | null {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]!) as T;
  } catch {
    return null;
  }
}

/**
 * Walk the object tree and return the first node that has ALL of
 * the given keys. Used to pluck nested property records out of
 * Zillow's opaque __NEXT_DATA__ shape without hard-coding the key
 * path (which changes per rollout).
 */
function findFirstWithKeys(obj: unknown, keys: string[]): unknown {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [obj];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node as object)) continue;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (keys.every((k) => k in record)) return record;
    for (const v of Object.values(record)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

export async function getZillowValuationSignal(
  db: DbClient,
  addressFull: string,
): Promise<SignalResult<PropertyValuation>> {
  try {
    const cacheKey = addressFull.trim().toLowerCase();
    const forceApify = useApifyFallback();
    const data = await withCache({
      db,
      source: "zillow",
      cacheKey,
      ttlMs: TTL.ZILLOW,
      fetch: async () => {
        if (forceApify) return fetchZillowValuationApify(addressFull);
        try {
          return await fetchZillowValuation(addressFull);
        } catch (err) {
          if (process.env.APIFY_API_TOKEN) {
            return fetchZillowValuationApify(addressFull);
          }
          throw err;
        }
      },
    });
    return {
      ok: true,
      data,
      source: "zillow",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "zillow",
    };
  }
}
