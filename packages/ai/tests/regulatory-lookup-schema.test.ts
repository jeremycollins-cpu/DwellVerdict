import { describe, expect, it } from "vitest";

import { RegulatoryLookupOutputSchema } from "../src/tasks/regulatory-lookup";

/**
 * Schema regression for the regulatory lookup output.
 *
 * The fair-housing enforcement for this task lives in the prompt
 * (prompts/regulatory-lookup.v1.md) — it instructs the LLM to
 * talk about rules, not residents. The schema enforces shape
 * discipline: 2-4 source URLs, bounded summary length, enum
 * constraints on every categorical field.
 *
 * A separate golden-file test (regulatory-lookup-fair-housing.test.ts)
 * runs actual LLM calls against known-correct records for Nashville,
 * Scottsdale, Austin and blocks deploy on regression. That test
 * requires ANTHROPIC_API_KEY and is skipped in CI without one;
 * here we only validate the parser + output envelope.
 */

const goldenOutput = {
  str_legal: "restricted" as const,
  permit_required: "yes" as const,
  owner_occupied_only: "depends" as const,
  cap_on_non_oo:
    "Non-owner-occupied STRs capped at 3% of residential units per district.",
  renewal_frequency: "annual" as const,
  minimum_stay_days: null,
  summary:
    "Nashville allows STRs with a permit; non-owner-occupied operations are capped at ~3% of residential units per district per Metro ordinance BL2024-XXX.",
  sources: [
    "https://library.municode.com/tn/metro_government_of_nashville_and_davidson_county/codes/code_of_ordinances",
    "https://www.nashville.gov/departments/codes/short-term-rental-property",
  ],
};

describe("RegulatoryLookupOutputSchema", () => {
  it("accepts a well-formed render_regulatory payload", () => {
    const result = RegulatoryLookupOutputSchema.safeParse(goldenOutput);
    expect(result.success).toBe(true);
  });

  it("accepts all-null categorical fields (unclear city)", () => {
    const result = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      str_legal: null,
      permit_required: null,
      owner_occupied_only: null,
      cap_on_non_oo: null,
      renewal_frequency: null,
      minimum_stay_days: null,
      summary:
        "Could not determine STR regulatory status for this city from available sources. Recommend contacting the city directly.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty sources array", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      sources: [],
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a single source URL (small-jurisdiction case)", () => {
    const ok = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      sources: ["https://example.com/municipal-code/str"],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects more than 6 source URLs", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      sources: [
        "https://a.com/1",
        "https://a.com/2",
        "https://a.com/3",
        "https://a.com/4",
        "https://a.com/5",
        "https://a.com/6",
        "https://a.com/7",
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects non-URL strings in sources", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      sources: ["not-a-url", "https://example.com"],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects empty summary", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      summary: "",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid str_legal values", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      str_legal: "maybe",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid renewal_frequency values", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      renewal_frequency: "monthly",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts an integer minimum_stay_days", () => {
    const result = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      minimum_stay_days: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-integer minimum_stay_days", () => {
    const bad = RegulatoryLookupOutputSchema.safeParse({
      ...goldenOutput,
      minimum_stay_days: 30.5,
    });
    expect(bad.success).toBe(false);
  });
});
