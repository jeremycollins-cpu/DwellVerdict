import { describe, expect, it } from "vitest";

import { scoreVerdict, type VerdictInputs } from "../src/scoring";

/**
 * M3.12 — sales-comp wiring tests. Verifies that:
 *   - appreciation_potential prefers sales-comp inputs when available
 *   - appreciation_potential falls back to schools/walk/income proxies
 *     when sales-comp data is missing or unavailable
 *   - arv_margin computes a real margin when ARV + offer cents are
 *     supplied (replacing the M3.8 placeholder)
 *   - offer_price_alignment penalizes significantly_high variance
 *     and rewards significantly_low for non-STR theses
 */

function baseInputs(overrides: Partial<VerdictInputs> = {}): VerdictInputs {
  return {
    thesisType: "owner_occupied",
    goalType: "appreciation",
    state: null,
    regulatory: null,
    flood: { sfha: false },
    wildfire: { nearbyFireCount: 0 },
    crime: { violentPer1k: 3, propertyPer1k: 12 },
    walkScore: 60,
    comps: { count: 0, medianNightlyRate: null },
    revenue: null,
    referencePrice: 700_000,
    placeSentimentBullets: 0,
    schools: {
      medianElementaryRating: 7,
      medianMiddleRating: 7,
      medianHighRating: 7.5,
      dataQuality: "rich",
    },
    regulatoryThesis: null,
    rentalCompVariance: null,
    arvEstimateCents: null,
    renovationBudgetCents: null,
    userOfferCents: null,
    incomeChange5y: null,
    salesComps: null,
    marketVelocityTrend: null,
    offerPriceVariance: null,
    ...overrides,
  };
}

describe("appreciation_potential — sales-comp-driven path (M3.12)", () => {
  it("uses sales-comp + market velocity when available", () => {
    const r = scoreVerdict(
      baseInputs({
        salesComps: {
          medianCompPriceCents: 75_000_000,
          estimatedArvCents: 78_000_000,
          arvConfidence: "high",
          medianDaysOnMarket: 12,
          marketVelocity: "fast",
          recentCompShare: 0.8,
          dataQuality: "rich",
        },
        marketVelocityTrend: "accelerating",
      }),
    );
    const appr = r.breakdown.find((b) => b.key === "appreciation_potential");
    expect(appr).toBeDefined();
    // The note must reference market velocity + recent comps,
    // not "(proxy fallback)".
    expect(appr?.note).toMatch(/market fast/);
    expect(appr?.note).toMatch(/accelerating/);
    expect(appr?.note).not.toMatch(/proxy fallback/);
  });

  it("falls back to proxies when sales-comp data is unavailable", () => {
    const r = scoreVerdict(
      baseInputs({
        salesComps: null, // sales-comps fetcher failed or skipped
      }),
    );
    const appr = r.breakdown.find((b) => b.key === "appreciation_potential");
    expect(appr).toBeDefined();
    expect(appr?.note).toMatch(/proxy fallback/);
  });

  it("falls back to proxies when salesComps.dataQuality is provided but rule sees null (orchestrator strips unavailable)", () => {
    // The orchestrator nulls salesComps when dataQuality is
    // 'unavailable'. Verify the rule's fallback path fires.
    const r = scoreVerdict(
      baseInputs({
        salesComps: null,
      }),
    );
    const appr = r.breakdown.find((b) => b.key === "appreciation_potential");
    expect(appr?.note).toMatch(/proxy fallback/);
  });

  it("rewards accelerating market more than decelerating", () => {
    const accelerating = scoreVerdict(
      baseInputs({
        salesComps: {
          medianCompPriceCents: 75_000_000,
          estimatedArvCents: 78_000_000,
          arvConfidence: "high",
          medianDaysOnMarket: 10,
          marketVelocity: "fast",
          recentCompShare: 0.8,
          dataQuality: "rich",
        },
        marketVelocityTrend: "accelerating",
      }),
    );
    const decelerating = scoreVerdict(
      baseInputs({
        salesComps: {
          medianCompPriceCents: 75_000_000,
          estimatedArvCents: 78_000_000,
          arvConfidence: "moderate",
          medianDaysOnMarket: 60,
          marketVelocity: "slow",
          recentCompShare: 0.3,
          dataQuality: "rich",
        },
        marketVelocityTrend: "decelerating",
      }),
    );
    expect(accelerating.score).toBeGreaterThan(decelerating.score);
  });
});

