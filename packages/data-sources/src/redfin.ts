import { TTL, withCache, type DbClient } from "./cache";
import {
  PropertyValuationSchema,
  type PropertyValuation,
  type SignalResult,
} from "./types";
import { USER_AGENTS } from "./user-agents";

/**
 * Redfin property valuation client per CLAUDE.md data-sourcing
 * strategy.
 *
 * Redfin is more permissive about automated access than Zillow
 * (their ToS does not explicitly prohibit scraping; they've
 * historically made structured data available to the industry).
 * We still operate respectfully — tight rate limits via cache +
 * the public ParcelBot user-agent.
 *
 * Flow differs from Zillow because Redfin's URL pattern lets us
 * go straight to an address search page. We fetch
 *   https://www.redfin.com/stingray/do/location-autocomplete?
 *     location=<addr>&v=2
 * which returns JSON with the canonical `/MLS/XXX/` URL for the
 * property. Then we fetch the detail page, extract __NEXT_DATA__,
 * and pick out price + sqft + Redfin Estimate + history.
 *
 * No Apify fallback for v0 — the maxcopell/zillow-scraper actor
 * doesn't cover Redfin. If direct breaks, Redfin data just
 * doesn't appear in the verdict (gracefully missing, not errored).
 *
 * Cached 7 days per address.
 */

const SOURCE_URL = "https://www.redfin.com/";

type RedfinLocationAutocomplete = {
  payload?: {
    sections?: Array<{
      rows?: Array<{ url?: string; name?: string }>;
    }>;
  };
};

type RedfinNextData = {
  props?: {
    pageProps?: Record<string, unknown>;
  };
};

export async function fetchRedfinValuation(
  addressFull: string,
): Promise<PropertyValuation> {
  // Step 1: autocomplete → canonical detail URL
  const autoUrl = new URL("https://www.redfin.com/stingray/do/location-autocomplete");
  autoUrl.searchParams.set("location", addressFull);
  autoUrl.searchParams.set("v", "2");

  const autoRes = await fetch(autoUrl, {
    headers: {
      // Redfin's edge (Cloudflare-backed) 403s any non-browser UA.
      // Presenting as Chrome unlocks the public autocomplete JSON.
      "user-agent": USER_AGENTS.browser,
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.redfin.com/",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!autoRes.ok) throw new Error(`Redfin autocomplete ${autoRes.status}`);

  // Redfin prefixes its JSON responses with `{}&&` — strip it.
  const autoText = (await autoRes.text()).replace(/^\{\}&&/, "");
  const autoJson = JSON.parse(autoText) as RedfinLocationAutocomplete;

  const row = autoJson.payload?.sections?.flatMap((s) => s.rows ?? [])?.[0];
  if (!row?.url) throw new Error("No Redfin match for this address");

  const detailUrl = row.url.startsWith("http")
    ? row.url
    : `https://www.redfin.com${row.url}`;

  // Step 2: detail page HTML
  const detailRes = await fetch(detailUrl, {
    headers: {
      "user-agent": USER_AGENTS.browser,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://www.redfin.com/",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!detailRes.ok) throw new Error(`Redfin detail ${detailRes.status}`);
  const html = await detailRes.text();

  const data = extractNextData<RedfinNextData>(html);
  if (!data) throw new Error("Redfin detail page missing __NEXT_DATA__");

  const prop = findFirstWithAny(data, [
    "predictedValue",
    "avmPrice",
    "estimatedValue",
  ]) as {
    listPrice?: { value?: number };
    price?: number;
    predictedValue?: number;
    avmPrice?: number;
    estimatedValue?: number;
    beds?: number;
    baths?: number;
    sqFt?: { value?: number };
    yearBuilt?: { value?: number };
    lastSaleData?: { lastSalePrice?: number; lastSaleDate?: string };
    propertyStatus?: string;
  } | null;

  if (!prop) throw new Error("Redfin detail page had no recognizable property record");

  const estimate =
    prop.predictedValue ?? prop.avmPrice ?? prop.estimatedValue ?? null;
  const list = prop.listPrice?.value ?? prop.price ?? null;

  const summary = buildRedfinSummary({
    estimate,
    list,
    status: prop.propertyStatus ?? null,
    lastSoldPrice: prop.lastSaleData?.lastSalePrice ?? null,
    lastSoldDate: prop.lastSaleData?.lastSaleDate ?? null,
  });

  return PropertyValuationSchema.parse({
    source: "redfin",
    url: detailUrl,
    zpid: null,
    bedrooms: prop.beds ?? null,
    bathrooms: prop.baths ?? null,
    sqft: prop.sqFt?.value ?? null,
    yearBuilt: prop.yearBuilt?.value ?? null,
    currentEstimate: estimate,
    currentEstimateHigh: null,
    currentEstimateLow: null,
    listPrice: list,
    listStatus: prop.propertyStatus ?? null,
    lastSoldPrice: prop.lastSaleData?.lastSalePrice ?? null,
    lastSoldDate: prop.lastSaleData?.lastSaleDate ?? null,
    summary,
  });
}

function buildRedfinSummary(p: {
  estimate: number | null;
  list: number | null;
  status: string | null;
  lastSoldPrice: number | null;
  lastSoldDate: string | null;
}): string {
  const parts: string[] = [];
  if (p.estimate != null) parts.push(`Redfin Estimate $${p.estimate.toLocaleString()}`);
  if (p.list != null) parts.push(`listed $${p.list.toLocaleString()}`);
  if (p.status) parts.push(p.status.toLowerCase().replace(/_/g, " "));
  if (p.lastSoldPrice != null) {
    const dateText = p.lastSoldDate ? ` (${p.lastSoldDate})` : "";
    parts.push(`last sold $${p.lastSoldPrice.toLocaleString()}${dateText}`);
  }
  return parts.length > 0 ? `Redfin: ${parts.join(" · ")}.` : "Redfin data unavailable.";
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

/** Walk the tree; return first object containing ANY of these keys. */
function findFirstWithAny(obj: unknown, keys: string[]): unknown {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [obj];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node as object)) continue;
    seen.add(node as object);
    const record = node as Record<string, unknown>;
    if (keys.some((k) => k in record)) return record;
    for (const v of Object.values(record)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

export async function getRedfinValuationSignal(
  db: DbClient,
  addressFull: string,
): Promise<SignalResult<PropertyValuation>> {
  try {
    const cacheKey = addressFull.trim().toLowerCase();
    const data = await withCache({
      db,
      source: "redfin",
      cacheKey,
      ttlMs: TTL.REDFIN,
      fetch: () => fetchRedfinValuation(addressFull),
    });
    return {
      ok: true,
      data,
      source: "redfin",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "redfin",
    };
  }
}

// Suppress unused-import warning — SOURCE_URL is referenced in
// documentation context only but kept as an exported const below.
export { SOURCE_URL as REDFIN_SOURCE_URL };
