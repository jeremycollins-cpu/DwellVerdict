import { describe, expect, it } from "vitest";

import {
  CACHE_READ_DISCOUNT,
  CACHE_WRITE_MULTIPLIER,
  computeCostCents,
  MODEL_PRICING,
} from "../src/pricing";

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

  it("bills cache_read_input_tokens at the discounted rate", () => {
    // 100K cache reads at Haiku ($1/M) at 10% = $0.01 = 1 cent.
    const cents = computeCostCents({
      model: "claude-haiku-4-5",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 100_000,
    });
    expect(CACHE_READ_DISCOUNT).toBe(0.1);
    expect(cents).toBe(1);
  });

  it("bills cache_creation_input_tokens at the write premium", () => {
    // 100K cache writes at Haiku ($1/M) at 1.25x = $0.000125 per
    // token. 100K * 1 * 1.25 / 1M = $0.125 → rounds to 13.
    const cents = computeCostCents({
      model: "claude-haiku-4-5",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 100_000,
    });
    expect(CACHE_WRITE_MULTIPLIER).toBe(1.25);
    expect(cents).toBe(13);
  });

  it("treats input/cache_read/cache_creation as disjoint pools", () => {
    // Realistic cached Scout turn with Haiku ($1 in / $5 out per M):
    //   500 uncached input + 30K cached read + 400 output:
    //     500 * $1/M             = $0.0005
    //     30K * $1/M * 0.10      = $0.003
    //     400 * $5/M             = $0.002
    //     total                  = $0.0055 → 1 cent
    const cents = computeCostCents({
      model: "claude-haiku-4-5",
      inputTokens: 500,
      cacheReadInputTokens: 30_000,
      cacheCreationInputTokens: 0,
      outputTokens: 400,
    });
    expect(cents).toBe(1);
  });

  it("a cached call is strictly cheaper than the same volume uncached", () => {
    const cachedCents = computeCostCents({
      model: "claude-haiku-4-5",
      inputTokens: 500,
      cacheReadInputTokens: 30_000,
      outputTokens: 400,
    });
    const uncachedCents = computeCostCents({
      model: "claude-haiku-4-5",
      inputTokens: 30_500,
      outputTokens: 400,
    });
    expect(cachedCents).toBeLessThan(uncachedCents);
  });
});
