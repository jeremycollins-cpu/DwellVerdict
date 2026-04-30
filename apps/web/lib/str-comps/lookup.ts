import "server-only";

import {
  TTL,
  withCache,
  StrCompsSignalSchema,
  type DbClient,
  type StrCompsSignal,
} from "@dwellverdict/data-sources";
import { lookupStrComps } from "@dwellverdict/ai";

/**
 * STR rental-comp fetcher wrapper (M3.11).
 *
 * Wraps the LLM-backed `lookupStrComps` task with the shared
 * `data_source_cache` (14-day TTL, source = `str-comps`, key =
 * `${state}:${city}:${beds}-${baths}` lowercased). Replaces the
 * brittle Apify Airbnb scrape as the *primary* STR comp source —
 * Apify still runs as optional enrichment when it works (rare in
 * many smaller markets).
 */
export type StrCompsResult =
  | { ok: true; data: StrCompsSignal; source: "str-comps"; fetchedAt: string }
  | { ok: false; error: string; source: "str-comps"; skipped?: boolean };

export type GetStrCompsParams = {
  db: DbClient;
  city: string;
  state: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export async function getStrCompsSignal(
  params: GetStrCompsParams,
): Promise<StrCompsResult> {
  const { db, city, state, bedrooms, bathrooms, userId, orgId, verdictId } =
    params;

  if (!city || !state) {
    return {
      ok: false,
      error: "str-comps: city and state are required",
      source: "str-comps",
    };
  }

  const bedsKey = bedrooms != null ? String(bedrooms) : "any";
  const bathsKey = bathrooms != null ? String(bathrooms) : "any";
  const cacheKey = `${state.toLowerCase()}:${city.toLowerCase()}:${bedsKey}-${bathsKey}`;

  try {
    const data = await withCache({
      db,
      source: "str-comps",
      cacheKey,
      ttlMs: TTL.STR_COMPS,
      fetch: async () => {
        const result = await lookupStrComps({
          city,
          state,
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          userId,
          orgId,
          verdictId,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        const out = result.output;
        const signal: StrCompsSignal = StrCompsSignalSchema.parse({
          city,
          state: state.toUpperCase(),
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          medianAdrCents: out.median_adr_cents,
          adrRangeLowCents: out.adr_range_low_cents,
          adrRangeHighCents: out.adr_range_high_cents,
          medianOccupancy: out.median_occupancy,
          occupancyRangeLow: out.occupancy_range_low,
          occupancyRangeHigh: out.occupancy_range_high,
          estimatedCompCount: out.estimated_comp_count,
          marketSummary: out.market_summary,
          seasonality: out.seasonality,
          peakSeasonMonths: out.peak_season_months,
          demandDrivers: out.demand_drivers,
          dataQuality: out.data_quality,
          summary: buildStrCompsSummary(out, city, state),
        });
        return signal;
      },
    });
    return {
      ok: true,
      data,
      source: "str-comps",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "str-comps",
    };
  }
}

function buildStrCompsSummary(
  out: {
    median_adr_cents: number;
    median_occupancy: number;
    seasonality: "high" | "moderate" | "low";
    data_quality: "rich" | "partial" | "unavailable";
  },
  city: string,
  state: string,
): string {
  const adr = (out.median_adr_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const occPct = Math.round(out.median_occupancy * 100);
  if (out.data_quality === "unavailable") {
    return `STR comp data limited for ${city}, ${state}. ADR ${adr} / ${occPct}% occupancy are placeholders.`;
  }
  return `${city}, ${state} median STR ~${adr}/night, ${occPct}% occupancy, ${out.seasonality} seasonality.`;
}
