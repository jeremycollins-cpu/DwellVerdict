import { describe, expect, it } from "vitest";

import { SalesCompsLookupOutputSchema } from "../src/tasks/sales-comps-lookup";

/**
 * Schema regression for the M3.12 sales-comps-lookup tool output.
 * Live LLM behavior is validated by the manual production
 * regeneration steps in the milestone runbook (Lincoln OO,
 * Roseville LTR, and a temporary flipping property).
 */

const golden = {
  comps: [
    {
      address_approximate: "200 block of Maywood Ct",
      sale_price_cents: 78_500_000,
      sale_date_month: "2026-02",
      beds: 4,
      baths: 2.5,
      sqft: 2200,
      year_built: 2003,
      days_on_market: 22,
      sale_type: "standard" as const,
      adjustments_summary: "Comparable lot + condition; no major adjustments.",
    },
    {
      address_approximate: "100 block of Heritage Way",
      sale_price_cents: 81_000_000,
      sale_date_month: "2026-01",
      beds: 4,
      baths: 3,
      sqft: 2400,
      year_built: 2005,
      days_on_market: 14,
      sale_type: "standard" as const,
      adjustments_summary: "Slightly larger; adjust ARV upward marginally.",
    },
  ],
  estimated_arv_cents: 80_000_000,
  arv_confidence: "moderate" as const,
  arv_rationale:
    "Recent comps cluster $750-825K; subject's lot and condition place it mid-range. ARV $800K reflects 30-day market.",
  median_comp_price_cents: 79_750_000,
  comp_price_range_low_cents: 78_500_000,
  comp_price_range_high_cents: 81_000_000,
  median_days_on_market: 18,
  market_velocity: "moderate" as const,
  market_summary:
    "Roseville sales market remains balanced with 18-day median DOM; demand supported by Sacramento commute and steady employer growth.",
  comp_count: 2,
  data_quality: "rich" as const,
};

describe("SalesCompsLookupOutputSchema (M3.12)", () => {
  it("accepts a well-formed payload", () => {
    expect(SalesCompsLookupOutputSchema.safeParse(golden).success).toBe(true);
  });

  it("accepts an empty comps array (sparse-data case)", () => {
    const r = SalesCompsLookupOutputSchema.safeParse({
      ...golden,
      comps: [],
      comp_count: 0,
      data_quality: "unavailable" as const,
    });
    expect(r.success).toBe(true);
  });

  it("rejects comp_price_range_low > median (inversion)", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        comp_price_range_low_cents: 85_000_000,
      }).success,
    ).toBe(false);
  });

  it("rejects comp_price_range_high < median (inversion)", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        comp_price_range_high_cents: 70_000_000,
      }).success,
    ).toBe(false);
  });

  it("rejects sale_date_month with full date", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        comps: [{ ...golden.comps[0]!, sale_date_month: "2026-02-15" }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 10 comps", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      ...golden.comps[0]!,
      sale_price_cents: 78_000_000 + i * 100_000,
    }));
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        comps: eleven,
      }).success,
    ).toBe(false);
  });

  it("rejects negative ARV", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        estimated_arv_cents: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects ARV above the $50M cap", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        estimated_arv_cents: 60_000_000_00,
        median_comp_price_cents: 60_000_000_00,
        comp_price_range_high_cents: 60_000_000_00,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown sale_type", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        comps: [{ ...golden.comps[0]!, sale_type: "wholesale" }],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown arv_confidence", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        arv_confidence: "very_high",
      }).success,
    ).toBe(false);
  });

  it("rejects market_summary > 800 chars", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        market_summary: "x".repeat(801),
      }).success,
    ).toBe(false);
  });

  it("rejects arv_rationale > 800 chars", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        arv_rationale: "x".repeat(801),
      }).success,
    ).toBe(false);
  });

  it("rejects adjustments_summary > 280 chars", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        comps: [{ ...golden.comps[0]!, adjustments_summary: "x".repeat(281) }],
      }).success,
    ).toBe(false);
  });

  it("rejects DOM > 365", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        median_days_on_market: 400,
      }).success,
    ).toBe(false);
  });

  it("accepts data_quality='unavailable' with placeholder content", () => {
    expect(
      SalesCompsLookupOutputSchema.safeParse({
        ...golden,
        data_quality: "unavailable" as const,
      }).success,
    ).toBe(true);
  });
});
