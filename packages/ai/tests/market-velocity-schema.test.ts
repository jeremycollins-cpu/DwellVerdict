import { describe, expect, it } from "vitest";

import { MarketVelocityLookupOutputSchema } from "../src/tasks/market-velocity-lookup";

/**
 * Schema regression for the M3.12 market-velocity-lookup tool
 * output. Particular focus on the cross-field trend-vs-DOM-ratio
 * check the schema enforces (the prompt instructs the model to
 * compute trend from current/year_ago; we verify server-side).
 */

const golden = {
  median_days_on_market_current: 18,
  median_days_on_market_year_ago: 22,
  trend: "stable" as const,
  list_to_sale_ratio: 0.99,
  inventory_months: 2.4,
  demand_summary:
    "Roseville's sales market remains balanced; Sacramento commute and Hewlett Packard / Kaiser corridor sustain steady buyer demand.",
  data_quality: "rich" as const,
};

describe("MarketVelocityLookupOutputSchema (M3.12)", () => {
  it("accepts a well-formed payload", () => {
    expect(MarketVelocityLookupOutputSchema.safeParse(golden).success).toBe(
      true,
    );
  });

  it("accepts an accelerating market (current/year_ago ratio < 0.8)", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        median_days_on_market_current: 12,
        median_days_on_market_year_ago: 30,
        trend: "accelerating" as const,
      }).success,
    ).toBe(true);
  });

  it("accepts a decelerating market (ratio > 1.2)", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        median_days_on_market_current: 50,
        median_days_on_market_year_ago: 30,
        trend: "decelerating" as const,
      }).success,
    ).toBe(true);
  });

  it("rejects trend='decelerating' when DOM is dropping (ratio < 0.8)", () => {
    const r = MarketVelocityLookupOutputSchema.safeParse({
      ...golden,
      median_days_on_market_current: 12,
      median_days_on_market_year_ago: 30,
      trend: "decelerating" as const,
    });
    expect(r.success).toBe(false);
  });

  it("rejects trend='accelerating' when DOM is rising (ratio > 1.2)", () => {
    const r = MarketVelocityLookupOutputSchema.safeParse({
      ...golden,
      median_days_on_market_current: 50,
      median_days_on_market_year_ago: 30,
      trend: "accelerating" as const,
    });
    expect(r.success).toBe(false);
  });

  it("accepts trend='stable' anywhere in the 0.8-1.2 ratio band", () => {
    const r = MarketVelocityLookupOutputSchema.safeParse({
      ...golden,
      median_days_on_market_current: 25,
      median_days_on_market_year_ago: 28,
      trend: "stable" as const,
    });
    expect(r.success).toBe(true);
  });

  it("rejects list_to_sale_ratio outside 0.7-1.3", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        list_to_sale_ratio: 1.5,
      }).success,
    ).toBe(false);
  });

  it("rejects inventory_months > 24", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        inventory_months: 30,
      }).success,
    ).toBe(false);
  });

  it("rejects DOM > 365", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        median_days_on_market_current: 400,
      }).success,
    ).toBe(false);
  });

  it("accepts optional seasonality_note", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        seasonality_note: "Spring listing surge typically peaks Apr-May.",
      }).success,
    ).toBe(true);
  });

  it("rejects seasonality_note > 280 chars", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        seasonality_note: "x".repeat(281),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown trend value", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        trend: "rebounding",
      }).success,
    ).toBe(false);
  });

  it("rejects empty demand_summary", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        demand_summary: "",
      }).success,
    ).toBe(false);
  });

  it("accepts data_quality='unavailable' with placeholder content", () => {
    expect(
      MarketVelocityLookupOutputSchema.safeParse({
        ...golden,
        data_quality: "unavailable",
      }).success,
    ).toBe(true);
  });
});
