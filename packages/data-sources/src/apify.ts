/**
 * Apify fallback client per CLAUDE.md data-sourcing rules.
 *
 * Apify hosts community-maintained scraper "actors" that we fall
 * back to when our direct HTTP clients break (Zillow redesigns
 * their page, Airbnb rotates their API keys, etc.). Budget is
 * $50/mo per CLAUDE.md.
 *
 * Actors we use:
 *   tri_angle/airbnb-scraper      — Airbnb listing search by lat/lng
 *   maxcopell/zillow-scraper      — Zillow property detail by URL
 *
 * Auth: APIFY_API_TOKEN env var (https://console.apify.com/account/integrations).
 * Toggle: USE_APIFY_FALLBACK=true in env to prefer Apify over
 * direct HTTP. Default off — direct is primary. The airbnb.ts
 * and zillow.ts clients call useApifyFallback() on direct failure
 * to decide whether to try Apify.
 *
 * All Apify calls use the synchronous "run-sync-get-dataset-items"
 * endpoint so we get results in one round-trip instead of polling
 * a job. Apify caps synchronous runs at 5 min; we set a 4-min
 * client timeout to fail before that.
 */

const APIFY_BASE = "https://api.apify.com/v2";
const SYNC_TIMEOUT_MS = 240_000;

export function useApifyFallback(): boolean {
  return (
    process.env.USE_APIFY_FALLBACK === "true" &&
    process.env.APIFY_API_TOKEN !== undefined
  );
}

async function runActorSync<T = unknown>(params: {
  actorId: string;
  input: unknown;
}): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN not set");

  const url = new URL(
    `${APIFY_BASE}/acts/${params.actorId}/run-sync-get-dataset-items`,
  );
  url.searchParams.set("token", token);
  // Respectful per-run timeout (seconds).
  url.searchParams.set("timeout", "240");
  // memoryMbytes helps cost predictability — keep on the small side.
  url.searchParams.set("memory", "512");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
    },
    body: JSON.stringify(params.input),
    signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify actor ${params.actorId} responded ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T[];
}

export async function runAirbnbScraper(params: {
  lat: number;
  lng: number;
  /** Optional human-readable query — the tri_angle actor prefers
   *  "City, State" over raw coordinates because it uses Airbnb's
   *  own location autocomplete. Falls back to "lat, lng" if unset. */
  locationQuery?: string;
  /** Max listings to return. Default 20. */
  maxListings?: number;
}): Promise<unknown[]> {
  // tri_angle/airbnb-scraper input shape (per Apify store page):
  //   locationQueries: string[]
  //   maxListings: number
  //   currency: string
  // Sending unknown fields breaks actor input validation, so only
  // include the documented keys.
  return runActorSync({
    actorId: "tri_angle~airbnb-scraper",
    input: {
      locationQueries: [
        params.locationQuery ?? `${params.lat}, ${params.lng}`,
      ],
      maxListings: params.maxListings ?? 20,
      currency: "USD",
    },
  });
}

export async function runZillowScraper(params: {
  url: string;
}): Promise<unknown[]> {
  // maxcopell/zillow-scraper's input schema calls the field
  // searchUrls (per Apify store page), not startUrls. Sending
  // the wrong shape returned 400 "input.searchUrls is required".
  return runActorSync({
    actorId: "maxcopell~zillow-scraper",
    input: {
      searchUrls: [{ url: params.url }],
    },
  });
}
