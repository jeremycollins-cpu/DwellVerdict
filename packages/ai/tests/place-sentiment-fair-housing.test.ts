import { describe, expect, it } from "vitest";

import { PlaceSentimentOutputSchema } from "../src/tasks/place-sentiment";
import {
  containsFairHousingFlag,
  lintPlaceSentiment,
} from "../src/tasks/place-sentiment-lint";

/**
 * Fair-housing lint for place-sentiment output — deploy-blocking
 * per CLAUDE.md.
 *
 * The primary enforcement is the prompt's allow/deny lists. This
 * test locks in a pure offline-checker as defense-in-depth: if a
 * bad phrase ever slips through the prompt guardrails (e.g. the
 * LLM echoed a review verbatim that contained "family-friendly"),
 * we catch it before writing to DB. The orchestrator calls
 * lintPlaceSentiment on every LLM response and drops the bullet
 * + retries with a rewrite instruction on any flag.
 */

describe("containsFairHousingFlag", () => {
  it("flags 'family-friendly'", () => {
    expect(containsFairHousingFlag("This is a family-friendly area")).toMatchObject({
      reason: expect.stringContaining("familial status"),
    });
  });

  it("flags 'great schools'", () => {
    expect(containsFairHousingFlag("Great schools nearby")).toMatchObject({
      reason: expect.stringContaining("redlining"),
    });
  });

  it("flags 'safe neighborhood'", () => {
    expect(containsFairHousingFlag("Feels like a safe neighborhood")).not.toBeNull();
  });

  it("flags 'up-and-coming'", () => {
    expect(containsFairHousingFlag("An up-and-coming part of town")).not.toBeNull();
  });

  it("flags 'young professional'", () => {
    expect(
      containsFairHousingFlag("Popular with young professionals"),
    ).not.toBeNull();
  });

  it("flags 'upscale residents'", () => {
    expect(
      containsFairHousingFlag("Noted for upscale residents and shops"),
    ).not.toBeNull();
  });

  it("does NOT flag neutral place descriptions", () => {
    const clean = [
      "Yelp users mention long waits at Prince's Hot Chicken (0.3mi)",
      "14 restaurants within 0.5mi averaging 4.3 stars on Yelp",
      "Multiple reviews note late-night noise from the Broadway strip",
      "Weekly farmers market every Saturday per Google Places",
      "Construction noise on Demonbreun St mentioned in several reviews",
      "1.2mi from the Country Music Hall of Fame per Google Places",
    ];
    for (const s of clean) {
      expect(containsFairHousingFlag(s)).toBeNull();
    }
  });
});

describe("lintPlaceSentiment", () => {
  it("returns [] for a clean payload", () => {
    const clean = PlaceSentimentOutputSchema.parse({
      bullets: [
        "Yelp 4.3★ average across 14 restaurants in a 0.5mi radius",
        "Reviews mention heavy street noise around the Broadway honky-tonks",
        "1.2mi to the Country Music Hall of Fame per Google Places",
      ],
      summary:
        "Nearby dining scene is well-reviewed; guests frequently note late-night noise.",
      source_refs: [],
    });
    expect(lintPlaceSentiment(clean)).toEqual([]);
  });

  it("flags every offending bullet + summary separately", () => {
    const bad = PlaceSentimentOutputSchema.parse({
      bullets: [
        "Family-friendly neighborhood with nearby amenities",
        "Restaurants average 4.3★ on Yelp", // clean
        "Feels safer than surrounding areas per local reviews",
      ],
      summary: "Up-and-coming area with young professionals.",
      source_refs: [],
    });
    const flags = lintPlaceSentiment(bad);
    // Expect 1 summary + 2 offending bullets = 3 flags
    expect(flags.length).toBe(3);
    expect(flags.some((f) => f.location === "summary")).toBe(true);
    expect(flags.filter((f) => f.location === "bullet").length).toBe(2);
  });
});
