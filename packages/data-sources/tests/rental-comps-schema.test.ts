import { describe, expect, it } from "vitest";

import {
  LtrCompsSignalSchema,
  StrCompsSignalSchema,
} from "../src/types";

/**
 * Pure schema regression for the M3.11 rental comp signal types.
 * The wrappers in apps/web/lib/{ltr,str}-comps/lookup.ts map LLM
 * snake_case output to these camelCase signal shapes before
 * persisting to data_source_cache. Tests pin the boundary that
 * downstream consumers rely on.
 */

const ltrBase = {
  city: "Roseville",
  state: "CA",
  bedrooms: 4,
  bathrooms: 2.5,
  sqftBucket: 2250,
  medianMonthlyRentCents: 280000,
  rentRangeLowCents: 240000,
  rentRangeHighCents: 320000,
  compCountEstimated: 18,
  vacancyEstimate: 0.06,
  marketSummary:
    "Roseville LTR clusters $2,400-$3,200 monthly with steady demand from the I-80 commute corridor.",
  demandIndicators: ["Sacramento commute access supports professional tenants"],
  dataQuality: "rich" as const,
  summary: "Roseville, CA median rent ~$2,800/mo ($2,400–$3,200).",
};

describe("LtrCompsSignalSchema (M3.11 persistence shape)", () => {
  it("accepts a well-formed signal", () => {
    expect(LtrCompsSignalSchema.safeParse(ltrBase).success).toBe(true);
  });

  it("accepts nullable bedrooms / bathrooms / sqftBucket", () => {
    const r = LtrCompsSignalSchema.safeParse({
      ...ltrBase,
      bedrooms: null,
      bathrooms: null,
      sqftBucket: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects state code that isn't 2 chars", () => {
    expect(
      LtrCompsSignalSchema.safeParse({ ...ltrBase, state: "California" })
        .success,
    ).toBe(false);
  });

  it("rejects negative rent", () => {
    expect(
      LtrCompsSignalSchema.safeParse({
        ...ltrBase,
        medianMonthlyRentCents: -100,
      }).success,
    ).toBe(false);
  });

  it("rejects rent above the $50K/mo cap", () => {
    expect(
      LtrCompsSignalSchema.safeParse({
        ...ltrBase,
        medianMonthlyRentCents: 6_000_000,
        rentRangeHighCents: 7_000_000,
      }).success,
    ).toBe(false);
  });

  it("requires summary", () => {
    const { summary: _summary, ...withoutSummary } = ltrBase;
    void _summary;
    expect(LtrCompsSignalSchema.safeParse(withoutSummary).success).toBe(false);
  });
});

const strBase = {
  city: "Kings Beach",
  state: "CA",
  bedrooms: 3,
  bathrooms: 2,
  medianAdrCents: 35000,
  adrRangeLowCents: 25000,
  adrRangeHighCents: 50000,
  medianOccupancy: 0.58,
  occupancyRangeLow: 0.45,
  occupancyRangeHigh: 0.72,
  estimatedCompCount: 42,
  marketSummary:
    "Kings Beach STR market is anchored by North Lake Tahoe ski + summer-water demand.",
  seasonality: "high" as const,
  peakSeasonMonths: ["June", "July", "August", "December"],
  demandDrivers: ["Ski resort drive market"],
  dataQuality: "rich" as const,
  summary: "Kings Beach, CA median STR ~$350/night, 58% occupancy, high seasonality.",
};

describe("StrCompsSignalSchema (M3.11 persistence shape)", () => {
  it("accepts a well-formed signal", () => {
    expect(StrCompsSignalSchema.safeParse(strBase).success).toBe(true);
  });

  it("accepts nullable bedrooms / bathrooms", () => {
    expect(
      StrCompsSignalSchema.safeParse({
        ...strBase,
        bedrooms: null,
        bathrooms: null,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown seasonality value", () => {
    expect(
      StrCompsSignalSchema.safeParse({
        ...strBase,
        seasonality: "extreme",
      }).success,
    ).toBe(false);
  });

  it("rejects median_occupancy > 1", () => {
    expect(
      StrCompsSignalSchema.safeParse({
        ...strBase,
        medianOccupancy: 1.2,
      }).success,
    ).toBe(false);
  });

  it("rejects ADR above the $5K/night cap", () => {
    expect(
      StrCompsSignalSchema.safeParse({
        ...strBase,
        medianAdrCents: 600_000,
        adrRangeHighCents: 700_000,
      }).success,
    ).toBe(false);
  });

  it("rejects more than 6 peakSeasonMonths", () => {
    expect(
      StrCompsSignalSchema.safeParse({
        ...strBase,
        peakSeasonMonths: ["a", "b", "c", "d", "e", "f", "g"],
      }).success,
    ).toBe(false);
  });
});
