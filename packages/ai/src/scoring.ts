/**
 * Verdict scoring rubric — thesis-aware as of M3.8.
 *
 * Deterministic TypeScript over the structured signals the
 * orchestrator collects. NOT AI. The narrative model only writes
 * prose explaining whatever the rubric here decided.
 *
 * Pre-M3.8 the rubric assumed every property was an STR; weights
 * were hardcoded and didn't surface for non-rental theses (the
 * UI showed walk-score and STR-permit lines on owner-occupied
 * verdicts, which never matched what the buyer cared about).
 *
 * M3.8 introduces:
 *   1. A 2D rubric weight table keyed on thesis_type. Each thesis
 *      has its own per-rule weights summing to ~100. Rules with
 *      weight 0 for that thesis are skipped entirely (no breakdown
 *      entry).
 *   2. New rules — `livability_score`, `appreciation_potential`,
 *      `arv_margin`, `schools_quality`, `rental_comp_alignment` —
 *      that didn't make sense in an STR-only world.
 *   3. Regional risk multipliers (CA wildfire 1.5×, FL flood 1.5×,
 *      Gulf Coast hurricane proxy, etc.) layered on top of base
 *      thesis weights at the call site.
 *   4. Each breakdown entry now carries `category` (rental /
 *      location / regulatory / market / risk) so the UI can group
 *      rather than emit a flat list.
 *
 * Pre-M3.8 verdicts use the legacy breakdown shape (no `category`,
 * no `weight`, no `multiplier`). The verdict-detail UI distinguishes
 * by checking whether any entry has a `category` field; legacy
 * verdicts get a "Regenerate for thesis-aware analysis" banner.
 */

export type ThesisType =
  | "str"
  | "ltr"
  | "owner_occupied"
  | "house_hacking"
  | "flipping"
  | "other";

export type GoalType =
  | "cap_rate"
  | "appreciation"
  | "both"
  | "lifestyle"
  | "flip_profit";

/** M3.8 breakdown row category. UI groups rows by these. */
export type RuleCategory =
  | "rental_fundamentals"
  | "location"
  | "regulatory"
  | "market"
  | "risk";

export type BreakdownEntry = {
  key: string;
  category: RuleCategory;
  contribution: number;
  /** The rule's max-magnitude weight under the active thesis +
   *  any regional multiplier. The UI surfaces this so users can
   *  see which signals were weighted heavily for their thesis. */
  weight: number;
  /** Regional multiplier that was applied (e.g. 1.5 for CA wildfire),
   *  or null when no override fired. */
  multiplier: number | null;
  note: string;
};

