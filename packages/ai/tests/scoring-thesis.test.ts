import { describe, expect, it } from "vitest";

import {
  getRegionalRiskOverride,
  scoreVerdict,
  type VerdictInputs,
} from "../src/scoring";

/**
 * M3.8 thesis-aware scoring regression. These tests pin the per-
 * thesis rubric weight selection, the new rules
 * (livability/appreciation/ARV/schools/rental_comp_alignment), and
 * the regional risk multipliers.
 */

function baseInputs(overrides: Partial<VerdictInputs> = {}): VerdictInputs {
  return {
    thesisType: "str",
    goalType: null,
    state: null,
    regulatory: { strLegal: "yes" },
    flood: { sfha: false },
    wildfire: { nearbyFireCount: 0 },
    crime: { violentPer1k: 3.0, propertyPer1k: 15.0 },
    walkScore: 60,
    comps: { count: 10, medianNightlyRate: 200 },
    revenue: { netAnnualMedian: 20_000 },
    referencePrice: 500_000,
    placeSentimentBullets: 3,
    schools: null,
    regulatoryThesis: null,
    rentalCompVariance: null,
    arvEstimateCents: null,
    renovationBudgetCents: null,
    userOfferCents: null,
    incomeChange5y: null,
    ...overrides,
  };
}

describe("scoreVerdict — thesis-aware rubric selection", () => {
  it("STR breakdown excludes schools_quality and livability_score (weight=0)", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "str",
        schools: {
          medianElementaryRating: 8,
          medianMiddleRating: 7,
          medianHighRating: 8.5,
          dataQuality: "rich",
        },
      }),
    );
    expect(r.breakdown.some((b) => b.key === "schools_quality")).toBe(false);
    expect(r.breakdown.some((b) => b.key === "livability_score")).toBe(false);
    // Cap rate + STR regulatory still present
    expect(r.breakdown.some((b) => b.key === "cap_rate_vs_price")).toBe(true);
    expect(r.breakdown.some((b) => b.key === "regulatory_str")).toBe(true);
  });

  it("LTR breakdown includes schools_quality, excludes livability + STR regulatory", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "ltr",
        regulatory: null, // LTR uses regulatoryThesis instead
        schools: {
          medianElementaryRating: 8,
          medianMiddleRating: 7,
          medianHighRating: 8.5,
          dataQuality: "rich",
        },
      }),
    );
    expect(r.breakdown.some((b) => b.key === "schools_quality")).toBe(true);
    expect(r.breakdown.some((b) => b.key === "regulatory_str")).toBe(false);
    expect(r.breakdown.some((b) => b.key === "livability_score")).toBe(false);
    // LTR still has cap rate weight
    expect(r.breakdown.some((b) => b.key === "cap_rate_vs_price")).toBe(true);
  });

  it("Owner-occupied breakdown excludes cap_rate_vs_price (weight=0)", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "owner_occupied",
        regulatory: null,
        schools: {
          medianElementaryRating: 8,
          medianMiddleRating: 7,
          medianHighRating: 8,
          dataQuality: "rich",
        },
      }),
    );
    expect(r.breakdown.some((b) => b.key === "cap_rate_vs_price")).toBe(false);
    expect(r.breakdown.some((b) => b.key === "livability_score")).toBe(true);
    expect(r.breakdown.some((b) => b.key === "schools_quality")).toBe(true);
    expect(r.breakdown.some((b) => b.key === "regulatory_str")).toBe(false);
  });

  it("Flipping breakdown features arv_margin and excludes cap_rate", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: 60_000_000,
        userOfferCents: 40_000_000,
        renovationBudgetCents: 5_000_000,
      }),
    );
    expect(r.breakdown.some((b) => b.key === "cap_rate_vs_price")).toBe(false);
    const arv = r.breakdown.find((b) => b.key === "arv_margin");
    expect(arv).toBeDefined();
    // ARV $600K, offer $400K, reno $50K, holding ~$20K (5%) → margin
    // ~32.5% → above 20% threshold so positive contribution.
    expect(arv?.contribution).toBeGreaterThan(0);
  });

  it("Flipping with no ARV signal still emits a placeholder breakdown row", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: null,
      }),
    );
    const arv = r.breakdown.find((b) => b.key === "arv_margin");
    expect(arv).toBeDefined();
    expect(arv?.contribution).toBe(0);
    expect(arv?.note).toMatch(/M3\.12/);
  });

  it("House-hacking with adu_legal=no triggers a strong negative regulatory_thesis penalty", () => {
    const baseline = scoreVerdict(
      baseInputs({
        thesisType: "house_hacking",
        regulatory: null,
        regulatoryThesis: {
          thesisDimension: "house_hacking",
          aduLegal: "yes",
          ownerOccupiedStrCarveout: "yes",
        },
      }),
    );
    const banned = scoreVerdict(
      baseInputs({
        thesisType: "house_hacking",
        regulatory: null,
        regulatoryThesis: {
          thesisDimension: "house_hacking",
          aduLegal: "no",
          ownerOccupiedStrCarveout: null,
        },
      }),
    );
    expect(banned.score).toBeLessThan(baseline.score);
    const reg = banned.breakdown.find((b) => b.key === "regulatory_thesis");
    expect(reg?.contribution).toBeLessThan(0);
  });
});

