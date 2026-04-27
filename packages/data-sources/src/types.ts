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
