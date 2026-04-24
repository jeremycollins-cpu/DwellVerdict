import { describe, expect, it } from "vitest";

import { VerdictNarrativeOutputSchema } from "../src/tasks/verdict-narrative";
import { lintPlaceSentiment } from "../src/tasks/place-sentiment-lint";

const golden = {
  narrative:
    "Nashville STR at 295 Bend Ave. Comp median ADR $198 across 12 nearby rentals, and Metro's current ordinance allows non-owner-occupied STRs with a permit — regulatory status is clear.\n\n" +
    "Revenue estimate lands at ~$54K gross on 65% occupancy, netting ~$38K after typical expenses. Zillow's Zestimate sits at $485K; that's a ~4.8% cap proxy, thinner than a BUY usually warrants but reasonable for this market.\n\n" +
    "What would change the verdict: comp ADR above $220 or list price under $450K. Until then, WATCH.",
  summary:
    "Nashville STR with clear regulatory green-light; revenue covers carrying cost with thin margin.",
  data_points: {
    comps: "12 Airbnb comps within 1mi, median ADR $198, median 241 reviews.",
    revenue: "Gross STR ~$54K/yr on 65% occupancy; net ~$38K after 30% expenses.",
    regulatory: "Metro Nashville allows non-owner-occupied STRs with a permit (ordinance BL2024-XXX).",
    location: "Walk score 82, 1.2mi to Broadway; FEMA zone X (outside SFHA).",
  },
};

describe("VerdictNarrativeOutputSchema", () => {
  it("accepts a well-formed payload", () => {
    const result = VerdictNarrativeOutputSchema.safeParse(golden);
    expect(result.success).toBe(true);
  });

  it("rejects a too-short narrative", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      narrative: "Short.",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a missing data_points key", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        comps: "x",
        revenue: "x",
        regulatory: "x",
        // missing location
      },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects empty summary", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      summary: "",
    });
    expect(bad.success).toBe(false);
  });
});

describe("verdict-narrative fair-housing lint (end-to-end shape)", () => {
  it("passes a clean golden narrative", () => {
    const flags = lintPlaceSentiment({
      bullets: [
        golden.data_points.comps,
        golden.data_points.revenue,
        golden.data_points.regulatory,
        golden.data_points.location,
      ],
      summary: `${golden.summary}\n\n${golden.narrative}`,
    });
    expect(flags).toEqual([]);
  });

  it("flags a narrative that mentions 'great schools'", () => {
    const flags = lintPlaceSentiment({
      bullets: [
        golden.data_points.comps,
        golden.data_points.revenue,
        golden.data_points.regulatory,
        "Walk score 82 and great schools nearby.",
      ],
      summary: `${golden.summary}\n\n${golden.narrative}`,
    });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0]?.location).toBe("bullet");
  });

  it("flags a summary that calls an area 'family-friendly'", () => {
    const flags = lintPlaceSentiment({
      bullets: [
        golden.data_points.comps,
        golden.data_points.revenue,
        golden.data_points.regulatory,
        golden.data_points.location,
      ],
      summary: "Family-friendly Nashville STR with clear regulatory green-light.",
    });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0]?.location).toBe("summary");
  });
});