describe("scoreVerdict — new rules", () => {
  it("schools_quality contributes more positively for higher-rated schools", () => {
    const lowSchools = scoreVerdict(
      baseInputs({
        thesisType: "ltr",
        regulatory: null,
        schools: {
          medianElementaryRating: 4,
          medianMiddleRating: 4,
          medianHighRating: 4,
          dataQuality: "rich",
        },
      }),
    );
    const highSchools = scoreVerdict(
      baseInputs({
        thesisType: "ltr",
        regulatory: null,
        schools: {
          medianElementaryRating: 9,
          medianMiddleRating: 9,
          medianHighRating: 9,
          dataQuality: "rich",
        },
      }),
    );
    expect(highSchools.score).toBeGreaterThan(lowSchools.score);
  });

  it("schools dataQuality='unavailable' suppresses schools_quality entry", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "ltr",
        regulatory: null,
        schools: {
          medianElementaryRating: 8,
          medianMiddleRating: 8,
          medianHighRating: 8,
          dataQuality: "unavailable",
        },
      }),
    );
    expect(r.breakdown.some((b) => b.key === "schools_quality")).toBe(false);
  });

  it("rental_comp_alignment penalizes significantly_high variance", () => {
    const aligned = scoreVerdict(
      baseInputs({ thesisType: "str", rentalCompVariance: "aligned" }),
    );
    const overEstimating = scoreVerdict(
      baseInputs({
        thesisType: "str",
        rentalCompVariance: "significantly_high",
      }),
    );
    expect(overEstimating.score).toBeLessThan(aligned.score);
    const flag = overEstimating.breakdown.find(
      (b) => b.key === "rental_comp_alignment",
    );
    expect(flag?.contribution).toBeLessThan(0);
  });

  it("livability_score combines walk + crime + schools into a single OO entry", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "owner_occupied",
        regulatory: null,
        walkScore: 80,
        crime: { violentPer1k: 2, propertyPer1k: 12 },
        schools: {
          medianElementaryRating: 9,
          medianMiddleRating: 9,
          medianHighRating: 9,
          dataQuality: "rich",
        },
      }),
    );
    const livability = r.breakdown.find((b) => b.key === "livability_score");
    expect(livability).toBeDefined();
    expect(livability?.contribution).toBeGreaterThan(0);
    expect(livability?.category).toBe("location");
  });

  it("appreciation_potential reflects positive income growth + good schools", () => {
    const stagnant = scoreVerdict(
      baseInputs({
        thesisType: "owner_occupied",
        regulatory: null,
        incomeChange5y: 0,
        schools: {
          medianElementaryRating: 6,
          medianMiddleRating: 6,
          medianHighRating: 6,
          dataQuality: "rich",
        },
      }),
    );
    const growing = scoreVerdict(
      baseInputs({
        thesisType: "owner_occupied",
        regulatory: null,
        incomeChange5y: 20,
        schools: {
          medianElementaryRating: 9,
          medianMiddleRating: 9,
          medianHighRating: 9,
          dataQuality: "rich",
        },
      }),
    );
    expect(growing.score).toBeGreaterThan(stagnant.score);
  });
});

describe("scoreVerdict — regional risk overrides", () => {
  it("CA boosts wildfire weight (1.5×) when fires are present", () => {
    const noState = scoreVerdict(
      baseInputs({ state: null, wildfire: { nearbyFireCount: 8 } }),
    );
    const ca = scoreVerdict(
      baseInputs({ state: "CA", wildfire: { nearbyFireCount: 8 } }),
    );
    expect(ca.score).toBeLessThan(noState.score);
    const wildfire = ca.breakdown.find((b) => b.key === "wildfire");
    expect(wildfire?.multiplier).toBe(1.5);
  });

  it("FL boosts flood weight (1.5×) when SFHA is true", () => {
    const noState = scoreVerdict(baseInputs({ state: null, flood: { sfha: true } }));
    const fl = scoreVerdict(baseInputs({ state: "FL", flood: { sfha: true } }));
    expect(fl.score).toBeLessThan(noState.score);
    const flood = fl.breakdown.find((b) => b.key === "flood");
    expect(flood?.multiplier).toBe(1.5);
  });

  it("getRegionalRiskOverride returns expected mappings", () => {
    expect(getRegionalRiskOverride("CA")).toEqual({ wildfire: 1.5 });
    expect(getRegionalRiskOverride("FL")).toEqual({ flood: 1.5 });
    expect(getRegionalRiskOverride("TX")).toEqual({ flood: 1.3 });
    expect(getRegionalRiskOverride("CO")).toEqual({ wildfire: 1.2 });
    expect(getRegionalRiskOverride("WA")).toEqual({ wildfire: 1.1 });
    expect(getRegionalRiskOverride("NY")).toEqual({});
    expect(getRegionalRiskOverride(null)).toEqual({});
  });
});

describe("scoreVerdict — breakdown shape (M3.8)", () => {
  it("every entry carries category + weight (the legacy-banner discriminator)", () => {
    const r = scoreVerdict(baseInputs());
    for (const b of r.breakdown) {
      expect(typeof b.category).toBe("string");
      expect(typeof b.weight).toBe("number");
      expect(b.weight).toBeGreaterThan(0);
    }
  });

  it("STR with regulatory='no' still PASSes (regulatory dealbreaker preserved)", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "str",
        regulatory: { strLegal: "no" },
      }),
    );
    expect(r.signal).toBe("pass");
  });

  it("LTR with regulatory_str irrelevant: a strLegal='no' input does NOT auto-PASS", () => {
    // For LTR thesis, STR regulatory weight is 0 — strLegal='no' is
    // structurally moot. Signal should be derived from non-STR rules.
    const r = scoreVerdict(
      baseInputs({
        thesisType: "ltr",
        regulatory: { strLegal: "no" }, // ignored for LTR
        regulatoryThesis: {
          thesisDimension: "ltr",
          rentControl: "none",
          evictionFriendliness: "balanced",
        },
        schools: {
          medianElementaryRating: 8,
          medianMiddleRating: 8,
          medianHighRating: 8,
          dataQuality: "rich",
        },
      }),
    );
    expect(r.signal).not.toBe("pass");
  });
});
