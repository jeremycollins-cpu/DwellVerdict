import { z } from "zod";

/**
 * Shared signal types returned by each free-data client. Every
 * client returns a `SignalResult<T>` — either an `ok: true` payload
 * or an `ok: false` error. The caller (scoring rubric or verdict
 * orchestrator) decides whether a missing signal should fail the
 * verdict or degrade gracefully.
 */
export type SignalResult<T> =
  | { ok: true; data: T; source: string; fetchedAt: string }
  | { ok: false; error: string; source: string };

// ----------------------------------------------------------------
// FEMA flood zone
// ----------------------------------------------------------------

export const FemaFloodSignalSchema = z.object({
  /** FEMA flood zone code — 'A', 'AE', 'VE', 'X', 'D', etc. */
  floodZone: z.string().nullable(),
  /** SFHA (Special Flood Hazard Area) flag — required for insurance. */
  sfha: z.boolean(),
  /** Base Flood Elevation in feet (nullable — not all zones have one). */
  bfeFeet: z.number().nullable(),
  /** Human-readable summary for UI. */
  summary: z.string(),
  /** Source URL for user verification per fair-housing transparency. */
  sourceUrl: z.string().url(),
});
export type FemaFloodSignal = z.infer<typeof FemaFloodSignalSchema>;

// ----------------------------------------------------------------
// USGS wildfire history
// ----------------------------------------------------------------

