import { describe, expect, it } from "vitest";

import {
  INTAKE_STEP_SCHEMAS,
  intakeStep1Schema,
  intakeStep4Schema,
  intakeStep6Schema,
  propertyIntakeSubmitSchema,
  VALID_GOALS_PER_THESIS,
} from "@/lib/onboarding/schema";

/**
 * Pure Zod tests for the M3.5 intake schemas. No DB; verifies the
 * trust boundary that protects the property row from malformed
 * client submissions.
 */

const validBaseSubmit = {
  thesisType: "str" as const,
  thesisOtherDescription: null,
  goalType: "cap_rate" as const,
  yearBuilt: 2005,
  bedrooms: 3,
  bathrooms: 2.5,
  sqft: 1800,
  lotSqft: 6500,
  listingPriceCents: 45_000_000,
  userOfferPriceCents: null,
  estimatedValueCents: null,
  annualPropertyTaxCents: 540_000,
  annualInsuranceEstimateCents: 200_000,
  monthlyHoaFeeCents: null,
  strExpectedNightlyRateCents: 22_000,
  strExpectedOccupancy: 0.65,
  strCleaningFeeCents: 12_500,
  strAvgLengthOfStayDays: 4,
  ltrExpectedMonthlyRentCents: null,
  ltrVacancyRate: null,
  ltrExpectedAppreciationRate: null,
  downPaymentPercent: null,
  mortgageRate: null,
  mortgageTermYears: null,
  renovationBudgetCents: null,
  flippingArvEstimateCents: null,
};

describe("VALID_GOALS_PER_THESIS", () => {
  it("locks flipping to flip_profit only", () => {
    expect(VALID_GOALS_PER_THESIS.flipping).toEqual(["flip_profit"]);
  });

  it("forbids cap_rate goal for owner_occupied", () => {
    expect(VALID_GOALS_PER_THESIS.owner_occupied).not.toContain("cap_rate");
  });

  it("allows all 5 goals for 'other' thesis", () => {
    expect(VALID_GOALS_PER_THESIS.other).toHaveLength(5);
  });
});

describe("intakeStep1Schema (thesis)", () => {
  it("accepts a valid thesis", () => {
    const r = intakeStep1Schema.safeParse({
      thesisType: "ltr",
      thesisOtherDescription: null,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown thesis_type", () => {
    const r = intakeStep1Schema.safeParse({
      thesisType: "yacht",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a 3000-char description", () => {
    const r = intakeStep1Schema.safeParse({
      thesisType: "other",
      thesisOtherDescription: "x".repeat(3000),
    });
    expect(r.success).toBe(false);
  });
});

describe("intakeStep4Schema (pricing)", () => {
  it("accepts integer cents", () => {
    const r = intakeStep4Schema.safeParse({
      listingPriceCents: 45_000_000,
      userOfferPriceCents: 43_000_000,
      estimatedValueCents: 46_500_000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-integer cents", () => {
    const r = intakeStep4Schema.safeParse({
      listingPriceCents: 45_000_000.5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative prices", () => {
    const r = intakeStep4Schema.safeParse({
      listingPriceCents: -100,
    });
    expect(r.success).toBe(false);
  });
});

describe("intakeStep6Schema (thesis-specific)", () => {
  it("rejects occupancy > 1", () => {
    const r = intakeStep6Schema.safeParse({
      strExpectedOccupancy: 1.5,
    });
    expect(r.success).toBe(false);
  });

  it("rejects appreciation rate > 0.5", () => {
    const r = intakeStep6Schema.safeParse({
      ltrExpectedAppreciationRate: 0.8,
    });
    expect(r.success).toBe(false);
  });

  it("accepts an empty payload (every field optional)", () => {
    const r = intakeStep6Schema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe("propertyIntakeSubmitSchema (final)", () => {
  it("accepts a valid STR submission", () => {
    const r = propertyIntakeSubmitSchema.safeParse(validBaseSubmit);
    expect(r.success).toBe(true);
  });

  it("rejects flipping + cap_rate (incompatible thesis-goal)", () => {
    const r = propertyIntakeSubmitSchema.safeParse({
      ...validBaseSubmit,
      thesisType: "flipping",
      goalType: "cap_rate",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("goalType"))).toBe(
        true,
      );
    }
  });

  it("rejects owner_occupied + cap_rate (incompatible)", () => {
    const r = propertyIntakeSubmitSchema.safeParse({
      ...validBaseSubmit,
      thesisType: "owner_occupied",
      goalType: "cap_rate",
    });
    expect(r.success).toBe(false);
  });

  it("accepts owner_occupied + lifestyle", () => {
    const r = propertyIntakeSubmitSchema.safeParse({
      ...validBaseSubmit,
      thesisType: "owner_occupied",
      goalType: "lifestyle",
    });
    expect(r.success).toBe(true);
  });

  it("accepts other + flip_profit (other allows everything)", () => {
    const r = propertyIntakeSubmitSchema.safeParse({
      ...validBaseSubmit,
      thesisType: "other",
      goalType: "flip_profit",
    });
    expect(r.success).toBe(true);
  });

  it("accepts year_built at boundary (1800)", () => {
    const r = propertyIntakeSubmitSchema.safeParse({
      ...validBaseSubmit,
      yearBuilt: 1800,
    });
    expect(r.success).toBe(true);
  });

  it("rejects year_built before 1800", () => {
    const r = propertyIntakeSubmitSchema.safeParse({
      ...validBaseSubmit,
      yearBuilt: 1799,
    });
    expect(r.success).toBe(false);
  });
});

describe("INTAKE_STEP_SCHEMAS lookup", () => {
  it("contains 6 step schemas (step 7 is review-only)", () => {
    expect(Object.keys(INTAKE_STEP_SCHEMAS)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("step 2 schema requires goalType", () => {
    const r = INTAKE_STEP_SCHEMAS[2].safeParse({});
    expect(r.success).toBe(false);
  });
});
