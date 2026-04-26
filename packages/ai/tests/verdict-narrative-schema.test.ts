import { describe, expect, it } from "vitest";

import { VerdictNarrativeOutputSchema } from "../src/tasks/verdict-narrative";
import { lintPlaceSentiment } from "../src/tasks/place-sentiment-lint";

/**
 * v2 (M3.3) golden — `data_points` is now structured per domain
 * with `summary` (required), `metrics` (optional), and `citations`
 * (optional).
 */
const golden = {
  narrative:
    "Nashville STR at 295 Bend Ave. Comp median ADR $198 across 12 nearby rentals, and Metro's current ordinance allows non-owner-occupied STRs with a permit — regulatory status is clear.\n\n" +
    "Revenue estimate lands at ~$54K gross on 65% occupancy, netting ~$38K after typical expenses. Zillow's Zestimate sits at $485K; that's a ~4.8% cap proxy, thinner than a BUY usually warrants but reasonable for this market.\n\n" +
    "What would change the verdict: comp ADR above $220 or list price under $450K. Until then, WATCH.",
  summary:
    "Nashville STR with clear regulatory green-light; revenue covers carrying cost with thin margin.",
  data_points: {
    comps: {
      summary:
        "12 Airbnb comps within 1mi, median ADR $198, median 241 reviews.",
      metrics: { count: 12, median_adr: 198, occupancy: 0.65 },
      citations: [
        { url: "https://airdna.co/market/tn-nashville", label: "AirDNA Nashville" },
      ],
    },
    revenue: {
      summary:
        "Gross STR ~$54K/yr on 65% occupancy; net ~$38K after 30% expenses.",
      metrics: { annual_estimate: 38000, cap_rate: 0.078 },
    },
    regulatory: {
      summary:
        "Metro Nashville allows non-owner-occupied STRs with a permit (ordinance BL2024-XXX).",
      metrics: { str_status: "permitted", registration_required: true },
      citations: [
        {
          url: "https://www.nashville.gov/short-term-rental",
          label: "Metro Nashville STR program",
        },
      ],
    },
    location: {
      summary: "Walk score 82, 1.2mi to Broadway; FEMA zone X (outside SFHA).",
      metrics: { walk_score: 82, flood_zone: "X", crime_rate_rank: "moderate" },
    },
  },
};

describe("VerdictNarrativeOutputSchema (v2)", () => {
  it("accepts a well-formed payload with structured per-domain evidence", () => {
    const result = VerdictNarrativeOutputSchema.safeParse(golden);
    expect(result.success).toBe(true);
  });

  it("accepts payloads where metrics + citations are omitted", () => {
    const minimal = {
      ...golden,
      data_points: {
        comps: { summary: "12 comps within 1mi, median ADR $198." },
        revenue: { summary: "Gross STR ~$54K/yr." },
        regulatory: { summary: "Permitted." },
        location: { summary: "Walk score 82." },
      },
    };
    const result = VerdictNarrativeOutputSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("rejects a too-short narrative", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      narrative: "Short.",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a missing data_points domain", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        comps: golden.data_points.comps,
        revenue: golden.data_points.revenue,
        regulatory: golden.data_points.regulatory,
        // missing location
      },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an empty summary", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      summary: "",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a domain object missing the required summary field", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        comps: { metrics: { count: 12 } } as unknown,
      },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects malformed citations (bad URL)", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        regulatory: {
          summary: "Permitted.",
          citations: [{ url: "not-a-url", label: "broken" }],
        },
      },
    });
    expect(bad.success).toBe(false);
  });

  it("rejects out-of-range metrics (occupancy > 1)", () => {
    const bad = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        comps: {
          summary: "x",
          metrics: { count: 12, median_adr: 198, occupancy: 1.5 },
        },
      },
    });
    expect(bad.success).toBe(false);
  });
});

describe("verdict-narrative fair-housing lint (v2 shape)", () => {
  it("passes a clean golden narrative", () => {
    const flags = lintPlaceSentiment({
      bullets: [
        golden.data_points.comps.summary,
        golden.data_points.revenue.summary,
        golden.data_points.regulatory.summary,
        golden.data_points.location.summary,
      ],
      summary: `${golden.summary}\n\n${golden.narrative}`,
    });
    expect(flags).toEqual([]);
  });

  it("flags a location summary that mentions 'great schools'", () => {
    const flags = lintPlaceSentiment({
      bullets: [
        golden.data_points.comps.summary,
        golden.data_points.revenue.summary,
        golden.data_points.regulatory.summary,
        "Walk score 82 and great schools nearby.",
      ],
      summary: `${golden.summary}\n\n${golden.narrative}`,
    });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0]?.location).toBe("bullet");
  });

  it("flags a top-level summary that calls an area 'family-friendly'", () => {
    const flags = lintPlaceSentiment({
      bullets: [
        golden.data_points.comps.summary,
        golden.data_points.revenue.summary,
        golden.data_points.regulatory.summary,
        golden.data_points.location.summary,
      ],
      summary: "Family-friendly Nashville STR with clear regulatory green-light.",
    });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0]?.location).toBe("summary");
  });
});
