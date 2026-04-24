import { describe, expect, it } from "vitest";

import { PlaceSentimentOutputSchema } from "../src/tasks/place-sentiment";

/**
 * Schema regression for the place-sentiment output envelope.
 * Separate from the fair-housing golden-file tests in
 * place-sentiment-fair-housing.test.ts.
 */

const goldenOutput = {
  bullets: [
    "Yelp users mention long waits at Prince's Hot Chicken (0.3mi) with 4.2★ avg over 1,400 reviews.",
    "Multiple reviews note limited street parking near Broadway, and frequent late-night noise from the honky-tonk strip.",
    "Google Places shows the Country Music Hall of Fame 1.2mi away averaging 4.6★ (8,000+ reviews).",
  ],
  summary:
    "Nearby dining scene averages 4.3★ across Yelp and Google; guest reviews consistently mention Broadway noise and tight street parking.",
  source_refs: [
    { source: "yelp" as const, name: "Prince's Hot Chicken" },
    { source: "google_places" as const, name: "Country Music Hall of Fame" },
  ],
};

describe("PlaceSentimentOutputSchema", () => {
  it("accepts a well-formed render_place_sentiment payload", () => {
    const result = PlaceSentimentOutputSchema.safeParse(goldenOutput);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal 1-bullet response (sparse area)", () => {
    const result = PlaceSentimentOutputSchema.safeParse({
      bullets: ["Very few Yelp or Google Places listings within 0.5mi — limited review coverage."],
      summary:
        "Rural-adjacent area with sparse commercial coverage in review data.",
      source_refs: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero bullets", () => {
    const bad = PlaceSentimentOutputSchema.safeParse({
      ...goldenOutput,
      bullets: [],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects more than 4 bullets", () => {
    const bad = PlaceSentimentOutputSchema.safeParse({
      ...goldenOutput,
      bullets: ["a", "b", "c", "d", "e"],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid source values", () => {
    const bad = PlaceSentimentOutputSchema.safeParse({
      ...goldenOutput,
      source_refs: [{ source: "nextdoor", name: "x" }],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects empty summary", () => {
    const bad = PlaceSentimentOutputSchema.safeParse({
      ...goldenOutput,
      summary: "",
    });
    expect(bad.success).toBe(false);
  });
});
