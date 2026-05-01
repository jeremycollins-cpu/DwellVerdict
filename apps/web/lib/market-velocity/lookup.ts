import "server-only";

import {
  TTL,
  withCache,
  MarketVelocitySignalSchema,
  type DbClient,
  type MarketVelocitySignal,
} from "@dwellverdict/data-sources";
import { lookupMarketVelocity } from "@dwellverdict/ai";

/**
 * Market velocity fetcher wrapper (M3.12).
 *
 * Wraps the LLM-backed `lookupMarketVelocity` task with the shared
 * `data_source_cache` (14-day TTL, source = `market-velocity`,
 * key = `${state}:${city}` lowercased). Pairs with sales-comps
 * but at coarser, market-wide granularity.
 */
export type MarketVelocityResult =
  | {
      ok: true;
      data: MarketVelocitySignal;
      source: "market-velocity";
      fetchedAt: string;
    }
  | {
      ok: false;
      error: string;
      source: "market-velocity";
      skipped?: boolean;
    };

export type GetMarketVelocityParams = {
  db: DbClient;
  city: string;
  state: string;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export async function getMarketVelocitySignal(
  params: GetMarketVelocityParams,
): Promise<MarketVelocityResult> {
  const { db, city, state, userId, orgId, verdictId } = params;

  if (!city || !state) {
    return {
      ok: false,
      error: "market-velocity: city and state are required",
      source: "market-velocity",
    };
  }

  const cacheKey = `${state.toLowerCase()}:${city.toLowerCase()}`;

  try {
    const data = await withCache({
      db,
      source: "market-velocity",
      cacheKey,
      ttlMs: TTL.MARKET_VELOCITY,
      fetch: async () => {
        const result = await lookupMarketVelocity({
          city,
          state,
          userId,
          orgId,
          verdictId,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        const out = result.output;
        const signal: MarketVelocitySignal = MarketVelocitySignalSchema.parse({
          city,
          state: state.toUpperCase(),
          medianDaysOnMarketCurrent: out.median_days_on_market_current,
          medianDaysOnMarketYearAgo: out.median_days_on_market_year_ago,
          trend: out.trend,
          listToSaleRatio: out.list_to_sale_ratio,
          inventoryMonths: out.inventory_months,
          demandSummary: out.demand_summary,
          seasonalityNote: out.seasonality_note ?? null,
          dataQuality: out.data_quality,
          summary: buildMarketVelocitySummary(out, city, state),
        });
        return signal;
      },
    });
    return {
      ok: true,
      data,
      source: "market-velocity",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "market-velocity",
    };
  }
}

function buildMarketVelocitySummary(
  out: {
    median_days_on_market_current: number;
    median_days_on_market_year_ago: number;
    trend: "accelerating" | "stable" | "decelerating";
    list_to_sale_ratio: number;
    inventory_months: number;
    data_quality: "rich" | "partial" | "unavailable";
  },
  city: string,
  state: string,
): string {
  const cur = out.median_days_on_market_current;
  const yr = out.median_days_on_market_year_ago;
  const ratio = out.list_to_sale_ratio.toFixed(2);
  const inv = out.inventory_months.toFixed(1);
  if (out.data_quality === "unavailable") {
    return `${city}, ${state} market velocity data limited; placeholder regional medians applied.`;
  }
  return `${city}, ${state} median DOM ${cur}d (was ${yr}d a year ago — ${out.trend}); list-to-sale ${ratio}; ${inv}mo inventory.`;
}
