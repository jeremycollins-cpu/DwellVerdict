import { describe, expect, it } from "vitest";

import { StrCompsLookupOutputSchema } from "../src/tasks/str-comps-lookup";

/**
 * Schema regression for the M3.11 str-comps-lookup tool output.
 * Live LLM behavior covered by manual Kings Beach STR verdict
 * regeneration post-merge.
 */

const golden = {
  median_adr_cents: 35000,
  adr_range_low_cents: 25000,
  adr_range_high_cents: 50000,
  median_occupancy: 0.58,
  occupancy_range_low: 0.45,
  occupancy_range_high: 0.72,
  estimated_comp_count: 42,
  market_summary:
    "Kings Beach STR market is anchored by North Lake Tahoe ski + summer-water demand; ADR clusters $250-500 with sharp peak/off-peak swings.",
  seasonality: "high" as const,
  peak_season_months: ["June", "July", "August", "December", "January", "February"],
  demand_drivers: [
    "Northstar California + Heavenly drive ski-season demand",
    "Lake Tahoe public-beach access pulls summer water-sports crowd",
  ],
  data_quality: "rich" as const,
};

describe("StrCompsLookupOutputSchema (M3.11)", () => {
  it("accepts a well-formed payload", () => {
    expect(StrCompsLookupOutputSchema.safeParse(golden).success).toBe(true);
  });

  it("accepts minimal payload (no optional fields)", () => {
    const minimal = {
      median_adr_cents: 12000,
      adr_range_low_cents: 9000,
      adr_range_high_cents: 16000,
      median_occupancy: 0.45,
      occupancy_range_low: 0.3,
      occupancy_range_high: 0.6,
      estimated_comp_count: 12,
      market_summary: "Sleepy market with limited LLM recall.",
      seasonality: "low" as const,
      data_quality: "partial" as const,
    };
    expect(StrCompsLookupOutputSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects adr_range_low > median (inversion)", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        adr_range_low_cents: 60000,
      }).success,
    ).toBe(false);
  });

  it("rejects occupancy_range_high < median (inversion)", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        occupancy_range_high: 0.4,
      }).success,
    ).toBe(false);
  });

  it("rejects median_occupancy > 1", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        median_occupancy: 1.2,
      }).success,
    ).toBe(false);
  });

  it("rejects negative ADR", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        median_adr_cents: -100,
      }).success,
    ).toBe(false);
  });

  it("rejects ADR above the $5K/night cap (500_000 cents)", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        median_adr_cents: 600_000,
        adr_range_high_cents: 700_000,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown seasonality value", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        seasonality: "extreme",
      }).success,
    ).toBe(false);
  });

  it("rejects more than 6 peak_season_months", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        peak_season_months: ["a", "b", "c", "d", "e", "f", "g"],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 5 demand_drivers", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        demand_drivers: ["a", "b", "c", "d", "e", "f"],
      }).success,
    ).toBe(false);
  });

  it("rejects demand_driver > 280 chars", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        demand_drivers: ["x".repeat(281)],
      }).success,
    ).toBe(false);
  });

  it("rejects market_summary > 500 chars", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        market_summary: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("rejects empty market_summary", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({ ...golden, market_summary: "" })
        .success,
    ).toBe(false);
  });

  it("accepts data_quality='unavailable' (low-recall city)", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        data_quality: "unavailable",
      }).success,
    ).toBe(true);
  });

  it("accepts seasonality='low' with empty peak_season_months", () => {
    expect(
      StrCompsLookupOutputSchema.safeParse({
        ...golden,
        seasonality: "low",
        peak_season_months: [],
      }).success,
    ).toBe(true);
  });
});