export type VerdictInputs = {
  /** M3.8: thesis drives rubric weight selection. Defaults to 'str'
   *  when null (matches pre-M3.5 verdicts where every property was
   *  treated as STR). */
  thesisType: ThesisType | null;
  /** M3.8: goal subtly tunes weights (cap_rate vs appreciation). */
  goalType: GoalType | null;
  /** Two-letter US state code; drives regional risk overrides. */
  state: string | null;

  // Existing rule inputs ------------------------------------------------

  /** Pre-M3.13 shape. STR thesis only (other theses populate
   *  `regulatorySignal` below with thesis-specific structured
   *  fields). The orchestrator passes whichever is appropriate. */
  regulatory: {
    strLegal: "yes" | "restricted" | "no" | "unclear" | null;
  } | null;
  flood: { sfha: boolean } | null;
  wildfire: { nearbyFireCount: number } | null;
  crime: { violentPer1k: number; propertyPer1k: number } | null;
  walkScore: number | null;
  comps: { count: number; medianNightlyRate: number | null };
  revenue: { netAnnualMedian: number } | null;
  /** Purchase-price proxy — user offer > listing > estimate >
   *  Zillow/Redfin scrape > null. Set at the orchestrator boundary. */
  referencePrice: number | null;
  placeSentimentBullets: number;

  // M3.8 new rule inputs -----------------------------------------------

  /** M3.10 schools signal — used for livability + schools_quality +
   *  appreciation_potential rules across LTR/OO/HH/flipping theses. */
  schools: {
    medianElementaryRating: number | null;
    medianMiddleRating: number | null;
    medianHighRating: number | null;
    dataQuality: "rich" | "partial" | "unavailable";
  } | null;

  /** M3.13 thesis-specific regulatory signals. The STR thesis uses
   *  `regulatory.strLegal` above; non-STR theses provide their
   *  thesis-relevant fields here so scoring can react to LTR rent
   *  control, HH ADU illegality, etc. */
  regulatoryThesis:
    | { thesisDimension: "ltr"; rentControl: string | null; evictionFriendliness: string | null }
    | { thesisDimension: "owner_occupied"; homesteadExemption: string | null; specialAssessmentsCommon: string | null }
    | { thesisDimension: "house_hacking"; aduLegal: string | null; ownerOccupiedStrCarveout: string | null }
    | { thesisDimension: "flipping"; flipperSurtax: string | null; historicDistrictRisk: string | null }
    | null;

  /** M3.11 rental comp alignment. Variance flag from
   *  computeIntakeVarianceFlag — surfaces a small score delta when
   *  user's intake materially diverges from market. */
  rentalCompVariance:
    | "aligned"
    | "low"
    | "high"
    | "significantly_low"
    | "significantly_high"
    | null;

  /** M3.8 / M3.12 placeholder. ARV and renovation budget for the
   *  flipping arv_margin rule. ARV signal lands properly in M3.12;
   *  for v1 we expose the input slot so flipping verdicts emit a
   *  "ARV signal pending" breakdown entry rather than no margin
   *  signal at all. */
  arvEstimateCents: number | null;
  renovationBudgetCents: number | null;
  userOfferCents: number | null;

  /** M3.8 demographics signal for appreciation rule. Census 5-year
   *  income change as a percent (positive = growing tract). */
  incomeChange5y: number | null;

  /** M3.12 sales comp signal — populated when the orchestrator's
   *  sales-comps fetcher returned `rich` or `partial` data. The
   *  appreciation_potential rule prefers these inputs over the
   *  schools/walk/income proxies it falls back to when sales comp
   *  data is missing. */
  salesComps: {
    medianCompPriceCents: number;
    estimatedArvCents: number;
    arvConfidence: "high" | "moderate" | "low";
    medianDaysOnMarket: number;
    marketVelocity: "fast" | "moderate" | "slow";
    /** 0..1 share of comps from the last 6 months. Higher = more
     *  recent recall and a stronger basis for appreciation
     *  inference. */
    recentCompShare: number;
    dataQuality: "rich" | "partial" | "unavailable";
  } | null;

  /** M3.12 market velocity trend. Independent signal from the
   *  per-property sales comps; pulls from the city-level market-
   *  velocity fetcher. */
  marketVelocityTrend:
    | "accelerating"
    | "stable"
    | "decelerating"
    | null;

  /** M3.12 offer-price variance flag — the orchestrator computes
   *  this from user's intake offer/listing/estimated price vs the
   *  comp-derived median. Same band semantics as
   *  rentalCompVariance (M3.11). */
  offerPriceVariance:
    | "aligned"
    | "low"
    | "high"
    | "significantly_low"
    | "significantly_high"
    | null;
};

export type VerdictScore = {
  score: number; // 0-100
  signal: "buy" | "watch" | "pass";
  confidence: number; // 0-100
  breakdown: BreakdownEntry[];
};

// ============================================================
// Rubric weight table — sums to ~100 per thesis.
// ============================================================

type RubricWeights = {
  // Existing rules
  regulatory_str: number;
  cap_rate_vs_price: number;
  walkability: number;
  flood: number;
  wildfire: number;
  crime: number;
  place_sentiment: number;

  // M3.8 new rules
  livability_score: number;
  appreciation_potential: number;
  arv_margin: number;
  schools_quality: number;
  rental_comp_alignment: number;
  regulatory_thesis: number; // Non-STR thesis-specific regulatory
  // M3.12 — user-offer-price vs comp-derived median alignment.
  // Mirrors rental_comp_alignment but for sales comps.
  offer_price_alignment: number;
};

/**
 * Per-thesis rubric weights. Tuned to make verdicts on different
 * theses produce meaningfully different signals. Weights are
 * tunable; this is v1 calibration.
 *
 * Total per thesis ≈ 100 (small over/under is fine — final score
 * is clamped 0..100 anyway).
 */
