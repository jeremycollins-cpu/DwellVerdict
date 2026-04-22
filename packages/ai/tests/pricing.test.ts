import { describe, expect, it } from "vitest";

import { computeCostCents, MODEL_PRICING } from "../src/pricing";

describe("computeCostCents", () => {
  it("matches the Sonnet 4.6 pricing sheet for a realistic verdict call", () => {
    // A typical verdict: ~15K input tokens (prompt + interleaved
    // web_search results), ~3K output, 5 web searches.
    const cents = computeCostCents({
      model: "claude-sonnet-4-6",
      inputTokens: 15_000,
      outputTokens: 3_000,
      webSearchCount: 5,
    });
    // 15K * $3/M = $0.045, 3K * $15/M = $0.045, 5 * $0.01 = $0.05
    // total = $0.14 → 14 cents
    expect(cents).toBe(14);
  });

  it("rounds to the nearest cent", () => {
    const cents = computeCostCents({
      model: "claude-sonnet-4-6",
      inputTokens: 100,
      outputTokens: 100,
    });
    // 100 * $3/M + 100 * $15/M = $0.0003 + $0.0015 = $0.0018 → 0 cents
    expect(cents).toBe(0);
  });

  it("returns 0 for an unknown model rather than throwing", () => {
    const cents = computeCostCents({
      model: "claude-fake-9-9",
      inputTokens: 10_000,
      outputTokens: 10_000,
    });
    expect(cents).toBe(0);
  });

  it("has pricing entries for every Claude 4.x model the project might route to", () => {
    for (const model of ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"]) {
      expect(MODEL_PRICING[model]).toBeDefined();
      expect(MODEL_PRICING[model]!.inputUsdPerMillion).toBeGreaterThan(0);
      expect(MODEL_PRICING[model]!.outputUsdPerMillion).toBeGreaterThan(0);
    }
  });
});
