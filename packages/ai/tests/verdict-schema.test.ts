import { describe, expect, it } from "vitest";

import { VerdictOutputSchema } from "../src/tasks/verdict-generation";

/**
 * Schema-shape regression. The render_verdict tool's JSON Schema is
 * hand-kept in sync with the Zod schema; these tests lock the
 * application-side contract so a drift between the two gets caught
 * before any bad data hits the DB.
 */

const goldenOutput = {
  verdict: "watch" as const,
  confidence: 62,
  summary:
    "Revenue likely covers carrying cost with thin margin; regulatory status changed in 2025.",
  data_points: {
    comps: "7 Airbnb 2BRs within 1mi, median ADR $198, ~72% occupancy.",
    revenue: "$48-62K gross annual STR revenue (median case ~$54K).",
    regulatory: "STR legal with a permit; Nashville 2025 ordinance tightened non-owner-occupied caps.",
    location: "Walk Score 82, 1.2mi to Broadway, Davidson County flood zone X.",
  },
  narrative:
    "Comps support mid-$50K revenue. Regulatory risk is the main watch-out — " +
    "the 2025 ordinance tightened non-owner-occupied STR permits and renewal is " +
    "year-to-year. Carrying cost at current rates would leave a ~12% margin.\n\n" +
    "Key risk: another ordinance tightening in 2026 could cap or revoke the " +
    "permit. Monitor Metro Council agenda. No action needed today.",
  sources: [
    "https://www.airbnb.com/rooms/example-1",
    "https://library.municode.com/tn/nashville/codes/example",
  ],
};

describe("VerdictOutputSchema", () => {
  it("accepts a well-formed render_verdict payload", () => {
    const result = VerdictOutputSchema.safeParse(goldenOutput);
    expect(result.success).toBe(true);
  });

  it("rejects verdicts with confidence out of [0, 100]", () => {
    const bad = VerdictOutputSchema.safeParse({ ...goldenOutput, confidence: 120 });
    expect(bad.success).toBe(false);
  });

  it("rejects verdicts with non-integer confidence", () => {
    const bad = VerdictOutputSchema.safeParse({ ...goldenOutput, confidence: 62.5 });
    expect(bad.success).toBe(false);
  });

  it("rejects verdicts missing required data_points keys", () => {
    const bad = VerdictOutputSchema.safeParse({
      ...goldenOutput,
      data_points: { comps: "x", revenue: "x", regulatory: "x" }, // missing location
    });
    expect(bad.success).toBe(false);
  });

  it("rejects verdicts with fewer than 2 sources (fair-housing / transparency rule)", () => {
    const bad = VerdictOutputSchema.safeParse({
      ...goldenOutput,
      sources: ["https://example.com/only-one"],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects verdicts with invalid signal values", () => {
    const bad = VerdictOutputSchema.safeParse({ ...goldenOutput, verdict: "maybe" });
    expect(bad.success).toBe(false);
  });

  it("rejects non-URL strings in sources", () => {
    const bad = VerdictOutputSchema.safeParse({
      ...goldenOutput,
      sources: ["not-a-url", "https://example.com"],
    });
    expect(bad.success).toBe(false);
  });
});