const RUBRIC_WEIGHTS: Record<ThesisType, RubricWeights> = {
  str: {
    regulatory_str: 25, // dealbreaker rule
    cap_rate_vs_price: 25, // STR cap rate matters
    walkability: 5, // vacation guests don't walk much
    flood: 10,
    wildfire: 15, // insurance + cancellation risk
    crime: 8, // guests rarely read crime stats
    place_sentiment: 10,
    livability_score: 0, // OO-shaped concept
    appreciation_potential: 5,
    arv_margin: 0,
    schools_quality: 0, // STR exception (M3.10 correction)
    rental_comp_alignment: 7, // M3.11 STR variance check
    regulatory_thesis: 0, // STR uses regulatory_str above
    offer_price_alignment: 0, // STR skips sales comps
  },
  ltr: {
    regulatory_str: 0, // STR-specific; not LTR
    cap_rate_vs_price: 22, // LTR cash flow matters
    walkability: 8,
    flood: 10,
    wildfire: 10,
    crime: 15, // tenant retention + family safety
    place_sentiment: 8,
    livability_score: 0, // owner doesn't live here
    appreciation_potential: 5,
    arv_margin: 0,
    schools_quality: 15, // critical for family renters
    rental_comp_alignment: 5,
    regulatory_thesis: 12, // tenant rights / rent control matter
    offer_price_alignment: 5, // matters but rental cash flow dominates
  },
  owner_occupied: {
    regulatory_str: 0,
    cap_rate_vs_price: 0, // no rental income
    walkability: 10,
    flood: 12,
    wildfire: 12,
    crime: 18, // critical for personal safety
    place_sentiment: 10,
    livability_score: 18, // composite owner quality-of-life
    appreciation_potential: 12,
    arv_margin: 0,
    schools_quality: 15, // critical for owner-occupants
    rental_comp_alignment: 0,
    regulatory_thesis: 5, // HOA / property-tax less binary
    offer_price_alignment: 8, // OO buyers care about overpaying
  },
  house_hacking: {
    regulatory_str: 0,
    cap_rate_vs_price: 18, // rented portion is rental
    walkability: 8,
    flood: 10,
    wildfire: 10,
    crime: 12,
    place_sentiment: 8,
    livability_score: 8, // owner lives in part
    appreciation_potential: 5,
    arv_margin: 0,
    schools_quality: 10, // owner family OR LTR family in unit
    rental_comp_alignment: 3,
    regulatory_thesis: 18, // ADU / multi-unit zoning critical
    offer_price_alignment: 5,
  },
  flipping: {
    regulatory_str: 0,
    cap_rate_vs_price: 0, // no rental income; short hold
    walkability: 5, // resale-buyer signal
    flood: 10,
    wildfire: 5,
    crime: 8,
    place_sentiment: 5,
    livability_score: 0,
    appreciation_potential: 0, // short hold; ARV is the signal
    arv_margin: 35, // the whole thesis
    schools_quality: 12, // resale value driver (M3.10 correction)
    rental_comp_alignment: 0,
    regulatory_thesis: 12, // permit complexity / surtaxes
    offer_price_alignment: 10, // overpaying kills flip margin directly
  },
  other: {
    // Default = STR rubric (most "other" descriptions are some
    // form of unconventional rental). Users can pivot via thesis
    // edit if this is wrong for their case.
    regulatory_str: 25,
    cap_rate_vs_price: 25,
    walkability: 5,
    flood: 10,
    wildfire: 15,
    crime: 8,
    place_sentiment: 10,
    livability_score: 0,
    appreciation_potential: 5,
    arv_margin: 0,
    schools_quality: 0,
    rental_comp_alignment: 7,
    regulatory_thesis: 0,
    offer_price_alignment: 0,
  },
};

/** Goal-driven weight nudges — applied after thesis weights, before
 *  regional overrides. Subtle; tunable. */
function applyGoalNudge(
  weights: RubricWeights,
  goal: GoalType | null,
): RubricWeights {
  if (goal == null) return weights;
  const w = { ...weights };
  switch (goal) {
    case "cap_rate":
      w.cap_rate_vs_price = w.cap_rate_vs_price > 0 ? w.cap_rate_vs_price + 3 : 0;
      w.appreciation_potential = Math.max(0, w.appreciation_potential - 2);
      break;
    case "appreciation":
      w.appreciation_potential = w.appreciation_potential + 4;
      w.cap_rate_vs_price = Math.max(0, w.cap_rate_vs_price - 2);
      break;
    case "lifestyle":
      w.livability_score = w.livability_score + 4;
      w.cap_rate_vs_price = Math.max(0, w.cap_rate_vs_price - 2);
      break;
    case "flip_profit":
      w.arv_margin = w.arv_margin + 5;
      break;
    case "both":
      // No nudge — keep base balance
      break;
  }
  return w;
}

// ============================================================
// Regional risk overrides
// ============================================================

type RegionalRiskOverride = {
  wildfire?: number;
  flood?: number;
};

/**
 * Multipliers applied to the base wildfire/flood weights for
 * properties in known-risk regions. Hurricane risk is folded into
 * the flood multiplier (Gulf states get an elevated flood weight
 * even outside an SFHA, since hurricanes flood blocks no FEMA map
 * predicts). Tornado / wind risk is not modeled here — insurance
 * cost factor would be the right channel and we don't have that
 * signal yet.
 */
export function getRegionalRiskOverride(
  state: string | null,
): RegionalRiskOverride {
  if (!state) return {};
  const s = state.toUpperCase();
  if (s === "CA") return { wildfire: 1.5 };
  if (s === "FL") return { flood: 1.5 };
  if (["TX", "LA", "AL", "MS"].includes(s)) return { flood: 1.3 };
  if (["CO", "UT", "MT", "ID"].includes(s)) return { wildfire: 1.2 };
  if (["WA", "OR"].includes(s)) return { wildfire: 1.1 };
  return {};
}

function applyRegionalOverrides(
  weights: RubricWeights,
  override: RegionalRiskOverride,
): RubricWeights {
  return {
    ...weights,
    wildfire: Math.round(weights.wildfire * (override.wildfire ?? 1)),
    flood: Math.round(weights.flood * (override.flood ?? 1)),
  };
}

// ============================================================
// Helpers
// ============================================================

