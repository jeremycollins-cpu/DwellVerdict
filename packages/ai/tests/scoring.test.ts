import { describe, expect, it } from "vitest";

import { scoreVerdict, type VerdictInputs } from "../src/scoring";

/**
 * Pure-function regression for the deterministic verdict scoring
 * rubric. Weights are documented in scoring.ts and will drift as
 * we tune on real data — these tests lock the current v1 shape.
 */

/**
 * Mid-range baseline — keeps the score away from the 0/100 clamps
 * so penalty/reward comparisons actually show up in the final
 * number. At full-signal defaults this lands in the mid-90s, which
 * leaves headroom for penalty tests.
 */
function baseInputs(overrides: Partial<VerdictInputs> = {}): VerdictInputs {
  return {
    regulatory: { strLegal: "yes" },
    flood: { sfha: false },
    wildfire: { nearbyFireCount: 0 },
    crime: { violentPer1k: 3.0, propertyPer1k: 15.0 },
    walkScore: 70,
    comps: { count: 10, medianNightlyRate: 200 },
    revenue: { netAnnualMedian: 20_000 },
    referencePrice: 500_000,
    placeSentimentBullets: 3,
    ...overrides,
  };
}

describe("scoreVerdict", () => {
  it("yields BUY with a healthy full-signal input", () => {
    const result = scoreVerdict(baseInputs());
    expect(result.signal).toBe("buy");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.confidence).toBe(100);
    expect(result.breakdown.length).toBeGreaterThan(0);
  });

  it("forces PASS when regulatory = 'no', regardless of other signals", () => {
    const result = scoreVerdict(
      baseInputs({ regulatory: { strLegal: "no" } }),
    );
    expect(result.signal).toBe("pass");
  });

  it("drops out of BUY into WATCH when regulatory is 'unclear'", () => {
    const result = scoreVerdict(
      baseInputs({ regulatory: { strLegal: "unclear" } }),
    );
    expect(result.signal).toBe("watch");
  });

  it("penalizes SFHA flood zone", () => {
    const clean = scoreVerdict(baseInputs({ flood: { sfha: false } }));
    const flooded = scoreVerdict(baseInputs({ flood: { sfha: true } }));
    expect(flooded.score).toBeLessThan(clean.score);
    expect(
      flooded.breakdown.some(
        (b) => b.key === "flood" && b.contribution < 0,
      ),
    ).toBe(true);
  });

  it("penalizes many nearby wildfires", () => {
    const clean = scoreVerdict(baseInputs({ wildfire: { nearbyFireCount: 0 } }));
    const fire = scoreVerdict(baseInputs({ wildfire: { nearbyFireCount: 10 } }));
    expect(fire.score).toBeLessThan(clean.score);
  });

  it("penalizes above-median state crime", () => {
    const low = scoreVerdict(
      baseInputs({ crime: { violentPer1k: 2, propertyPer1k: 10 } }),
    );
    const high = scoreVerdict(
      baseInputs({ crime: { violentPer1k: 8, propertyPer1k: 30 } }),
    );
    expect(high.score).toBeLessThan(low.score);
  });

  it("rewards a higher walk score", () => {
    const low = scoreVerdict(baseInputs({ walkScore: 20 }));
    const high = scoreVerdict(baseInputs({ walkScore: 90 }));
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("rewards a higher net-revenue / price ratio (cap-rate proxy)", () => {
    const thin = scoreVerdict(
      baseInputs({
        revenue: { netAnnualMedian: 15_000 },
        referencePrice: 500_000,
      }),
    );
    const thick = scoreVerdict(
      baseInputs({
        revenue: { netAnnualMedian: 40_000 },
        referencePrice: 500_000,
      }),
    );
    expect(thick.score).toBeGreaterThan(thin.score);
  });

  it("docks confidence for each missing major signal", () => {
    const sparse = scoreVerdict({
      regulatory: null,
      flood: null,
      wildfire: null,
      crime: null,
      walkScore: null,
      comps: { count: 0, medianNightlyRate: null },
      revenue: null,
      referencePrice: null,
      placeSentimentBullets: 0,
    });
    expect(sparse.confidence).toBeLessThanOrEqual(40);
    expect(sparse.confidence).toBeGreaterThanOrEqual(30);
  });

  it("clamps final score to [0, 100]", () => {
    // Construct worst-case: all penalties, no rewards.
    const result = scoreVerdict({
      regulatory: { strLegal: "no" },
      flood: { sfha: true },
      wildfire: { nearbyFireCount: 50 },
      crime: { violentPer1k: 20, propertyPer1k: 60 },
      walkScore: 0,
      comps: { count: 0, medianNightlyRate: null },
      revenue: null,
      referencePrice: null,
      placeSentimentBullets: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns a non-empty breakdown array for every call", () => {
    const result = scoreVerdict(baseInputs());
    expect(Array.isArray(result.breakdown)).toBe(true);
    expect(result.breakdown.length).toBeGreaterThan(0);
    for (const b of result.breakdown) {
      expect(b.key).toBeTruthy();
      expect(b.note).toBeTruthy();
      expect(typeof b.contribution).toBe("number");
    }
  });
});
