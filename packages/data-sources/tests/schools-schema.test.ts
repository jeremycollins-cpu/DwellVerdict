import { describe, expect, it } from "vitest";

import { SchoolsSignalSchema } from "../src/types";

/**
 * Pure schema tests for the M3.10 SchoolsSignal Zod type. Live
 * end-to-end LLM behavior is verified manually against production
 * — these tests pin the boundary conditions that callers depend on.
 */

const baseSignal = {
  city: "Roseville",
  state: "CA",
  elementarySchools: [
    { name: "Sargeant Elementary", rating: 8, type: "public" as const },
  ],
  middleSchools: [],
  highSchools: [
    { name: "Roseville High", rating: 7, type: "public" as const },
  ],
  districtSummary: "Roseville Joint Union HSD ranks above state average.",
  notableFactors: ["Recent open-enrollment growth"],
  dataQuality: "rich" as const,
  summary: "Roseville, CA median school ratings: Elementary 8.0/10 · High 7.0/10.",
  sourceUrl: "https://www.greatschools.org/search/search.page?q=Roseville%2C+CA",
};

describe("SchoolsSignalSchema (M3.10)", () => {
  it("accepts a well-formed signal with rich data", () => {
    const r = SchoolsSignalSchema.safeParse(baseSignal);
    expect(r.success).toBe(true);
  });

  it("accepts an unavailable-data signal with empty arrays", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      elementarySchools: [],
      middleSchools: [],
      highSchools: [],
      districtSummary: null,
      notableFactors: [],
      dataQuality: "unavailable",
      summary: "School quality data unavailable for Roseville, CA.",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a school rating > 10", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      elementarySchools: [{ name: "Bad", rating: 11 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a school rating < 1", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      elementarySchools: [{ name: "Bad", rating: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 5 schools per level", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      elementarySchools: Array.from({ length: 6 }, (_, i) => ({
        name: `School ${i}`,
      })),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown school type", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      elementarySchools: [
        { name: "Mystery", type: "unknown" as unknown as "public" },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a school entry with name only (no rating, no type)", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      elementarySchools: [{ name: "Just A Name" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a state code that isn't 2 chars", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      state: "California",
    });
    expect(r.success).toBe(false);
  });

  it("requires summary to be present (cards rely on it)", () => {
    const { summary: _summary, ...withoutSummary } = baseSignal;
    void _summary;
    const r = SchoolsSignalSchema.safeParse(withoutSummary);
    expect(r.success).toBe(false);
  });

  it("rejects an unknown dataQuality value", () => {
    const r = SchoolsSignalSchema.safeParse({
      ...baseSignal,
      dataQuality: "perfect" as unknown as "rich",
    });
    expect(r.success).toBe(false);
  });
});