// ============================================================
// Rule implementations
// ============================================================

/**
 * STR regulatory rule (preserved from pre-M3.8). Maps strLegal to
 * a fraction of the weight; "no" returns < -1 to encode the
 * dealbreaker. PASS-override is handled separately at the signal
 * derivation step.
 */
function ruleRegulatoryStr(
  weight: number,
  strLegal: VerdictInputs["regulatory"] extends infer R ? R extends { strLegal: infer S } ? S : null : null,
): { contribution: number; note: string } | null {
  switch (strLegal) {
    case "yes":
      return { contribution: weight, note: "STR explicitly allowed." };
    case "restricted":
      return {
        contribution: Math.round(weight * 0.4),
        note: "STR allowed with meaningful restrictions.",
      };
    case "no":
      return {
        contribution: -Math.round(weight * 1.6),
        note: "STR prohibited in residential zones — dealbreaker.",
      };
    case "unclear":
      return {
        contribution: -Math.round(weight * 0.2),
        note: "STR status unclear — treat as watch-out.",
      };
    default:
      return null;
  }
}

/**
 * Cap rate proxy rule. 0..10% maps to 0..weight. Below 0% (negative
 * net) gets a small penalty; above 10% caps at full weight.
 */
function ruleCapRate(
  weight: number,
  revenue: { netAnnualMedian: number } | null,
  referencePrice: number | null,
): { contribution: number; note: string } | null {
  if (!revenue || !referencePrice || referencePrice <= 0) return null;
  const capRateProxy = revenue.netAnnualMedian / referencePrice;
  // Pre-M3.8 mapping: cap rate × 200 within [-5, +20]. Generalized
  // here so weight-25 thesis matches old behavior exactly.
  const fraction = Math.min(1, Math.max(-0.2, capRateProxy * (200 / 25)));
  return {
    contribution: Math.round(fraction * weight),
    note: `Net revenue / reference price ≈ ${(capRateProxy * 100).toFixed(1)}%.`,
  };
}

/** Walkability: 0..100 scaled to fraction of weight, slight penalty
 *  for very low walkability (linear from -0.25 to +1). */
function ruleWalkability(
  weight: number,
  walkScore: number | null,
): { contribution: number; note: string } | null {
  if (walkScore == null) return null;
  const fraction = -0.25 + (walkScore / 100) * 1.25;
  return {
    contribution: Math.round(fraction * weight),
    note: `Walk score ${walkScore}/100.`,
  };
}

/** Flood (SFHA binary penalty). */
function ruleFlood(
  weight: number,
  flood: { sfha: boolean } | null,
): { contribution: number; note: string } | null {
  if (!flood) return null;
  if (flood.sfha) {
    return {
      contribution: -weight,
      note: "Inside FEMA Special Flood Hazard Area.",
    };
  }
  return { contribution: 0, note: "Outside SFHA." };
}

/** Wildfire — ramps with nearby fire count, capped at full negative weight. */
function ruleWildfire(
  weight: number,
  wildfire: { nearbyFireCount: number } | null,
): { contribution: number; note: string } | null {
  if (!wildfire) return null;
  // 0 fires → 0 penalty; 5+ fires → full negative weight.
  const ratio = Math.min(1, wildfire.nearbyFireCount / 5);
  if (ratio === 0)
    return { contribution: 0, note: "Low historical wildfire exposure." };
  return {
    contribution: -Math.round(ratio * weight),
    note: `${wildfire.nearbyFireCount} wildfires within 5mi historically.`,
  };
}

/** Crime — penalty scaled to FBI per-1k-residents above US median. */
function ruleCrime(
  weight: number,
  crime: { violentPer1k: number; propertyPer1k: number } | null,
): { contribution: number; note: string } | null {
  if (!crime) return null;
  const violentAbove = Math.max(0, crime.violentPer1k - 3.8);
  const propertyAbove = Math.max(0, crime.propertyPer1k - 19);
  const rawDelta = violentAbove + propertyAbove / 3;
  // 0 → 0 penalty; 10+ → full weight penalty. Pre-M3.8 scaled to a
  // hardcoded -10 cap; weight-aware version preserves that for STR
  // where weight=8 still yields a meaningful penalty range.
  const ratio = Math.min(1, rawDelta / 10);
  if (ratio === 0)
    return { contribution: 0, note: "State crime at or below US median." };
  return {
    contribution: -Math.round(ratio * weight),
    note: `Above-median state crime (violent ${crime.violentPer1k.toFixed(1)}/1k).`,
  };
}

/** Place-sentiment kicker. Boolean reward for having ≥2 bullets. */
function rulePlaceSentiment(
  weight: number,
  bullets: number,
): { contribution: number; note: string } | null {
  if (bullets >= 2) {
    return {
      contribution: Math.round(weight * 0.5),
      note: "Place-sentiment coverage anchors the narrative.",
    };
  }
  return null;
}

