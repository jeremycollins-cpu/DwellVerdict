import { describe, expect, it } from "vitest";

import { VerdictNarrativeOutputSchema } from "../src/tasks/verdict-narrative";

/**
 * Post-M3.8 schema realism canary.
 *
 * Each new milestone in Phase 3 (M3.7 fetchers, M3.10 schools, M3.13
 * thesis-aware regulatory, M3.11 rental comps, M3.8 thesis-aware
 * scoring) added more substantive data flowing into the verdict
 * narrative. Each milestone consumed a little more "summary char
 * budget" — the 300 ceiling needed to become 500, the 500 needed
 * to become 800.
 *
 * These fixtures encode realistic post-M3.8 narrative shapes for
 * each thesis arm (LTR / STR / OO). They're the tripwire for
 * M3.12 / M3.9 / future milestones — when a new milestone adds
 * more data and a thesis fixture starts failing here, the schema
 * needs another bump (or content trimming) before merge.
 *
 * Goal: catch char-limit regressions in CI rather than in
 * production verdict-regeneration logs.
 */

describe("verdict-narrative schema realism canary (post-M3.8)", () => {
  it("accommodates a fully-populated LTR verdict (Roseville-shaped fixture)", () => {
    // Mimics the Roseville LTR shape that originally tripped the
    // 500-char limit: rich regulatory (AB 1482 + Chapter 202 + SB
    // 329 + deposits + eviction) + rich location (walk + amenities
    // + 4 school ratings + notable schools + flood + wildfire).
    const fixture = {
      narrative:
        "Roseville LTR at 41 Maywood Ct. Median rent comps suggest $2,800/mo " +
        "across the area's 3-4BR inventory; user's $2,400 intake is conservatively " +
        "in the lower band but within ±15% of market median, which the rental_comp_alignment " +
        "rule reads as 'low' (a small drag on the score) rather than a flag. Schools rate " +
        "above the state median — an 8.5/10 high-school median is a tailwind for both " +
        "tenant retention and 5-year resale.\n\nRoseville Joint Union HSD's open-enrollment " +
        "policy adds depth to the family-renter pool. State-level California rent control " +
        "(AB 1482) caps annual increases at 5% + CPI for buildings 15+ years old; Roseville " +
        "has no local stabilization beyond the state cap. Crime is below state median; FEMA " +
        "Zone X (outside SFHA); 0 wildfires within 5 miles historically.\n\nWhat would " +
        "change the verdict: rent above $3,200/mo or a meaningful school-rating shift " +
        "downward. Until then, BUY.",
      summary:
        "Roseville LTR with above-state schools, conservative-rent intake, and clean risk profile.",
      data_points: {
        comps: {
          summary:
            "Roseville LTR market: 18 estimated comparable rentals active, median monthly " +
            "rent $2,800 (range $2,400–$3,200). Demand supported by Sacramento commute " +
            "via I-80 and Hewlett Packard / Kaiser Permanente employer corridor within 10 " +
            "miles. User's $2,400 intake is ~86% of market median (low band, ±15% but " +
            "within reasonable conservatism).",
          metrics: {
            count: 18,
            median_monthly_rent_cents: 280000,
            rent_range_low_cents: 240000,
            rent_range_high_cents: 320000,
            intake_variance_flag: "low" as const,
            intake_variance_ratio: 0.86,
          },
        },
        revenue: {
          summary:
            "Net annual ~$24K on $2,400/mo gross with 6% vacancy, $7,200 property tax, " +
            "$1,800 insurance, and standard 5% maintenance reserve. Gross-rent multiplier " +
            "20× on a $480K reference price; cap rate ~5%. Tighter than peak-period " +
            "Roseville rentals but consistent with current-market acquisition math.",
          metrics: {
            annual_estimate: 24000,
            cap_rate: 0.05,
          },
        },
        regulatory: {
          summary:
            "California AB 1482 caps annual rent increases at 5% + CPI (max 10%) for " +
            "buildings 15+ years old; Roseville has no local rent stabilization beyond " +
            "the state cap. Just-cause eviction required after 12 months of tenancy per " +
            "AB 1482. Security deposit limited to 2 months' rent unfurnished, 3 months " +
            "furnished. SB 329 prohibits source-of-income discrimination (Section 8 " +
            "vouchers cannot be refused). City of Roseville does not require landlord " +
            "rental registration or annual inspections — landlord-favorable on the " +
            "administrative side relative to peer Bay Area cities.",
          metrics: {
            registration_required: false,
          },
        },
        location: {
          summary:
            "Walk score 64 (mid-range; suburban arterial). Roseville Joint Union HSD " +
            "median high-school rating 8.5/10 (Roseville High 9, Granite Bay 9, Oakmont " +
            "7); elementary median 8.0/10 across Sargeant, Buljan, and Cooley. Sutter " +
            "Roseville Medical Center within 3 miles. FEMA Zone X (outside SFHA); 0 " +
            "wildfires within 5 miles historically. Crime below state median (violent " +
            "2.4/1k vs CA 4.4/1k median).",
          metrics: {
            walk_score: 64,
            flood_zone: "X",
            crime_rate_rank: "low" as const,
            elementary_school_rating_median: 8.0,
            high_school_rating_median: 8.5,
            notable_schools: ["Roseville High", "Granite Bay High"],
          },
        },
      },
    };

    const result = VerdictNarrativeOutputSchema.safeParse(fixture);
    if (!result.success) {
      console.error(
        "[realism-canary LTR] failed:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });

  it("accommodates a fully-populated STR verdict (Kings Beach-shaped fixture)", () => {
    // Vacation-rental shape: rich STR comps + CA wildfire + Placer
    // County permit detail + seasonality.
    const fixture = {
      narrative:
        "Kings Beach STR at 295 Bend Ave. Median ADR for comparable 3BR Lake Tahoe " +
        "rentals is $350/night with 58% blended annual occupancy; user's $400/night " +
        "intake aligns with market (within ±15%) and 60% occupancy intake is realistic " +
        "for a North Lake property within walking distance of public-beach access. " +
        "Net revenue projects ~$60K annually after 30% expenses.\n\nPlacer County's STR " +
        "ordinance permits non-owner-occupied rentals with annual permit; Kings Beach " +
        "specifically falls under Tahoe Basin overlay with stricter parking + occupancy " +
        "caps. CA wildfire risk is elevated (Martis 2001 within radius); insurance cost " +
        "factor 1.5× per regional override. FEMA Zone X (lake-adjacent but above SFHA).\n\n" +
        "What would change the verdict: ADR median above $450 or local STR ordinance " +
        "rollback. Until then, BUY.",
      summary:
        "Kings Beach STR with permit clarity, market-aligned intake, and elevated CA wildfire weight.",
      data_points: {
        comps: {
          summary:
            "Kings Beach STR market: 42 estimated comparable listings, median ADR $350/night " +
            "(range $250–$500), median annual occupancy 58% (range 45–72%). Demand drivers: " +
            "Northstar California + Heavenly ski-resort drive market, summer Lake Tahoe " +
            "water-sports + public-beach access, peak season Jun-Aug + Dec-Feb. User's " +
            "$400 ADR is ~14% above median (high band but within reason for lake-adjacent " +
            "inventory); user's 60% occupancy aligns within ±5%.",
          metrics: {
            count: 42,
            median_adr_cents: 35000,
            adr_range_low_cents: 25000,
            adr_range_high_cents: 50000,
            median_occupancy: 0.58,
            seasonality: "high" as const,
            intake_variance_flag: "high" as const,
            intake_variance_ratio: 1.14,
          },
        },
        revenue: {
          summary:
            "Gross STR ~$87K on user's $400/night × 60% occupancy × 365 days. Net ~$61K " +
            "after 30% expense ratio (cleaning, platform fees, utilities, maintenance " +
            "reserve, property management). Cap rate proxy 8.7% on $700K reference price " +
            "— above STR rule-of-thumb 6% threshold.",
          metrics: {
            annual_estimate: 61000,
            cap_rate: 0.087,
            seasonality: "high" as const,
          },
        },
        regulatory: {
          summary:
            "Placer County permits non-owner-occupied STRs in Kings Beach under the Tahoe " +
            "Basin Area Plan with annual renewal. Permit conditions include occupancy cap " +
            "(2 per bedroom + 2), off-street parking requirement, and TOT collection. " +
            "Owner-occupied STRs follow a separate streamlined process. Kings Beach falls " +
            "within the Lake Tahoe overlay district which adds noise-ordinance and trash-" +
            "containment provisions per local enforcement memos.",
          metrics: {
            str_status: "permitted" as const,
            registration_required: true,
          },
        },
        location: {
          summary:
            "Walk score 48 (lake-adjacent residential). Walking-distance access to Kings " +
            "Beach State Recreation Area + Tahoe Vista shoreline. Northstar California " +
            "Resort 12 miles south; Heavenly Ski Resort 30 miles. FEMA Zone X (above SFHA " +
            "despite lake adjacency). USGS records 9 historical wildfires within 5 miles " +
            "including Martis 2001 (14,400 acres) — CA regional wildfire weight 1.5× " +
            "applies. Crime well below state median.",
          metrics: {
            walk_score: 48,
            flood_zone: "X",
            crime_rate_rank: "low" as const,
          },
        },
      },
    };

    const result = VerdictNarrativeOutputSchema.safeParse(fixture);
    if (!result.success) {
      console.error(
        "[realism-canary STR] failed:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });

  it("accommodates a fully-populated owner-occupied verdict (Lincoln-shaped fixture)", () => {
    // OO shape: livability composite + schools + appreciation + no
    // rental income + thesis-aware regulatory (homestead + special
    // assessments).
    const fixture = {
      narrative:
        "Lincoln owner-occupied at 207 Corte Sendero. Livability index 72/100 (walk 58, " +
        "crime well below state median, schools 7.5/10) supports a strong primary-residence " +
        "thesis without leaning on rental fundamentals (which don't apply here). 5-year " +
        "tract income growth +12% adds appreciation tailwind; Lincoln's expansion corridor " +
        "north of Sacramento has compounded population growth since 2018.\n\nNebraska " +
        "(this is the city in CA, not NE) — California Prop 13 caps annual assessed-value " +
        "growth to 2% post-purchase but resets at sale, so the new owner takes a step-up " +
        "basis. No homestead exemption per CA tax code. Mello-Roos special-district debt " +
        "is common in newer Lincoln developments; verify CFD obligations before close.\n\n" +
        "What would change the verdict: a meaningful Mello-Roos burden surfaced at title " +
        "review or schools dropping below 7/10. Until then, BUY.",
      summary:
        "Lincoln owner-occupied with strong livability composite, appreciation tailwind, and CA tax baseline.",
      data_points: {
        comps: {
          summary:
            "Owner-occupied — no rental comp data (skipped per thesis routing). Recent " +
            "sales coverage from M3.12: 6 comparable Lincoln 4BR/3BA sales clustered " +
            "$680K-$760K; median comp $720K, ARV $725K (moderate confidence). Median DOM " +
            "20 days — moderate market velocity. Lincoln's residential market trend is " +
            "stable year-over-year with steady demand from Sacramento commute corridor; " +
            "user's offer at $700K is ~3% below comp median (modest acquisition discount).",
          metrics: {
            count: 6,
            median_comp_price_cents: 72_000_000,
            comp_price_range_low_cents: 68_000_000,
            comp_price_range_high_cents: 76_000_000,
            estimated_arv_cents: 72_500_000,
            arv_confidence: "moderate" as const,
            median_days_on_market: 20,
            market_velocity: "moderate" as const,
            market_trend: "stable" as const,
            offer_price_variance_flag: "low" as const,
            offer_price_variance_ratio: 0.97,
          },
        },
        revenue: {
          summary:
            "Owner-occupied — no rental income projected. Holding-cost analysis: $7,200/yr " +
            "property tax (1.0% effective on $720K), $2,100/yr insurance, $0 HOA at this " +
            "address, $1,400/mo Mello-Roos CFD assessment (verify at title review).",
        },
        regulatory: {
          summary:
            "California offers no homestead exemption for primary residences (state-level " +
            "tax code; the federal homestead bankruptcy exemption is a separate matter). " +
            "Prop 13 caps annual assessed-value growth at 2% post-purchase; new owners " +
            "step up to current assessed value at sale. Mello-Roos special-district " +
            "assessments (CFDs) are common in newer Lincoln developments — buyer should " +
            "obtain a CFD disclosure during escrow. CA seller is required to provide a " +
            "Transfer Disclosure Statement (TDS) per Civ. Code 1102.",
        },
        location: {
          summary:
            "Walk score 58 (suburban with arterial commercial). Western Placer Unified " +
            "School District median ratings: elementary 7.8/10, middle 7.5/10, high " +
            "7.5/10. Twelve Bridges High and Glen Edwards Middle stand out. FEMA Zone X " +
            "(no SFHA). USGS records 0 wildfires within 5 miles historically — CA wildfire " +
            "1.5× multiplier applies but base risk is essentially zero. Crime (FBI 2023) " +
            "well below state and US median; Lincoln tract income +12% over 5 years.",
          metrics: {
            walk_score: 58,
            flood_zone: "X",
            crime_rate_rank: "low" as const,
            elementary_school_rating_median: 7.8,
            high_school_rating_median: 7.5,
          },
        },
      },
    };

    const result = VerdictNarrativeOutputSchema.safeParse(fixture);
    if (!result.success) {
      console.error(
        "[realism-canary OO] failed:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });

  it("accommodates a fully-populated flipping verdict (post-M3.12 ARV math)", () => {
    // Flipping shape: ARV math is central. Sales comps + market
    // velocity dominate the comps card; arv_margin rule produces a
    // meaningful contribution.
    const fixture = {
      narrative:
        "Sacramento flipping at 1234 Restoration Lane. Post-renovation comps cluster " +
        "$420K-$485K for 3BR/2BA inventory in the Tahoe Park submarket. ARV estimate " +
        "$455K (high confidence) reflects 8 recent comparable renovated sales. " +
        "Purchase $300K + renovation $80K + holding $15K = total cost $395K → flip " +
        "margin 15.6%, on the lighter side of typical flipping economics but workable.\n\n" +
        "Market velocity is moderate at 24-day median DOM and accelerating year-over-" +
        "year (was 35d a year ago). Permit complexity in Sacramento residential is " +
        "moderate — typical residential addition + kitchen / bath remodel scope clears " +
        "in 6-8 weeks per current Sacramento Building Department turnaround.\n\n" +
        "What would change the verdict: ARV above $475K (margin >20%) or renovation " +
        "scope expanding beyond initial $80K budget. Until then, WATCH.",
      summary:
        "Sacramento flipping with moderate ARV margin (15.6%) and accelerating market velocity.",
      data_points: {
        comps: {
          summary:
            "8 recent comparable renovated sales in Tahoe Park submarket; median comp " +
            "$455K (range $420K-$485K). Median DOM 24 days, accelerating year-over-" +
            "year (35d → 24d). ARV $455K (high confidence) → flip margin 15.6% on " +
            "$300K offer + $80K renovation + $15K holding cost. Margin is workable " +
            "but on the lighter side of typical flipping economics — buffer for cost " +
            "overruns is thin.",
          metrics: {
            count: 8,
            median_comp_price_cents: 45_500_000,
            comp_price_range_low_cents: 42_000_000,
            comp_price_range_high_cents: 48_500_000,
            estimated_arv_cents: 45_500_000,
            arv_confidence: "high" as const,
            median_days_on_market: 24,
            market_velocity: "moderate" as const,
            market_trend: "accelerating" as const,
            offer_price_variance_flag: "low" as const,
            offer_price_variance_ratio: 0.66,
            flip_margin_percent: 0.156,
          },
        },
        revenue: {
          summary:
            "Flipping — no rental income. Total project cost $395K (purchase $300K + " +
            "renovation $80K + holding $15K @ 5% of purchase, 6mo carry); ARV $455K → " +
            "gross profit $60K, margin 15.6%. Targeting standard FHA-203(k) loan or " +
            "DSCR loan with 6-month renovation timeline.",
        },
        regulatory: {
          summary:
            "Sacramento residential permitting: moderate complexity. Standard permits " +
            "(electrical, plumbing, HVAC) clear over-the-counter same-day; structural " +
            "additions or kitchen relocations require plan check (typical 4-6 week " +
            "turnaround). California GC license required for projects over $500. No " +
            "flipper-specific surtax in Sacramento (unlike LA's Measure ULA above $5M). " +
            "Standard CA seller disclosures apply at resale (TDS, lead paint pre-1978, " +
            "natural hazard disclosure for fire/flood/seismic zones).",
        },
        location: {
          summary:
            "Walk score 64 (suburban with neighborhood retail). Tahoe Park submarket " +
            "is part of Sacramento City Unified School District; median elementary " +
            "rating 7/10, high 6.5/10 — middle-of-pack but adequate for resale " +
            "demographic. FEMA Zone X (no SFHA). USGS 0 wildfires within 5mi " +
            "historically. Crime moderate (FBI 2023 violent ~5/1k, slightly above " +
            "state median).",
          metrics: {
            walk_score: 64,
            flood_zone: "X",
            crime_rate_rank: "moderate" as const,
            elementary_school_rating_median: 7.0,
            high_school_rating_median: 6.5,
          },
        },
      },
    };

    const result = VerdictNarrativeOutputSchema.safeParse(fixture);
    if (!result.success) {
      console.error(
        "[realism-canary Flipping] failed:",
        JSON.stringify(result.error.format(), null, 2),
      );
    }
    expect(result.success).toBe(true);
  });
});
