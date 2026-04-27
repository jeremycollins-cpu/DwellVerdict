import { describe, expect, it } from "vitest";

import { computeIntakeRevenue } from "../src/revenue";

/**
 * Pure-function tests for M3.6's intake-driven revenue formula.
 * Replaces nothing in the comp-based `computeRevenueEstimate` —
 * this is a sibling that runs first when intake fields are
 * populated.
 */

describe("computeIntakeRevenue (M3.6)", () => {
  it("STR: nightly rate × occupancy × 365, net of intake expenses", () => {
    const r = computeIntakeRevenue({
      thesisType: "str",
      strExpectedNightlyRateCents: 22_000, // $220/night
      strExpectedOccupancy: 0.65,
      annualPropertyTaxCents: 540_000, // $5,400/yr
      annualInsuranceEstimateCents: 200_000, // $2,000/yr
      monthlyHoaFeeCents: null,
    });
    expect(r).not.toBeNull();
    // $220 × 0.65 × 365 = $52,195 gross median
    expect(r!.annualMedian).toBe(52_195);
    // Net = gross - ($5,400 + $2,000) = $44,795
    expect(r!.netAnnualMedian).toBe(44_795);
    expect(r!.summary).toContain("$220");
    expect(r!.summary).toContain("65%");
    expect(r!.inputs.compsUsed).toBe(0);
  });

  it("STR: falls back to default 30% expense ratio when no intake expenses", () => {
    const r = computeIntakeRevenue({
      thesisType: "str",
      strExpectedNightlyRateCents: 20_000,
      strExpectedOccupancy: 0.5,
    });
    expect(r).not.toBeNull();
    // gross = $200 × 0.5 × 365 = $36,500
    expect(r!.annualMedian).toBe(36_500);
    // No expenses → fall back to 30% ratio: 36,500 × 0.7 = 25,550
    expect(r!.netAnnualMedian).toBe(25_550);
  });

  it("STR: returns null when nightly rate or occupancy missing", () => {
    expect(
      computeIntakeRevenue({
        thesisType: "str",
        strExpectedNightlyRateCents: 22_000,
        strExpectedOccupancy: null,
      }),
    ).toBeNull();
    expect(
      computeIntakeRevenue({
        thesisType: "str",
        strExpectedNightlyRateCents: null,
        strExpectedOccupancy: 0.6,
      }),
    ).toBeNull();
  });

  it("LTR: monthly rent × 12 × (1 - vacancy), net of intake expenses", () => {
    const r = computeIntakeRevenue({
      thesisType: "ltr",
      ltrExpectedMonthlyRentCents: 240_000, // $2,400/mo
      ltrVacancyRate: 0.07,
      annualPropertyTaxCents: 600_000, // $6,000/yr
      annualInsuranceEstimateCents: 150_000, // $1,500/yr
      monthlyHoaFeeCents: null,
    });
    expect(r).not.toBeNull();
    // gross = $2,400 × 12 × 0.93 = $26,784
    expect(r!.annualMedian).toBe(26_784);
    // Net = 26,784 - (6,000 + 1,500) = 19,284
    expect(r!.netAnnualMedian).toBe(19_284);
    expect(r!.summary).toContain("$2,400");
    expect(r!.summary).toContain("LTR");
  });

  it("LTR: defaults vacancy to 5% when omitted", () => {
    const r = computeIntakeRevenue({
      thesisType: "ltr",
      ltrExpectedMonthlyRentCents: 200_000, // $2,000
    });
    expect(r).not.toBeNull();
    // gross = 2000 × 12 × 0.95 = 22,800
    expect(r!.annualMedian).toBe(22_800);
  });

  it("LTR: returns null when monthly rent missing", () => {
    expect(
      computeIntakeRevenue({
        thesisType: "ltr",
        ltrExpectedMonthlyRentCents: null,
        ltrVacancyRate: 0.05,
      }),
    ).toBeNull();
  });

  it("owner_occupied: returns null (no rental income)", () => {
    expect(
      computeIntakeRevenue({
        thesisType: "owner_occupied",
        ltrExpectedMonthlyRentCents: 999_999, // ignored
      }),
    ).toBeNull();
  });

  it("flipping: returns null (no rental income)", () => {
    expect(
      computeIntakeRevenue({
        thesisType: "flipping",
      }),
    ).toBeNull();
  });

  it("house_hacking with STR fields: uses STR formula for the rented portion", () => {
    const r = computeIntakeRevenue({
      thesisType: "house_hacking",
      strExpectedNightlyRateCents: 12_000,
      strExpectedOccupancy: 0.5,
    });
    expect(r).not.toBeNull();
    expect(r!.summary).toContain("STR");
  });

  it("'other' thesis without revenue fields: returns null", () => {
    expect(
      computeIntakeRevenue({
        thesisType: "other",
      }),
    ).toBeNull();
  });

  it("HOA fees roll into expense subtraction", () => {
    const noHoa = computeIntakeRevenue({
      thesisType: "ltr",
      ltrExpectedMonthlyRentCents: 200_000,
      annualPropertyTaxCents: 500_000,
      annualInsuranceEstimateCents: 100_000,
      monthlyHoaFeeCents: null,
    });
    const withHoa = computeIntakeRevenue({
      thesisType: "ltr",
      ltrExpectedMonthlyRentCents: 200_000,
      annualPropertyTaxCents: 500_000,
      annualInsuranceEstimateCents: 100_000,
      monthlyHoaFeeCents: 30_000, // $300/mo = $3,600/yr
    });
    expect(noHoa).not.toBeNull();
    expect(withHoa).not.toBeNull();
    // The HOA difference of $3,600/yr should fully reflect.
    expect(noHoa!.netAnnualMedian - withHoa!.netAnnualMedian).toBe(3600);
  });
});