/** Schools quality — independent rule. Median high-school rating
 *  on 1-10 scale → fraction of weight (5/10 = neutral). */
function ruleSchoolsQuality(
  weight: number,
  schools: VerdictInputs["schools"],
): { contribution: number; note: string } | null {
  if (!schools || schools.dataQuality === "unavailable") return null;
  const high = schools.medianHighRating;
  if (high == null) return null;
  // 5/10 = 0; 10/10 = +weight; 1/10 = -weight*0.8
  const fraction = (high - 5) / 5;
  return {
    contribution: Math.round(fraction * weight),
    note: `Median high school rating ${high.toFixed(1)}/10.`,
  };
}

/** Livability composite (OO + HH theses): walkability + crime +
 *  schools blended into a single 0-100 livability index. */
function ruleLivability(
  weight: number,
  walkScore: number | null,
  crime: { violentPer1k: number; propertyPer1k: number } | null,
  schools: VerdictInputs["schools"],
): { contribution: number; note: string } | null {
  // Need at least one input; missing inputs reduce confidence but
  // the rule still fires on partials.
  const components: Array<{ value: number; weight: number; label: string }> = [];

  if (walkScore != null) {
    components.push({ value: walkScore, weight: 0.3, label: `walk ${walkScore}` });
  }
  if (crime) {
    const violentAbove = Math.max(0, crime.violentPer1k - 3.8);
    const propertyAbove = Math.max(0, crime.propertyPer1k - 19);
    const crimePenalty = Math.min(100, (violentAbove + propertyAbove / 3) * 10);
    const crimeIndex = 100 - crimePenalty; // higher = safer
    components.push({
      value: crimeIndex,
      weight: 0.3,
      label: `crime index ${Math.round(crimeIndex)}`,
    });
  }
  const high = schools?.medianHighRating ?? null;
  if (high != null && schools?.dataQuality !== "unavailable") {
    components.push({
      value: high * 10,
      weight: 0.4,
      label: `schools ${high.toFixed(1)}/10`,
    });
  }

  if (components.length === 0) return null;

  const totalW = components.reduce((s, c) => s + c.weight, 0);
  const livability =
    components.reduce((s, c) => s + c.value * c.weight, 0) / totalW;
  // 50 = neutral; 100 = full positive weight; 0 = full negative weight.
  const fraction = (livability - 50) / 50;
  return {
    contribution: Math.round(fraction * weight),
    note: `Livability ${Math.round(livability)}/100 (${components.map((c) => c.label).join(", ")}).`,
  };
}

/**
 * Appreciation potential. M3.12 prefers sales-comp + market-velocity
 * data when available; falls back to the M3.8 schools/walk/income
 * proxies otherwise.
 *
 * Sales-comp-driven path centers on:
 *   - market velocity classification (`fast` / `moderate` / `slow`)
 *   - market-velocity trend (`accelerating` / `stable` /
 *     `decelerating` from the city-level fetcher)
 *   - recent-comp share (>50% of comps from last 6mo = strong
 *     recency signal, supports confidence)
 *
 * The school-rating component is retained as a tertiary input
 * because schools influence resale demand even when market velocity
 * dominates the short-term picture.
 */
function ruleAppreciation(
  weight: number,
  schools: VerdictInputs["schools"],
  walkScore: number | null,
  incomeChange5y: number | null,
  salesComps: VerdictInputs["salesComps"],
  marketVelocityTrend: VerdictInputs["marketVelocityTrend"],
): { contribution: number; note: string } | null {
  // Sales-comp-driven path — primary when rich/partial data is
  // available.
  if (salesComps && salesComps.dataQuality !== "unavailable") {
    const velocityScore =
      salesComps.marketVelocity === "fast"
        ? 80
        : salesComps.marketVelocity === "moderate"
          ? 50
          : 25;
    const trendScore =
      marketVelocityTrend === "accelerating"
        ? 80
        : marketVelocityTrend === "stable"
          ? 50
          : marketVelocityTrend === "decelerating"
            ? 20
            : 50; // Trend missing → neutral
    const recencyScore = salesComps.recentCompShare * 100;
    const high = schools?.medianHighRating ?? null;
    const schoolScore =
      high != null && schools?.dataQuality !== "unavailable"
        ? high * 10
        : 50;
    // Weighted blend: market velocity 40%, trend 25%, recency 15%,
    // schools 20%. Velocity dominates the short-term appreciation
    // call; schools are the long-tail resale-demand input.
    const index =
      velocityScore * 0.4 +
      trendScore * 0.25 +
      recencyScore * 0.15 +
      schoolScore * 0.2;
    const fraction = (index - 50) / 50;
    const recentPct = Math.round(salesComps.recentCompShare * 100);
    return {
      contribution: Math.round(fraction * weight),
      note: `Appreciation: market ${salesComps.marketVelocity} (${marketVelocityTrend ?? "trend unknown"}); ${recentPct}% recent comps; schools ${high != null ? `${high.toFixed(1)}/10` : "n/a"}.`,
    };
  }

  // Proxy fallback — pre-M3.12 path.
  const parts: Array<{ value: number; weight: number; label: string }> = [];
  const high = schools?.medianHighRating ?? null;
  if (high != null && schools?.dataQuality !== "unavailable") {
    parts.push({ value: (high - 5) * 20, weight: 0.4, label: `schools ${high.toFixed(1)}/10` });
  }
  if (walkScore != null) {
    parts.push({ value: walkScore - 50, weight: 0.3, label: `walk ${walkScore}` });
  }
  if (incomeChange5y != null) {
    parts.push({
      value: Math.max(-50, Math.min(50, (incomeChange5y - 10) * 5)),
      weight: 0.3,
      label: `income +${incomeChange5y.toFixed(1)}% / 5yr`,
    });
  }
  if (parts.length === 0) return null;
  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  const indexCentered = parts.reduce((s, p) => s + p.value * p.weight, 0) / totalW;
  const fraction = Math.max(-1, Math.min(1, indexCentered / 50));
  return {
    contribution: Math.round(fraction * weight),
    note: `Appreciation indicators (proxy fallback): ${parts.map((p) => p.label).join(", ")}.`,
  };
}

