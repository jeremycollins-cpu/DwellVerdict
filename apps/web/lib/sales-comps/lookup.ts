import "server-only";

import {
  TTL,
  withCache,
  SalesCompsSignalSchema,
  type DbClient,
  type SalesCompsSignal,
} from "@dwellverdict/data-sources";
import { lookupSalesComps } from "@dwellverdict/ai";

/**
 * Sales comp + ARV fetcher wrapper (M3.12).
 *
 * Wraps the LLM-backed `lookupSalesComps` task with the shared
 * `data_source_cache` (30-day TTL, source = `sales-comps`, key =
 * `${state}:${city}:${beds}-${baths}-${sqftBucket}-${yearBucket}`
 * lowercased). On cache hit, no AI call. On cache miss, Haiku is
 * called once for the (city, configuration) tuple; subsequent
 * properties of the same configuration in the same city for the
 * next 30 days reuse that single lookup.
 *
 * Properties without bedroom/bathroom/sqft/yearBuilt intake fall
 * back to the city-level "any" bucket — still useful market context
 * even without configuration-specific comps.
 */
export type SalesCompsResult =
  | {
      ok: true;
      data: SalesCompsSignal;
      source: "sales-comps";
      fetchedAt: string;
    }
  | { ok: false; error: string; source: "sales-comps"; skipped?: boolean };

export type GetSalesCompsParams = {
  db: DbClient;
  city: string;
  state: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  /** Intake-supplied; passed through to LLM for context but does
   *  NOT anchor the ARV estimate (the prompt instructs the model
   *  to provide independent comp-based valuation). */
  userOfferPriceCents?: number | null;
  userEstimatedValueCents?: number | null;
  userRenovationBudgetCents?: number | null;
  userId?: string;
  orgId?: string;
  verdictId?: string;
};

export async function getSalesCompsSignal(
  params: GetSalesCompsParams,
): Promise<SalesCompsResult> {
  const {
    db,
    city,
    state,
    bedrooms,
    bathrooms,
    sqft,
    yearBuilt,
    userOfferPriceCents,
    userEstimatedValueCents,
    userRenovationBudgetCents,
    userId,
    orgId,
    verdictId,
  } = params;

  if (!city || !state) {
    return {
      ok: false,
      error: "sales-comps: city and state are required",
      source: "sales-comps",
    };
  }

  const sqftBucket =
    typeof sqft === "number" && sqft > 0
      ? Math.round(sqft / 250) * 250
      : null;
  const yearBucket =
    typeof yearBuilt === "number" && yearBuilt > 0
      ? Math.floor(yearBuilt / 10) * 10
      : null;
  const bedsKey = bedrooms != null ? String(bedrooms) : "any";
  const bathsKey = bathrooms != null ? String(bathrooms) : "any";
  const sqftKey = sqftBucket != null ? String(sqftBucket) : "any";
  const yearKey = yearBucket != null ? String(yearBucket) : "any";
  const cacheKey = `${state.toLowerCase()}:${city.toLowerCase()}:${bedsKey}-${bathsKey}-${sqftKey}-${yearKey}`;

  try {
    const data = await withCache({
      db,
      source: "sales-comps",
      cacheKey,
      ttlMs: TTL.SALES_COMPS,
      fetch: async () => {
        const result = await lookupSalesComps({
          city,
          state,
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          sqft: sqft ?? null,
          yearBuilt: yearBuilt ?? null,
          userOfferPriceCents: userOfferPriceCents ?? null,
          userEstimatedValueCents: userEstimatedValueCents ?? null,
          userRenovationBudgetCents: userRenovationBudgetCents ?? null,
          userId,
          orgId,
          verdictId,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        const out = result.output;
        const signal: SalesCompsSignal = SalesCompsSignalSchema.parse({
          city,
          state: state.toUpperCase(),
          bedrooms: bedrooms ?? null,
          bathrooms: bathrooms ?? null,
          sqftBucket,
          yearBucket,
          comps: out.comps.map((c) => ({
            addressApproximate: c.address_approximate,
            salePriceCents: c.sale_price_cents,
            saleDateMonth: c.sale_date_month,
            beds: c.beds,
            baths: c.baths,
            sqft: c.sqft,
            yearBuilt: c.year_built,
            daysOnMarket: c.days_on_market,
            saleType: c.sale_type,
            adjustmentsSummary: c.adjustments_summary,
          })),
          estimatedArvCents: out.estimated_arv_cents,
          arvConfidence: out.arv_confidence,
          arvRationale: out.arv_rationale,
          medianCompPriceCents: out.median_comp_price_cents,
          compPriceRangeLowCents: out.comp_price_range_low_cents,
          compPriceRangeHighCents: out.comp_price_range_high_cents,
          medianDaysOnMarket: out.median_days_on_market,
          marketVelocity: out.market_velocity,
          marketSummary: out.market_summary,
          compCount: out.comp_count,
          dataQuality: out.data_quality,
          summary: buildSalesCompsSummary(out, city, state),
        });
        return signal;
      },
    });
    return {
      ok: true,
      data,
      source: "sales-comps",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "sales-comps",
    };
  }
}

function buildSalesCompsSummary(
  out: {
    median_comp_price_cents: number;
    comp_price_range_low_cents: number;
    comp_price_range_high_cents: number;
    median_days_on_market: number;
    market_velocity: "fast" | "moderate" | "slow";
    estimated_arv_cents: number;
    arv_confidence: "high" | "moderate" | "low";
    data_quality: "rich" | "partial" | "unavailable";
  },
  city: string,
  state: string,
): string {
  const median = formatCurrency(out.median_comp_price_cents / 100);
  const arv = formatCurrency(out.estimated_arv_cents / 100);
  const dom = out.median_days_on_market;
  if (out.data_quality === "unavailable") {
    return `Sales comp data limited for ${city}, ${state}. ARV ${arv} (${out.arv_confidence} confidence) is a placeholder.`;
  }
  return `${city}, ${state} median comp ${median} (range ${formatCurrency(out.comp_price_range_low_cents / 100)}–${formatCurrency(out.comp_price_range_high_cents / 100)}); ARV ${arv} (${out.arv_confidence} confidence); median DOM ${dom}d, ${out.market_velocity} velocity.`;
}

function formatCurrency(dollars: number): string {
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
