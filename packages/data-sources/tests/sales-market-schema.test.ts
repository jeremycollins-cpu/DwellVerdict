import { describe, expect, it } from "vitest";

import {
  SalesCompsSignalSchema,
  MarketVelocitySignalSchema,
} from "../src/types";

/**
 * Persistence-shape regression for the M3.12 sales comp + market
 * velocity signals. The wrappers in apps/web/lib/{sales-comps,
 * market-velocity}/lookup.ts map LLM snake_case output to these
 * camelCase signal shapes before persisting to data_source_cache.
 */

const salesGolden = {
  city: "Roseville",
  state: "CA",
  bedrooms: 4,
  bathrooms: 2.5,
  sqftBucket: 2250,
  yearBucket: 2000,
  comps: [
    {
      addressApproximate: "200 block of Maywood Ct",
      salePriceCents: 78_500_000,
      saleDateMonth: "2026-02",
      beds: 4,
      baths: 2.5,
      sqft: 2200,
      yearBuilt: 2003,
      daysOnMarket: 22,
      saleType: "standard" as const,
      adjustmentsSummary: "Comparable lot + condition.",
    },
  ],
  estimatedArvCents: 80_000_000,
  arvConfidence: "moderate" as const,
  arvRationale: "Recent comps cluster $750-825K.",
  medianCompPriceCents: 78_500_000,
  compPriceRangeLowCents: 78_500_000,
  compPriceRangeHighCents: 78_500_000,
  medianDaysOnMarket: 22,
  marketVelocity: "moderate" as const,
  marketSummary: "Roseville sales market is balanced.",
  compCount: 1,
  dataQuality: "rich" as const,
  summary: "Roseville median comp $785K; ARV $800K; moderate velocity.",
};

describe("SalesCompsSignalSchema (M3.12 persistence)", () => {
  it("accepts a well-formed signal", () => {
    expect(SalesCompsSignalSchema.safeParse(salesGolden).success).toBe(true);
  });

  it("accepts nullable bedrooms / bathrooms / sqftBucket / yearBucket", () => {
    expect(
      SalesCompsSignalSchema.safeParse({
        ...salesGolden,
        bedrooms: null,
        bathrooms: null,
        sqftBucket: null,
        yearBucket: null,
      }).success,
    ).toBe(true);
  });

  it("rejects state that isn't 2 chars", () => {
    expect(
      SalesCompsSignalSchema.safeParse({ ...salesGolden, state: "California" })
        .success,
    ).toBe(false);
  });

  it("rejects negative ARV", () => {
    expect(
      SalesCompsSignalSchema.safeParse({
        ...salesGolden,
        estimatedArvCents: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects ARV above $50M cap", () => {
    expect(
      SalesCompsSignalSchema.safeParse({
        ...salesGolden,
        estimatedArvCents: 60_000_000_00,
        medianCompPriceCents: 60_000_000_00,
        compPriceRangeHighCents: 60_000_000_00,
      }).success,
    ).toBe(false);
  });

  it("rejects more than 10 comps", () => {
    const eleven = Array.from({ length: 11 }, () => salesGolden.comps[0]!);
    expect(
      SalesCompsSignalSchema.safeParse({
        ...salesGolden,
        comps: eleven,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown saleType", () => {
    expect(
      SalesCompsSignalSchema.safeParse({
        ...salesGolden,
        comps: [{ ...salesGolden.comps[0]!, saleType: "wholesale" }],
      }).success,
    ).toBe(false);
  });

  it("requires summary", () => {
    const { summary: _summary, ...withoutSummary } = salesGolden;
    void _summary;
    expect(SalesCompsSignalSchema.safeParse(withoutSummary).success).toBe(false);
  });
});

const velocityGolden = {
  city: "Roseville",
  state: "CA",
  medianDaysOnMarketCurrent: 18,
  medianDaysOnMarketYearAgo: 22,
  trend: "stable" as const,
  listToSaleRatio: 0.99,
  inventoryMonths: 2.4,
  demandSummary: "Roseville sales market remains balanced.",
  seasonalityNote: null,
  dataQuality: "rich" as const,
  summary:
    "Roseville median DOM 18d; list-to-sale 0.99; 2.4mo inventory.",
};

describe("MarketVelocitySignalSchema (M3.12 persistence)", () => {
  it("accepts a well-formed signal", () => {
    expect(MarketVelocitySignalSchema.safeParse(velocityGolden).success).toBe(
      true,
    );
  });

  it("accepts seasonalityNote up to 280 chars", () => {
    expect(
      MarketVelocitySignalSchema.safeParse({
        ...velocityGolden,
        seasonalityNote: "x".repeat(280),
      }).success,
    ).toBe(true);
  });

  it("rejects seasonalityNote > 280 chars", () => {
    expect(
      MarketVelocitySignalSchema.safeParse({
        ...velocityGolden,
        seasonalityNote: "x".repeat(281),
      }).success,
    ).toBe(false);
  });

  it("rejects listToSaleRatio outside 0.7-1.3", () => {
    expect(
      MarketVelocitySignalSchema.safeParse({
        ...velocityGolden,
        listToSaleRatio: 1.5,
      }).success,
    ).toBe(false);
  });

  it("rejects DOM > 365", () => {
    expect(
      MarketVelocitySignalSchema.safeParse({
        ...velocityGolden,
        medianDaysOnMarketCurrent: 400,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown trend value", () => {
    expect(
      MarketVelocitySignalSchema.safeParse({
        ...velocityGolden,
        trend: "rebounding",
      }).success,
    ).toBe(false);
  });
});