/**
 * ARV margin (flipping). M3.12 wires this up with real ARV data
 * (intake-supplied or comp-derived from sales-comps fetcher). The
 * "ARV signal pending" placeholder applies only when ARV is null
 * AND the comp lookup wasn't able to provide one.
 */
function ruleArvMargin(
  weight: number,
  arvCents: number | null,
  userOfferCents: number | null,
  renovationBudgetCents: number | null,
  arvConfidence: "high" | "moderate" | "low" | null,
): { contribution: number; note: string } | null {
  if (!arvCents || !userOfferCents || userOfferCents <= 0) {
    return {
      contribution: 0,
      note: "ARV margin requires both an ARV estimate and a user offer / reference price.",
    };
  }
  const reno = renovationBudgetCents ?? 0;
  const holding = Math.round(userOfferCents * 0.05); // ~5% rough 6mo carry
  const margin = (arvCents - userOfferCents - reno - holding) / userOfferCents;
  // 20% margin = full weight; 0% = neutral; -10% = full negative.
  const fraction = Math.max(-1, Math.min(1, margin / 0.2));
  const confidenceLabel = arvConfidence ? ` (${arvConfidence} ARV confidence)` : "";
  return {
    contribution: Math.round(fraction * weight),
    note: `Estimated flip margin ${(margin * 100).toFixed(1)}% (ARV $${formatThousands(arvCents / 100)}${confidenceLabel}).`,
  };
}

/** Rental-comp alignment (M3.11 variance flag). */
function ruleRentalCompAlignment(
  weight: number,
  flag: VerdictInputs["rentalCompVariance"],
): { contribution: number; note: string } | null {
  if (!flag) return null;
  switch (flag) {
    case "aligned":
      return { contribution: weight, note: "Intake aligns with market median." };
    case "low":
      return {
        contribution: Math.round(weight * 0.2),
        note: "Intake slightly below market — conservative is fine.",
      };
    case "high":
      return {
        contribution: -Math.round(weight * 0.4),
        note: "Intake above market — verify before underwriting.",
      };
    case "significantly_low":
      return {
        contribution: -Math.round(weight * 0.4),
        note: "Intake significantly below market — possible pricing error.",
      };
    case "significantly_high":
      return {
        contribution: -weight,
        note: "Intake significantly above market — likely overestimate; re-verify.",
      };
  }
}

/**
 * M3.12 — offer-price alignment vs comp-derived median.
 *
 * Mirrors `ruleRentalCompAlignment` (M3.11) but for the sales-side
 * variance: penalize when the user's offer is materially above
 * comp median (overpaying), reward when significantly below
 * (acquisition discount). The orchestrator computes the variance
 * flag from `userOfferPriceCents ?? listingPriceCents ??
 * estimatedValueCents` against `salesComps.medianCompPriceCents`.
 */
function ruleOfferPriceAlignment(
  weight: number,
  flag: VerdictInputs["offerPriceVariance"],
): { contribution: number; note: string } | null {
  if (!flag) return null;
  switch (flag) {
    case "aligned":
      return {
        contribution: Math.round(weight * 0.5),
        note: "Offer aligns with comp-derived median sale price.",
      };
    case "low":
      return {
        contribution: Math.round(weight * 0.7),
        note: "Offer slightly below market — modest acquisition discount.",
      };
    case "high":
      return {
        contribution: -Math.round(weight * 0.4),
        note: "Offer above market — verify the premium is justified.",
      };
    case "significantly_low":
      return {
        contribution: weight,
        note: "Offer significantly below market — strong acquisition price (verify property condition).",
      };
    case "significantly_high":
      return {
        contribution: -weight,
        note: "Offer significantly above market — likely overpaying; re-verify against comps.",
      };
  }
}

