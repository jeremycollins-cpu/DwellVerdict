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

  // M3.7 fix-forward: bumped from 300 → 500 chars after Kings Beach
  // production verdict produced ~410-char regulatory summary (Placer
  // County permit complexity) and ~380-char location summary (real
  // walkability + amenities + flood + crime data) and got rejected.
  // The new ceiling has to comfortably accept those.
  it("accepts a per-domain summary up to 500 chars", () => {
    const summary450 = "x".repeat(450);
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        regulatory: { summary: summary450 },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a per-domain summary over 500 chars", () => {
    const summary501 = "x".repeat(501);
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        location: { summary: summary501 },
      },
    });
    expect(r.success).toBe(false);
  });

  // M3.10: optional school metrics on the location card. Schema-only
  // validation; thesis-aware emit rules live in the v3 prompt.
  it("accepts location metrics with school median ratings + notable schools", () => {
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        location: {
          summary: "Walk score 82, schools rate above state median.",
          metrics: {
            walk_score: 82,
            elementary_school_rating_median: 8.5,
            middle_school_rating_median: 7.0,
            high_school_rating_median: 8.0,
            notable_schools: [
              "Roseville High School",
              "Sargeant Elementary",
            ],
          },
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a school rating outside 1-10", () => {
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        location: {
          summary: "x",
          metrics: { elementary_school_rating_median: 11 },
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than 3 notable_schools", () => {
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        location: {
          summary: "x",
          metrics: {
            notable_schools: ["A", "B", "C", "D"],
          },
        },
      },
    });
    expect(r.success).toBe(false);
  });

  // M3.10 fix-forward — citation URLs accept either real URLs or
  // user-intake sentinels. The model emits sentinels when the
  // cited source is the user's intake form.
  it("accepts a citation with url='user-provided'", () => {
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        revenue: {
          summary: "Net STR ~$38K based on user-provided assumptions.",
          citations: [{ url: "user-provided", label: "Expected nightly rate" }],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a citation with url='intake-data'", () => {
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        regulatory: {
          summary: "Permitted per user intake.",
          citations: [{ url: "intake-data", label: "User intake" }],
        },
      },
    });
    expect(r.success).toBe(true);
  });

  it("still rejects an arbitrary non-URL string in citation url", () => {
    const r = VerdictNarrativeOutputSchema.safeParse({
      ...golden,
      data_points: {
        ...golden.data_points,
        regulatory: {
          summary: "Test.",
          // Sentinel literals are accepted; arbitrary strings still aren't.
          citations: [{ url: "not-a-url", label: "broken" }],
        },
      },
    });
    expect(r.success).toBe(false);
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