export const UsgsWildfireSignalSchema = z.object({
  /** Number of historical fires within a 5-mile radius. */
  nearbyFireCount: z.number().int(),
  /** Largest nearby fire in acres, or null if none. */
  largestNearbyAcres: z.number().nullable(),
  /** Most recent fire year within the radius, or null. */
  mostRecentYear: z.number().int().nullable(),
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type UsgsWildfireSignal = z.infer<typeof UsgsWildfireSignalSchema>;

// ----------------------------------------------------------------
// FBI crime data
// ----------------------------------------------------------------

export const FbiCrimeSignalSchema = z.object({
  ori: z.string(), // FBI Originating Agency Identifier
  agencyName: z.string(),
  year: z.number().int(),
  violentPer1k: z.number(),
  propertyPer1k: z.number(),
  totalPer1k: z.number(),
  // Metro average for comparison (nullable when not available).
  metroViolentPer1k: z.number().nullable(),
  metroPropertyPer1k: z.number().nullable(),
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type FbiCrimeSignal = z.infer<typeof FbiCrimeSignalSchema>;

// ----------------------------------------------------------------
// Census ACS demographics — neutral numbers only per fair housing
// ----------------------------------------------------------------

export const CensusAcsSignalSchema = z.object({
  stateFips: z.string(),
  countyFips: z.string(),
  tractCode: z.string(),
  medianHouseholdIncome: z.number().nullable(),
  medianHomeValue: z.number().nullable(),
  // 5-year change as a %, nullable when only one year is available.
  incomeChange5y: z.number().nullable(),
  vacancyRate: z.number().nullable(), // 0..1
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type CensusAcsSignal = z.infer<typeof CensusAcsSignalSchema>;

// ----------------------------------------------------------------
// OSM Overpass amenity + walkability
// ----------------------------------------------------------------

export const OverpassAmenitySignalSchema = z.object({
  // Raw counts within 0.5mi and 1mi radii for UI display.
  halfMile: z.object({
    grocery: z.number().int(),
    restaurant: z.number().int(),
    cafe: z.number().int(),
    bar: z.number().int(),
    transitStops: z.number().int(),
    parks: z.number().int(),
    schools: z.number().int(),
  }),
  oneMile: z.object({
    grocery: z.number().int(),
    restaurant: z.number().int(),
    cafe: z.number().int(),
    bar: z.number().int(),
    transitStops: z.number().int(),
    parks: z.number().int(),
    schools: z.number().int(),
  }),
  // Derived score 0-100 via our own weighted-sum formula.
  walkScore: z.number().min(0).max(100),
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type OverpassAmenitySignal = z.infer<typeof OverpassAmenitySignalSchema>;

// ----------------------------------------------------------------
// Yelp place sentiment
// ----------------------------------------------------------------

export const YelpSentimentSignalSchema = z.object({
  businessCount: z.number().int(),
  averageRating: z.number().nullable(), // null when no businesses nearby
  topCategories: z.array(z.string()), // e.g. ["Coffee", "Pizza", "Bars"]
  sampleReviewSnippets: z.array(
    z.object({
      businessName: z.string(),
      rating: z.number(),
      text: z.string(),
    }),
  ),
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type YelpSentimentSignal = z.infer<typeof YelpSentimentSignalSchema>;

// ----------------------------------------------------------------
// Google Places
// ----------------------------------------------------------------

export const GooglePlacesSignalSchema = z.object({
  placeCount: z.number().int(),
  averageRating: z.number().nullable(),
  reviewSnippets: z.array(
    z.object({
      placeName: z.string(),
      rating: z.number(),
      text: z.string(),
    }),
  ),
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type GooglePlacesSignal = z.infer<typeof GooglePlacesSignalSchema>;

// ----------------------------------------------------------------
// Airbnb / STR comps
// ----------------------------------------------------------------

export const AirbnbCompSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  url: z.string().url(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().nullable(),
  nightlyRate: z.number().nullable(), // ADR in USD
  reviewsCount: z.number().int().nullable(),
  rating: z.number().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  /** Miles from the subject property. Computed client-side. */
  distanceMiles: z.number().nullable(),
});
export type AirbnbComp = z.infer<typeof AirbnbCompSchema>;

export const AirbnbCompsSignalSchema = z.object({
  comps: z.array(AirbnbCompSchema),
  medianNightlyRate: z.number().nullable(),
  medianReviewCount: z.number().nullable(),
  /** Which path produced this data — informs debugging + cost attribution. */
  fetchedVia: z.enum(["direct", "apify"]),
  summary: z.string(),
  sourceUrl: z.string().url(),
});
export type AirbnbCompsSignal = z.infer<typeof AirbnbCompsSignalSchema>;

// ----------------------------------------------------------------
// Zillow / Redfin property valuation
// ----------------------------------------------------------------

export const PropertyValuationSchema = z.object({
  source: z.enum(["zillow", "redfin"]),
  url: z.string().url(),
  zpid: z.string().nullable(), // Zillow-only; null for Redfin
  // Core details
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().nullable(),
  sqft: z.number().int().nullable(),
  yearBuilt: z.number().int().nullable(),
  // Valuations
  currentEstimate: z.number().nullable(), // Zestimate or Redfin Estimate
  currentEstimateHigh: z.number().nullable(),
  currentEstimateLow: z.number().nullable(),
  listPrice: z.number().nullable(), // null if not currently listed
  listStatus: z.string().nullable(), // "FOR_SALE" | "SOLD" | "OFF_MARKET" | ...
  // History
  lastSoldPrice: z.number().nullable(),
  lastSoldDate: z.string().nullable(), // ISO date
  summary: z.string(),
});
export type PropertyValuation = z.infer<typeof PropertyValuationSchema>;

// ----------------------------------------------------------------
// Revenue estimate — deterministic formula output
// ----------------------------------------------------------------

export const RevenueEstimateSchema = z.object({
  /** Gross annual STR revenue low/median/high in USD. */
  annualLow: z.number(),
  annualMedian: z.number(),
  annualHigh: z.number(),
  /** Inputs the formula used — surfaced to the user for transparency. */
  inputs: z.object({
    adrLow: z.number(),
    adrMedian: z.number(),
    adrHigh: z.number(),
    occupancyAssumed: z.number(), // 0..1
    daysAssumed: z.number(), // usually 365
    expenseRatioAssumed: z.number(), // 0..1, e.g. 0.3 for 30%
    compsUsed: z.number().int(),
  }),
  /** Net income after applied expense ratio — what hits the owner. */
  netAnnualMedian: z.number(),
  summary: z.string(),
});
export type RevenueEstimate = z.infer<typeof RevenueEstimateSchema>;

// ----------------------------------------------------------------
// School quality (M3.10)
// ----------------------------------------------------------------

/**
 * Single school entry returned by the LLM-cached schools lookup.
 * Rating is on the GreatSchools 1–10 scale; the LLM is instructed
 * to anchor on that scale even when the underlying rating source
 * (state report cards, district reputation, etc.) uses something
 * else. Optional throughout — the LLM may know a school name
 * without a confident rating, etc.
 */
export const SchoolEntrySchema = z.object({
  name: z.string().min(1).max(120),
  rating: z.number().min(1).max(10).optional(),
  type: z.enum(["public", "private", "charter"]).optional(),
  // M3.10 fix-forward: bumped 200 → 280 chars. Real per-school
  // notes ("recently-renamed STEM-focused magnet that pulls from
  // 5 elementary feeder schools and ranked top-10 in state for
  // engineering pipeline outcomes") regularly run past 200 chars
  // when the LLM has rich recall.
  notes: z.string().max(280).optional(),
});
export type SchoolEntry = z.infer<typeof SchoolEntrySchema>;

/**
 * SchoolsSignal — city-level school context surfaced to the verdict
 * narrative for LTR / Owner-occupied / House-hacking / Flipping
 * theses (occupant- or resale-driven). Cached per (state, city) for
 * 90 days via the shared data_source_cache.
 *
 * `data_quality` separates "the LLM doesn't know this area" (→
 * `unavailable`, empty arrays) from "the LLM has decent recall"
 * (`partial` / `rich`). The narrative prompt uses this flag to
 * decide whether to mention schools at all.
 */
export const SchoolsSignalSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  elementarySchools: z.array(SchoolEntrySchema).max(5).default([]),
  middleSchools: z.array(SchoolEntrySchema).max(5).default([]),
  highSchools: z.array(SchoolEntrySchema).max(5).default([]),
  // M3.10 fix-forward: district_summary 400 → 500 to match the
  // narrative's per-domain summary ceiling. Major districts (e.g.
  // Roseville Joint Union HSD with its inter-district open
  // enrollment dynamic) take ~450 chars to describe accurately.
  districtSummary: z.string().max(500).optional().nullable(),
  // M3.10 fix-forward: per-element max 160 → 280. Roseville's
  // schools rejected on a 167-char STEM-consortium notable
  // factor; rich descriptions of district programs need headroom.
  notableFactors: z.array(z.string().min(1).max(280)).max(5).default([]),
  dataQuality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  summary: z.string().min(1).max(500),
  sourceUrl: z.string().url(),
});
export type SchoolsSignal = z.infer<typeof SchoolsSignalSchema>;

// ----------------------------------------------------------------
// LTR rental comps (M3.11) — LLM-cached city/configuration-keyed
// ----------------------------------------------------------------

/**
 * Long-term rental comp data sourced via Haiku's market knowledge
 * (Rentometer / Zillow Rentals / local rental knowledge encoded in
 * training). v1 has no paid Rentometer integration — Haiku's recall
 * is the primary source. The model is instructed to set
 * `dataQuality: "unavailable"` rather than fabricate medians for
 * markets it doesn't have meaningful recall for.
 *
 * Cache key bucket: `${state}:${city}:${beds}-${baths}-${sqftBucket}`
 * where sqftBucket rounds to nearest 250 sqft so 1100sqft and
 * 1200sqft properties share a row. TTL: 30 days.
 */
export const LtrCompsSignalSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  bedrooms: z.number().int().min(0).max(10).optional().nullable(),
  bathrooms: z.number().min(0).max(10).optional().nullable(),
  sqftBucket: z.number().int().positive().optional().nullable(),
  // Median monthly rent in cents. Cents to keep alignment with the
  // intake fields (ltr_expected_monthly_rent_cents). Cap at $50K/mo
  // to allow extreme high-end markets without artificially clipping.
  medianMonthlyRentCents: z.number().int().min(0).max(5_000_000),
  rentRangeLowCents: z.number().int().min(0).max(5_000_000),
  rentRangeHighCents: z.number().int().min(0).max(5_000_000),
  compCountEstimated: z.number().int().min(0).max(50),
  vacancyEstimate: z.number().min(0).max(0.3),
  marketSummary: z.string().min(1).max(500),
  demandIndicators: z.array(z.string().min(1).max(280)).max(5).default([]),
  dataQuality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  summary: z.string().min(1).max(500),
});
export type LtrCompsSignal = z.infer<typeof LtrCompsSignalSchema>;

// ----------------------------------------------------------------
// STR rental comps (M3.11) — LLM-cached city/configuration-keyed
// ----------------------------------------------------------------

/**
 * Short-term (vacation) rental comp data sourced via Haiku's market
 * knowledge of Airbnb / VRBO / AirDNA-style coverage. Replaces the
 * Apify-based comp scrape as the *primary* STR comp source for v1
 * — Apify's `tri_angle/airbnb-scraper` returns 0 listings for many
 * markets (Kings Beach, smaller Lake Tahoe submarkets), so STR
 * verdicts depended on a brittle path. Apify continues to run as
 * optional enrichment when it succeeds; the orchestrator no longer
 * gates on it.
 *
 * Cache key bucket: `${state}:${city}:${beds}-${baths}`. TTL: 14
 * days (STR markets shift faster than LTR — peak-season ADR can
 * change materially month over month).
 */
export const StrCompsSignalSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  bedrooms: z.number().int().min(0).max(10).optional().nullable(),
  bathrooms: z.number().min(0).max(10).optional().nullable(),
  // Median nightly rate (Average Daily Rate) in cents. Cap at $5K/
  // night to allow extreme luxury markets without clipping.
  medianAdrCents: z.number().int().min(0).max(500_000),
  adrRangeLowCents: z.number().int().min(0).max(500_000),
  adrRangeHighCents: z.number().int().min(0).max(500_000),
  medianOccupancy: z.number().min(0).max(1),
  occupancyRangeLow: z.number().min(0).max(1),
  occupancyRangeHigh: z.number().min(0).max(1),
  estimatedCompCount: z.number().int().min(0).max(100),
  marketSummary: z.string().min(1).max(500),
  seasonality: z.enum(["high", "moderate", "low"]),
  peakSeasonMonths: z.array(z.string().min(1).max(20)).max(6).default([]),
  demandDrivers: z.array(z.string().min(1).max(280)).max(5).default([]),
  dataQuality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  summary: z.string().min(1).max(500),
});
export type StrCompsSignal = z.infer<typeof StrCompsSignalSchema>;

// ----------------------------------------------------------------
// Sales comps + ARV (M3.12) — LLM-cached, configuration-keyed
// ----------------------------------------------------------------

/**
 * Single recently-sold comparable. Fields are aligned with what
 * Haiku can reasonably recall from Zillow/Redfin sold-listings
 * coverage in its training data; address is intentionally
 * block-level only (not exact street number) since (a) Haiku
 * tends to hallucinate exact addresses, (b) the verdict UI doesn't
 * expose individual street numbers anyway, (c) public-facing
 * verdict copy avoids implying we have MLS-level granularity we
 * don't actually have.
 */
export const SalesCompEntrySchema = z.object({
  addressApproximate: z.string().min(1).max(200),
  salePriceCents: z.number().int().positive().max(50_000_000_00),
  saleDateMonth: z.string().regex(/^\d{4}-\d{2}$/),
  beds: z.number().int().min(0).max(20),
  baths: z.number().min(0).max(20),
  sqft: z.number().int().min(100).max(50_000),
  yearBuilt: z.number().int().min(1700).max(2030),
  daysOnMarket: z.number().int().min(0).max(365),
  saleType: z.enum(["standard", "distressed", "off_market", "auction"]),
  adjustmentsSummary: z.string().min(1).max(280),
});
export type SalesCompEntry = z.infer<typeof SalesCompEntrySchema>;

/**
 * Sales comp + ARV signal for thesis-aware verdict generation
 * (LTR appreciation, Owner-occupied appreciation, House-hacking,
 * Flipping). Replaces the M3.8 placeholder where appreciation_potential
 * relied solely on schools/walkability proxies and arv_margin was
 * an empty placeholder rule.
 *
 * Cache key bucket: `${state}:${city}:${beds}-${baths}-
 * ${sqftBucket}-${yearBucket}` where sqftBucket rounds to nearest
 * 250 sqft and yearBucket is the decade (1970, 1980, 1990, 2000,
 * 2010, 2020). TTL: 30 days.
 */
export const SalesCompsSignalSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  bedrooms: z.number().int().min(0).max(20).optional().nullable(),
  bathrooms: z.number().min(0).max(20).optional().nullable(),
  sqftBucket: z.number().int().positive().optional().nullable(),
  yearBucket: z.number().int().min(1700).max(2030).optional().nullable(),
  comps: z.array(SalesCompEntrySchema).max(10).default([]),
  estimatedArvCents: z.number().int().positive().max(50_000_000_00),
  arvConfidence: z.enum(["high", "moderate", "low"]),
  arvRationale: z.string().min(1).max(800),
  medianCompPriceCents: z.number().int().positive().max(50_000_000_00),
  compPriceRangeLowCents: z.number().int().positive().max(50_000_000_00),
  compPriceRangeHighCents: z.number().int().positive().max(50_000_000_00),
  medianDaysOnMarket: z.number().int().min(0).max(365),
  marketVelocity: z.enum(["fast", "moderate", "slow"]),
  marketSummary: z.string().min(1).max(800),
  compCount: z.number().int().min(0).max(20),
  dataQuality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  summary: z.string().min(1).max(800),
});
export type SalesCompsSignal = z.infer<typeof SalesCompsSignalSchema>;

// ----------------------------------------------------------------
// Market velocity (M3.12) — LLM-cached, city-keyed
// ----------------------------------------------------------------

/**
 * Aggregate market velocity signal — broader than per-comp DOM,
 * captures whether the *market* is accelerating or decelerating.
 * Used by the appreciation_potential rule (M3.8) and surfaced as
 * narrative context for OO/LTR-appreciation/HH/flipping verdicts.
 *
 * Cache key: `${state}:${city}`. TTL: 14 days (velocity shifts
 * faster than per-property comps).
 */
export const MarketVelocitySignalSchema = z.object({
  city: z.string().min(1).max(120),
  state: z.string().min(2).max(2),
  medianDaysOnMarketCurrent: z.number().int().min(0).max(365),
  medianDaysOnMarketYearAgo: z.number().int().min(0).max(365),
  trend: z.enum(["accelerating", "stable", "decelerating"]),
  // List-to-sale: 1.0 = at list; 0.97 = 3% under list; 1.02 = 2%
  // over list (bidding war). Realistic range: 0.7 (deep discount
  // markets) to 1.3 (aggressive bidding).
  listToSaleRatio: z.number().min(0.7).max(1.3),
  // Inventory months of supply: <2 sellers' market, 2-4 balanced,
  // 4-6 buyers' market, >6 deep buyers' market.
  inventoryMonths: z.number().min(0).max(24),
  demandSummary: z.string().min(1).max(500),
  seasonalityNote: z.string().max(280).optional().nullable(),
  dataQuality: z.enum(["rich", "partial", "unavailable"]).default("partial"),
  summary: z.string().min(1).max(500),
});
export type MarketVelocitySignal = z.infer<typeof MarketVelocitySignalSchema>;