/** Thesis-aware regulatory rule (LTR / OO / HH / flipping). Most
 *  cases are informational; only rare structural blockers (e.g.
 *  HH with ADUs banned) trigger a strong negative. */
function ruleRegulatoryThesis(
  weight: number,
  reg: VerdictInputs["regulatoryThesis"],
): { contribution: number; note: string } | null {
  if (!reg) return null;
  switch (reg.thesisDimension) {
    case "ltr": {
      // Local strict rent control + tenant-favorable eviction
      // posture is a margin compressor for landlords.
      const rcPenalty = reg.rentControl === "local_strict" ? -0.4 : 0;
      const evPenalty = reg.evictionFriendliness === "tenant_favorable" ? -0.3 : 0;
      const fraction = rcPenalty + evPenalty;
      if (fraction === 0)
        return { contribution: 0, note: "LTR regulatory environment is balanced." };
      return {
        contribution: Math.round(fraction * weight),
        note: `LTR landlord posture: ${reg.rentControl ?? "unclear"} rent control, ${reg.evictionFriendliness ?? "unclear"} eviction.`,
      };
    }
    case "owner_occupied": {
      // Homestead exemption is a positive (recurring tax savings);
      // common special assessments (Mello-Roos / CDD) are negative.
      const heBoost = reg.homesteadExemption === "yes" ? 0.3 : 0;
      const saPenalty = reg.specialAssessmentsCommon === "yes" ? -0.4 : 0;
      const fraction = heBoost + saPenalty;
      if (fraction === 0)
        return { contribution: 0, note: "OO regulatory environment is neutral." };
      return {
        contribution: Math.round(fraction * weight),
        note: `OO posture: homestead ${reg.homesteadExemption ?? "unclear"}, special assessments ${reg.specialAssessmentsCommon ?? "unclear"}.`,
      };
    }
    case "house_hacking": {
      // ADUs banned is a thesis blocker for the unit-add play.
      if (reg.aduLegal === "no") {
        return {
          contribution: -weight,
          note: "ADU illegal in this jurisdiction — house-hack thesis blocked.",
        };
      }
      const aduBoost = reg.aduLegal === "yes" ? 0.4 : reg.aduLegal === "restricted" ? 0.1 : 0;
      const ooStrBoost = reg.ownerOccupiedStrCarveout === "yes" ? 0.2 : 0;
      const fraction = aduBoost + ooStrBoost;
      if (fraction === 0)
        return { contribution: 0, note: "House-hack zoning environment is unclear." };
      return {
        contribution: Math.round(fraction * weight),
        note: `HH posture: ADU ${reg.aduLegal ?? "unclear"}, OO STR carveout ${reg.ownerOccupiedStrCarveout ?? "unclear"}.`,
      };
    }
    case "flipping": {
      // Surtaxes + historic overlays compress margins. Surtax is
      // the bigger penalty since it directly reduces ARV proceeds.
      const surtaxPenalty = reg.flipperSurtax === "yes" ? -0.6 : 0;
      const histPenalty = reg.historicDistrictRisk === "yes" ? -0.3 : 0;
      const fraction = surtaxPenalty + histPenalty;
      if (fraction === 0)
        return { contribution: 0, note: "Flipping regulatory environment is favorable." };
      return {
        contribution: Math.round(fraction * weight),
        note: `Flip posture: ${reg.flipperSurtax === "yes" ? "surtax applies" : "no surtax"}, ${reg.historicDistrictRisk === "yes" ? "historic-overlay constraint" : "no overlay"}.`,
      };
    }
  }
}

// ============================================================
// Main entry point
// ============================================================

