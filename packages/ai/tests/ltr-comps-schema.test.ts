import { describe, expect, it } from "vitest";

import { LtrCompsLookupOutputSchema } from "../src/tasks/ltr-comps-lookup";

/**
 * Schema regression for the M3.11 ltr-comps-lookup tool output.
 * Pure schema tests — live LLM behavior covered by manual verdict
 * regenerations against production properties (Roseville LTR is
 * the canonical post-merge smoke test).
 */

const golden = {
  median_monthly_rent_cents: 280000,
  rent_range_low_cents: 240000,
  rent_range_high_cents: 320000,
  comp_count_estimated: 18,
  market_summary:
    "Roseville's 3BR LTR market clusters $2,400-$3,200 monthly per recent Zillow Rentals + Rentometer coverage; demand is supported by Sacramento commute access and steady population growth.",
  demand_indicators: [
    "Top-50 employer corridor (Hewlett Packard, Kaiser Permanente) within 10 miles",
    "Sacramento commute via I-80 supports professional-tenant demand",
  ],
  vacancy_estimate: 0.06,
  data_quality: "rich" as const,
};

describe("LtrCompsLookupOutputSchema (M3.11)", () => {
  it("accepts a well-formed payload", () => {
    expect(LtrCompsLookupOutputSchema.safeParse(golden).success).toBe(true);
  });

  it("accepts minimal payload (no optional fields)", () => {
    const minimal = {
      median_monthly_rent_cents: 150000,
      rent_range_low_cents: 130000,
      rent_range_high_cents: 175000,
      comp_count_estimated: 8,
      market_summary: "Modest LTR market with limited public recall.",
      vacancy_estimate: 0.08,
      data_quality: "partial" as const,
    };
    expect(LtrCompsLookupOutputSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects rent_range_low > median (inversion)", () => {
    const bad = LtrCompsLookupOutputSchema.safeParse({
      ...golden,
      rent_range_low_cents: 400000,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects rent_range_high < median (inversion)", () => {
    const bad = LtrCompsLookupOutputSchema.safeParse({
      ...golden,
      rent_range_high_cents: 200000,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects negative rent values", () => {
    const bad = LtrCompsLookupOutputSchema.safeParse({
      ...golden,
      median_monthly_rent_cents: -100,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects rent above the $50K/mo cap (5_000_000 cents)", () => {
    const bad = LtrCompsLookupOutputSchema.safeParse({
      ...golden,
      median_monthly_rent_cents: 6_000_000,
      rent_range_high_cents: 7_000_000,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects vacancy outside 0..0.30", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        vacancy_estimate: 0.5,
      }).success,
    ).toBe(false);
  });

  it("rejects comp_count > 50", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        comp_count_estimated: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects empty market_summary", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({ ...golden, market_summary: "" })
        .success,
    ).toBe(false);
  });

  it("rejects market_summary > 500 chars", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        market_summary: "x".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("rejects more than 5 demand_indicators", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        demand_indicators: ["a", "b", "c", "d", "e", "f"],
      }).success,
    ).toBe(false);
  });

  it("rejects demand_indicator > 280 chars", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        demand_indicators: ["x".repeat(281)],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown data_quality value", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        data_quality: "perfect",
      }).success,
    ).toBe(false);
  });

  it("accepts data_quality='unavailable' (low-recall city)", () => {
    expect(
      LtrCompsLookupOutputSchema.safeParse({
        ...golden,
        data_quality: "unavailable",
      }).success,
    ).toBe(true);
  });
});
