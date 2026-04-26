import { describe, expect, it } from "vitest";

import {
  HAIKU_MODEL,
  routeVerdictNarrative,
  SONNET_MODEL,
  VERDICT_NARRATIVE_SONNET_THRESHOLD,
  getDefaultModel,
} from "../src/model-router";

describe("routeVerdictNarrative", () => {
  it("escalates to Sonnet below the confidence threshold", () => {
    const decision = routeVerdictNarrative(
      VERDICT_NARRATIVE_SONNET_THRESHOLD - 1,
    );
    expect(decision.model).toBe(SONNET_MODEL);
    expect(decision.reason).toBe("low_confidence_escalation");
  });

  it("stays on Haiku at the threshold (boundary inclusive on Haiku side)", () => {
    const decision = routeVerdictNarrative(
      VERDICT_NARRATIVE_SONNET_THRESHOLD,
    );
    expect(decision.model).toBe(HAIKU_MODEL);
    expect(decision.reason).toBe("default_haiku");
  });

  it("stays on Haiku for high-confidence verdicts", () => {
    const decision = routeVerdictNarrative(95);
    expect(decision.model).toBe(HAIKU_MODEL);
    expect(decision.reason).toBe("default_haiku");
  });

  it("uses Sonnet for very-low-confidence verdicts (5)", () => {
    const decision = routeVerdictNarrative(5);
    expect(decision.model).toBe(SONNET_MODEL);
  });
});

describe("getDefaultModel", () => {
  it("returns Haiku for every M3.0 task", () => {
    for (const task of [
      "regulatory-lookup",
      "place-sentiment",
      "scout-chat",
      "verdict-narrative",
    ] as const) {
      expect(getDefaultModel(task)).toBe(HAIKU_MODEL);
    }
  });
});