export function scoreVerdict(input: VerdictInputs): VerdictScore {
  const thesis = input.thesisType ?? "str";
  const goal = input.goalType;

  const baseWeights = RUBRIC_WEIGHTS[thesis];
  const goalAdjusted = applyGoalNudge(baseWeights, goal);
  const regional = getRegionalRiskOverride(input.state);
  const effective = applyRegionalOverrides(goalAdjusted, regional);

  const breakdown: BreakdownEntry[] = [];
  let score = 50; // neutral baseline

  // Helper: run a rule with the effective weight; only push if the
  // weight is > 0 for this thesis.
  const apply = (
    key: string,
    category: RuleCategory,
    weight: number,
    multiplier: number | null,
    result: { contribution: number; note: string } | null,
  ): void => {
    if (weight <= 0 || result == null) return;
    score += result.contribution;
    breakdown.push({
      key,
      category,
      contribution: result.contribution,
      weight,
      multiplier,
      note: result.note,
    });
  };

  // --- Regulatory (STR or thesis-specific) ---
  apply(
    "regulatory_str",
    "regulatory",
    effective.regulatory_str,
    null,
    ruleRegulatoryStr(effective.regulatory_str, input.regulatory?.strLegal ?? null),
  );
  apply(
    "regulatory_thesis",
    "regulatory",
    effective.regulatory_thesis,
    null,
    ruleRegulatoryThesis(effective.regulatory_thesis, input.regulatoryThesis),
  );

  // --- Rental fundamentals ---
  apply(
    "cap_rate_vs_price",
    "rental_fundamentals",
    effective.cap_rate_vs_price,
    null,
    ruleCapRate(effective.cap_rate_vs_price, input.revenue, input.referencePrice),
  );
  apply(
    "rental_comp_alignment",
    "rental_fundamentals",
    effective.rental_comp_alignment,
    null,
    ruleRentalCompAlignment(
      effective.rental_comp_alignment,
      input.rentalCompVariance,
    ),
  );

  // --- Location ---
  apply(
    "walkability",
    "location",
    effective.walkability,
    null,
    ruleWalkability(effective.walkability, input.walkScore),
  );
  apply(
    "schools_quality",
    "location",
    effective.schools_quality,
    null,
    ruleSchoolsQuality(effective.schools_quality, input.schools),
  );
  apply(
    "place_sentiment",
    "location",
    effective.place_sentiment,
    null,
    rulePlaceSentiment(effective.place_sentiment, input.placeSentimentBullets),
  );
  apply(
    "livability_score",
    "location",
    effective.livability_score,
    null,
    ruleLivability(
      effective.livability_score,
      input.walkScore,
      input.crime,
      input.schools,
    ),
  );

  // --- Risk ---
  apply(
    "flood",
    "risk",
    effective.flood,
    regional.flood ?? null,
    ruleFlood(effective.flood, input.flood),
  );
  apply(
    "wildfire",
    "risk",
    effective.wildfire,
    regional.wildfire ?? null,
    ruleWildfire(effective.wildfire, input.wildfire),
  );
  apply(
    "crime",
    "risk",
    effective.crime,
    null,
    ruleCrime(effective.crime, input.crime),
  );

  // --- Market (appreciation, ARV, offer-price alignment) ---
  apply(
    "appreciation_potential",
    "market",
    effective.appreciation_potential,
    null,
    ruleAppreciation(
      effective.appreciation_potential,
      input.schools,
      input.walkScore,
      input.incomeChange5y,
      input.salesComps,
      input.marketVelocityTrend,
    ),
  );
  apply(
    "arv_margin",
    "market",
    effective.arv_margin,
    null,
    ruleArvMargin(
      effective.arv_margin,
      input.arvEstimateCents,
      input.userOfferCents,
      input.renovationBudgetCents,
      input.salesComps?.arvConfidence ?? null,
    ),
  );
  // M3.12 — offer-price alignment. Penalty when user's offer is
  // significantly above market median (overpaying), reward when
  // significantly below (good acquisition price). Reuses the
  // rental_comp_alignment band semantics.
  apply(
    "offer_price_alignment",
    "rental_fundamentals",
    effective.offer_price_alignment,
    null,
    ruleOfferPriceAlignment(
      effective.offer_price_alignment,
      input.offerPriceVariance,
    ),
  );

  // Clamp final
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ---- Signal derivation ----
  // Pre-M3.8 PASS-override: STR thesis with strLegal === "no"
  // forces PASS regardless of score. Preserved as the only
  // "dealbreaker" rule. Non-STR theses use the heavy negative
  // weights (e.g. HH adu_legal=no = -100% of regulatory_thesis
  // weight) to push score below 45.
  let signal: VerdictScore["signal"];
  const strLegal = input.regulatory?.strLegal;
  if (thesis === "str" && strLegal === "no") {
    signal = "pass";
  } else if (score >= 70 && strLegal !== "unclear") {
    signal = "buy";
  } else if (score < 45) {
    signal = "pass";
  } else {
    signal = "watch";
  }

  // ---- Confidence ----
  // Docks 10 per missing major signal that the active thesis
  // actually weights. (Pre-M3.8 always docked for STR's signal
  // set, which over-penalized OO confidence on missing comp data.)
  const relevantSignals: Array<{ weight: number; missing: boolean }> = [
    { weight: effective.regulatory_str, missing: input.regulatory == null },
    { weight: effective.flood, missing: input.flood == null },
    { weight: effective.wildfire, missing: input.wildfire == null },
    { weight: effective.crime, missing: input.crime == null },
    { weight: effective.walkability, missing: input.walkScore == null },
    { weight: effective.cap_rate_vs_price, missing: input.revenue == null || input.referencePrice == null },
    { weight: effective.schools_quality, missing: input.schools == null || input.schools.dataQuality === "unavailable" },
    { weight: effective.regulatory_thesis, missing: input.regulatoryThesis == null },
  ];
  const missing = relevantSignals.filter((s) => s.weight > 0 && s.missing).length;
  const confidence = Math.max(30, 100 - missing * 10);

  return { score, signal, confidence, breakdown };
}

function formatThousands(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
