/**
 * Verdict scoring rubric per ADR-6.
 *
 * Deterministic TypeScript function over the structured signals we
 * collect. NOT AI. The LLM only gets called downstream to write the
 * narrative explaining whatever score this function produced.
 *
 * Output: numeric score 0-100, BUY/WATCH/PASS signal, confidence
 * 0-100 based on how complete the input data was.
 *
 * Weights (v1, tunable):
 *
 *   Regulatory STR legality  (25)  — biggest single factor.
 *                                    A "no" bottoms out the score.
 *   Revenue vs valuation     (20)  — can the property plausibly
 *                                    cover carrying cost? Proxied
 *                                    by net revenue / purchase
 *                                    price ratio (a rough cap rate).
 *   Comp data quality        (10)  — do we actually have enough
 *                                    comps to trust the revenue?
 *                                    Low count = lower confidence,
 *                                    not lower score directly.
 *   Walkability              (15)  — OSM walk score 0-100 scaled.
 *   Flood risk              (-10)  — penalty for SFHA flood zone.
 *   Wildfire risk           (-5)   — penalty for history within 5mi.
 *   Crime rate              (-10)  — penalty scaled to state/metro.
 *   Place-sentiment boost    (+5)  — small kicker if place-sentiment
 *                                    bullets are present (proxy
 *                                    for "at least there's stuff
 *                                    to do nearby").
 *
 * Confidence: starts at 100 and decrements for missing signals.
 * Each missing signal docks 10, clamped at 30.
 */

export type VerdictInputs = {
  regulatory: {
    strLegal: "yes" | "restricted" | "no" | "unclear" | null;
  } | null;
  flood: { sfha: boolean } | null;
  wildfire: { nearbyFireCount: number } | null;
  crime: { violentPer1k: number; propertyPer1k: number } | null;
  walkScore: number | null;
  comps: { count: number; medianNightlyRate: number | null };
  revenue: { netAnnualMedian: number } | null;
  /** Purchase price proxy — use list price if currently listed, else
   * estimate from Zillow/Redfin, else null. */
  referencePrice: number | null;
  placeSentimentBullets: number;
};

export type VerdictScore = {
  score: number; // 0-100
  signal: "buy" | "watch" | "pass";
  confidence: number; // 0-100
  /** Contribution breakdown so the UI + narrative can cite it. */
  breakdown: Array<{ key: string; contribution: number; note: string }>;
};

export function scoreVerdict(input: VerdictInputs): VerdictScore {
  const breakdown: VerdictScore["breakdown"] = [];
  let score = 50; // neutral baseline — data-rich signals push up/down

  // --- Regulatory ---
  const regLegal = input.regulatory?.strLegal;
  if (regLegal === "yes") {
    score += 25;
    breakdown.push({
      key: "regulatory",
      contribution: 25,
      note: "STR explicitly allowed.",
    });
  } else if (regLegal === "restricted") {
    score += 10;
    breakdown.push({
      key: "regulatory",
      contribution: 10,
      note: "STR allowed with meaningful restrictions.",
    });
  } else if (regLegal === "no") {
    score -= 40;
    breakdown.push({
      key: "regulatory",
      contribution: -40,
      note: "STR prohibited in residential zones — dealbreaker.",
    });
  } else if (regLegal === "unclear") {
    score -= 5;
    breakdown.push({
      key: "regulatory",
      contribution: -5,
      note: "STR status unclear — treat as watch-out.",
    });
  } else {
    breakdown.push({
      key: "regulatory",
      contribution: 0,
      note: "Regulatory data unavailable.",
    });
  }

  // --- Revenue vs price (rough cap rate proxy) ---
  if (input.revenue && input.referencePrice && input.referencePrice > 0) {
    const capRateProxy = input.revenue.netAnnualMedian / input.referencePrice;
    // 0-10% cap rate maps to 0-20 pts. 5% cap = 10 pts.
    const contribution = Math.min(20, Math.max(-5, capRateProxy * 200));
    const rounded = Math.round(contribution);
    score += rounded;
    breakdown.push({
      key: "revenue_vs_price",
      contribution: rounded,
      note: `Net revenue / reference price ≈ ${(capRateProxy * 100).toFixed(1)}%.`,
    });
  } else {
    breakdown.push({
      key: "revenue_vs_price",
      contribution: 0,
      note: "Missing revenue or reference price — not scored.",
    });
  }

  // --- Walkability ---
  if (input.walkScore != null) {
    // 0-100 walk score → -5 to +15 contribution
    const contribution = Math.round(-5 + (input.walkScore / 100) * 20);
    score += contribution;
    breakdown.push({
      key: "walkability",
      contribution,
      note: `Walk score ${input.walkScore}/100.`,
    });
  }

  // --- Flood ---
  if (input.flood) {
    if (input.flood.sfha) {
      score -= 10;
      breakdown.push({
        key: "flood",
        contribution: -10,
        note: "Inside FEMA Special Flood Hazard Area.",
      });
    } else {
      breakdown.push({
        key: "flood",
        contribution: 0,
        note: "Outside SFHA.",
      });
    }
  }

  // --- Wildfire ---
  if (input.wildfire) {
    if (input.wildfire.nearbyFireCount > 5) {
      score -= 5;
      breakdown.push({
        key: "wildfire",
        contribution: -5,
        note: `${input.wildfire.nearbyFireCount} wildfires within 5mi historically.`,
      });
    } else {
      breakdown.push({
        key: "wildfire",
        contribution: 0,
        note: "Low historical wildfire exposure.",
      });
    }
  }

  // --- Crime ---
  // v0: state-level FBI data only (city-level TBD). Benchmark a
  // rough US median: violent ~3.8/1k, property ~19/1k. Scale the
  // penalty so above-median states take a small hit.
  if (input.crime) {
    const violentAbove = Math.max(0, input.crime.violentPer1k - 3.8);
    const propertyAbove = Math.max(0, input.crime.propertyPer1k - 19);
    const contribution = -Math.min(
      10,
      Math.round(violentAbove + propertyAbove / 3),
    );
    if (contribution !== 0) {
      score += contribution;
      breakdown.push({
        key: "crime",
        contribution,
        note: `Above-median state crime (violent ${input.crime.violentPer1k.toFixed(1)}/1k).`,
      });
    } else {
      breakdown.push({
        key: "crime",
        contribution: 0,
        note: "State crime at or below US median.",
      });
    }
  }

  // --- Place sentiment kicker ---
  if (input.placeSentimentBullets >= 2) {
    score += 5;
    breakdown.push({
      key: "place_sentiment",
      contribution: 5,
      note: "Enough place-sentiment coverage to anchor the narrative.",
    });
  }

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Signal derivation.
  // Overrides: regulatory "no" forces PASS regardless of score.
  let signal: VerdictScore["signal"];
  if (regLegal === "no") {
    signal = "pass";
  } else if (score >= 70 && regLegal !== "unclear") {
    signal = "buy";
  } else if (score < 45) {
    signal = "pass";
  } else {
    signal = "watch";
  }

  // Confidence: docks 10 per missing major signal, clamped 30-100.
  const missing = [
    input.regulatory,
    input.flood,
    input.wildfire,
    input.crime,
    input.walkScore != null ? {} : null,
    input.revenue,
    input.referencePrice != null ? {} : null,
  ].filter((s) => s == null).length;
  const confidence = Math.max(30, 100 - missing * 10);

  return { score, signal, confidence, breakdown };
}
