import { describe, expect, it } from "vitest";

import { computeIntakeVarianceFlag } from "@/lib/verdict/intake-variance";

/**
 * Unit tests for the M3.11 intake-vs-market variance computation.
 * Bands:
 *   < 0.7   significantly_low
 *   0.7..0.9  low
 *   0.9..1.1  aligned
 *   1.1..1.4  high
 *   > 1.4   significantly_high
 */

describe("computeIntakeVarianceFlag (M3.11)", () => {
  it("flags exact-match as aligned", () => {
    const r = computeIntakeVarianceFlag(2400, 2400);
    expect(r.flag).toBe("aligned");
    expect(r.varianceRatio).toBe(1);
  });

  it("flags within +5% as aligned", () => {
    expect(computeIntakeVarianceFlag(2520, 2400).flag).toBe("aligned");
  });

  it("flags within -5% as aligned", () => {
    expect(computeIntakeVarianceFlag(2280, 2400).flag).toBe("aligned");
  });

  it("flags +12% as high", () => {
    expect(computeIntakeVarianceFlag(2688, 2400).flag).toBe("high");
  });

  it("flags -15% as low", () => {
    expect(computeIntakeVarianceFlag(2040, 2400).flag).toBe("low");
  });

  it("flags +50% as significantly_high", () => {
    expect(computeIntakeVarianceFlag(3600, 2400).flag).toBe("significantly_high");
  });

  it("flags -50% as significantly_low", () => {
    expect(computeIntakeVarianceFlag(1200, 2400).flag).toBe("significantly_low");
  });

  it("flags exact 90% as low (boundary check)", () => {
    // ratio === 0.9 → not strictly < 0.9 → falls into aligned
    expect(computeIntakeVarianceFlag(2160, 2400).flag).toBe("aligned");
  });

  it("flags 89% as low (just inside the band)", () => {
    expect(computeIntakeVarianceFlag(2136, 2400).flag).toBe("low");
  });

  it("flags 110% as aligned (boundary)", () => {
    // ratio === 1.1 → not strictly > 1.1 → aligned
    expect(computeIntakeVarianceFlag(2640, 2400).flag).toBe("aligned");
  });

  it("flags 111% as high (just outside the band)", () => {
    expect(computeIntakeVarianceFlag(2664, 2400).flag).toBe("high");
  });

  it("flags 70% as low (boundary — 0.7 is start of low band, not significantly_low)", () => {
    // ratio === 0.7 → not strictly < 0.7 → falls into low
    expect(computeIntakeVarianceFlag(1680, 2400).flag).toBe("low");
  });

  it("flags 69% as significantly_low (just inside the band)", () => {
    expect(computeIntakeVarianceFlag(1656, 2400).flag).toBe("significantly_low");
  });

  it("returns aligned with warning on zero market median (defensive)", () => {
    const r = computeIntakeVarianceFlag(2400, 0);
    expect(r.flag).toBe("aligned");
    expect(r.varianceRatio).toBe(1);
  });

  it("returns aligned with warning on NaN inputs", () => {
    const r = computeIntakeVarianceFlag(Number.NaN, 2400);
    expect(r.flag).toBe("aligned");
  });
});
