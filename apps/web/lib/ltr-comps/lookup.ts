import "server-only";

import {
  TTL,
  withCache,
  LtrCompsSignalSchema,
  type DbClient,
  type LtrCompsSignal,
} from "@dwellverdict/data-sources";
import { lookupLtrComps } from "@dwellverdict/ai";

/**
 * LTR rental-comp fetcher wrapper (M3.11).
 *
 * Wraps the LLM-backed `lookupLtrComps` task with the shared
 * `data_source_cache` (30-day TTL, source = `ltr-comps`, key =
 * `${state}:${city}:${beds}-${baths}-${sqftBucket}` lowercased).
 * On cache hit, no AI call. On cache miss, Haiku is called once
 * for the (city, configuration) tuple; subsequent properties of
 * the same configuration in the same city for the next 30 days
 * reuse that single lookup.
 *
 * Properties without bedroom/bathroom intake fields fall back to
 * the city-level "any" bucket (`-`) — still useful market context
 * even without the configuration-specific median.
 */
export type LtrCompsResult =
  | { ok: true; data: LtrCompsSignal; source: "ltr-comps"; fetchedAt: string }
  | { ok: false; error: string; source: "ltr-comps"; skipped?: boolean };

export type GetLtrCompsParams = {
  db: DbClient;
  city: string;
  state: string;
  /** Bedrooms — included in cache key when known. */
  bedrooms?: number | null;
  /** Bathrooms — included in cache key when known. */
  bathrooms?: number | null;
  /** Square footage — bucketed to nearest 250 sqft for cache key. */
  sqft?: number | null;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export async function getLtrCompsSignal(
  params: GetLtrCompsParams,
): Promise<LtrCompsResult> {
  const { db, city, state, bedrooms, bathrooms, sqft, userId, orgId, verdictId } =
    params;

  if (!city || !state) {
    return {
      ok: false,
      error: "ltr-comps: city and state are required",
      source: "ltr-comps",
    };
  }

  const sqftBucket =
    typeof sqft === "number" && sqft > 0
      ? Math.round(sqft / 250) * 250
      : null;
  const bedsKey = bedrooms != null ? String(bedrooms) : "any";
  const bathsKey = bathrooms != null ? String(bathrooms) : "any";
  const sqftKey = sqftBucket != null ? String(sqftBucket) : "any";
  const cacheKey = `${state.toLowerCase()}:${city.toLowerCase()}:${bedsKey}-${bathsKey}-${sqftKey}`;

  try {
    const data = await withCache({
      db,
      source: "ltr-comps",
      cacheKey,
      ttlMs: TTL.LTR_COMPS,
      fetch: async () => {
        const result = await lookupLtrComps({
          city,
          state,
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          sqft: sqft ?? null,
          userId,
          orgId,
          verdictId,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        const out = result.output;
        const signal: LtrCompsSignal = LtrCompsSignalSchema.parse({
          city,
          state: state.toUpperCase(),
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          sqftBucket,
          medianMonthlyRentCents: out.median_monthly_rent_cents,
          rentRangeLowCents: out.rent_range_low_cents,
          rentRangeHighCents: out.rent_range_high_cents,
          compCountEstimated: out.comp_count_estimated,
          vacancyEstimate: out.vacancy_estimate,
          marketSummary: out.market_summary,
          demandIndicators: out.demand_indicators,
          dataQuality: out.data_quality,
          summary: buildLtrCompsSummary(out, city, state),
        });
        return signal;
      },
    });
    return {
      ok: true,
      data,
      source: "ltr-comps",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "ltr-comps",
    };
  }
}

/**
 * One-line summary the narrative + UI use as a fallback view of the
 * comp record. When data_quality is "unavailable" we surface that
 * explicitly so downstream consumers don't render fabricated
 * confidence.
 */
function buildLtrCompsSummary(
  out: {
    median_monthly_rent_cents: number;
    rent_range_low_cents: number;
    rent_range_high_cents: number;
    data_quality: "rich" | "partial" | "unavailable";
  },
  city: string,
  state: string,
): string {
  const median = (out.median_monthly_rent_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const low = (out.rent_range_low_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const high = (out.rent_range_high_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  if (out.data_quality === "unavailable") {
    return `LTR comp data limited for ${city}, ${state}. Estimates ${low}–${high}/mo are placeholders.`;
  }
  return `${city}, ${state} median rent ~${median}/mo (${low}–${high}).`;
}