describe("arv_margin — comp-derived ARV (M3.12)", () => {
  it("computes a real margin when ARV cents + user offer cents both present", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: 60_000_000, // $600K ARV
        userOfferCents: 40_000_000, // $400K offer
        renovationBudgetCents: 5_000_000, // $50K reno
      }),
    );
    const arv = r.breakdown.find((b) => b.key === "arv_margin");
    expect(arv).toBeDefined();
    // ARV $600K - offer $400K - reno $50K - holding $20K = $130K
    // margin = 32.5% > 20% threshold → positive contribution near full weight
    expect(arv?.contribution).toBeGreaterThan(0);
    expect(arv?.note).toMatch(/Estimated flip margin/);
    expect(arv?.note).toMatch(/ARV \$600,?000/);
  });

  it("emits the no-data note when ARV is null", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: null,
        userOfferCents: 40_000_000,
      }),
    );
    const arv = r.breakdown.find((b) => b.key === "arv_margin");
    expect(arv?.contribution).toBe(0);
    expect(arv?.note).toMatch(/ARV margin requires/);
  });

  it("includes ARV confidence in the note when salesComps provides it", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: 60_000_000,
        userOfferCents: 40_000_000,
        renovationBudgetCents: 5_000_000,
        salesComps: {
          medianCompPriceCents: 50_000_000,
          estimatedArvCents: 60_000_000,
          arvConfidence: "moderate",
          medianDaysOnMarket: 18,
          marketVelocity: "moderate",
          recentCompShare: 0.6,
          dataQuality: "rich",
        },
      }),
    );
    const arv = r.breakdown.find((b) => b.key === "arv_margin");
    expect(arv?.note).toMatch(/moderate ARV confidence/);
  });

  it("computes negative contribution when margin is thin or negative", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: 42_000_000, // ARV barely above offer
        userOfferCents: 40_000_000,
        renovationBudgetCents: 5_000_000,
      }),
    );
    const arv = r.breakdown.find((b) => b.key === "arv_margin");
    // (42 - 40 - 5 - 2) / 40 = -0.125 → negative contribution
    expect(arv?.contribution).toBeLessThan(0);
  });
});

describe("offer_price_alignment — sales-comp variance (M3.12)", () => {
  it("rewards significantly_low offer (acquisition discount)", () => {
    const aligned = scoreVerdict(
      baseInputs({ offerPriceVariance: "aligned" }),
    );
    const acquisition = scoreVerdict(
      baseInputs({ offerPriceVariance: "significantly_low" }),
    );
    expect(acquisition.score).toBeGreaterThan(aligned.score);
    const offer = acquisition.breakdown.find(
      (b) => b.key === "offer_price_alignment",
    );
    expect(offer?.contribution).toBeGreaterThan(0);
  });

  it("penalizes significantly_high offer (overpaying)", () => {
    const aligned = scoreVerdict(
      baseInputs({ offerPriceVariance: "aligned" }),
    );
    const overpaying = scoreVerdict(
      baseInputs({ offerPriceVariance: "significantly_high" }),
    );
    expect(overpaying.score).toBeLessThan(aligned.score);
    const offer = overpaying.breakdown.find(
      (b) => b.key === "offer_price_alignment",
    );
    expect(offer?.contribution).toBeLessThan(0);
  });

  it("does not emit for STR thesis (weight=0)", () => {
    const r = scoreVerdict(
      baseInputs({
        thesisType: "str",
        regulatory: { strLegal: "yes" },
        offerPriceVariance: "significantly_high",
      }),
    );
    expect(
      r.breakdown.some((b) => b.key === "offer_price_alignment"),
    ).toBe(false);
  });

  it("emits aligned with positive (modest) contribution for OO", () => {
    const r = scoreVerdict(
      baseInputs({ offerPriceVariance: "aligned" }),
    );
    const offer = r.breakdown.find((b) => b.key === "offer_price_alignment");
    expect(offer).toBeDefined();
    expect(offer?.contribution).toBeGreaterThan(0);
  });
});

describe("Flipping rubric (M3.12 end-to-end)", () => {
  it("Flipping verdict's score is dominated by ARV margin + offer alignment + appreciation", () => {
    const goodFlip = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: 60_000_000,
        userOfferCents: 40_000_000,
        renovationBudgetCents: 5_000_000,
        offerPriceVariance: "significantly_low",
        salesComps: {
          medianCompPriceCents: 55_000_000,
          estimatedArvCents: 60_000_000,
          arvConfidence: "high",
          medianDaysOnMarket: 14,
          marketVelocity: "fast",
          recentCompShare: 0.7,
          dataQuality: "rich",
        },
        marketVelocityTrend: "accelerating",
      }),
    );
    const badFlip = scoreVerdict(
      baseInputs({
        thesisType: "flipping",
        regulatory: null,
        arvEstimateCents: 42_000_000, // thin margin
        userOfferCents: 40_000_000,
        renovationBudgetCents: 5_000_000,
        offerPriceVariance: "significantly_high",
        salesComps: {
          medianCompPriceCents: 35_000_000,
          estimatedArvCents: 42_000_000,
          arvConfidence: "low",
          medianDaysOnMarket: 75,
          marketVelocity: "slow",
          recentCompShare: 0.2,
          dataQuality: "partial",
        },
        marketVelocityTrend: "decelerating",
      }),
    );
    expect(goodFlip.score).toBeGreaterThan(badFlip.score + 25);
  });
});
