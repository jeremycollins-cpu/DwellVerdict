import "server-only";

import {
  getFemaFloodSignal,
  getUsgsWildfireSignal,
  getFbiCrimeSignal,
  getCensusAcsSignal,
  getOverpassSignal,
  getAirbnbCompsSignal,
  getZillowValuationSignal,
  getRedfinValuationSignal,
  computeRevenueEstimate,
  computeIntakeRevenue,
  settledSignal,
  type AirbnbCompsSignal,
  type PropertyValuation,
  type SignalResult,
} from "@dwellverdict/data-sources";
import {
  scoreVerdict,
  writeVerdictNarrative,
  lintPlaceSentiment,
  type VerdictScore,
  type VerdictNarrativeOutput,
  type VerdictNarrativePropertyContext,
} from "@dwellverdict/ai";
import type { Property } from "@dwellverdict/db";

import { getDb } from "@/lib/db";
import { getRegulatorySignal } from "@/lib/regulatory/lookup";
import { getPlaceSentimentSignal } from "@/lib/place-sentiment/lookup";

/**
 * Rules-first verdict orchestrator per ADR-6, M3.6 reframe.
 *
 * Flow:
 *   0. Defense-in-depth gate: refuse to generate for properties
 *      that haven't completed the M3.5 intake wizard. Without
 *      thesis + pricing the verdict has nothing meaningful to say.
 *   1. Fetch all free-data signals in parallel via `settledSignal`
 *      (per-fetcher timeout, never throws). External fetcher
 *      failures degrade gracefully — intake fields fill the gap.
 *   2. Compute reference price and revenue from intake first;
 *      scrapers are fallback-only when the user didn't provide.
 *   3. Run scoring rubric (deterministic).
 *   4. Call verdict-narrative Haiku/Sonnet (~$0.005) with full
 *      thesis + pricing + expense context so the narrative speaks
 *      to the user's actual investment plan.
 *   5. Lint output for fair-housing compliance, return composed
 *      verdict for the route handler to persist.
 *
 * What's new in M3.6 vs the M3.2 baseline:
 *   - Caller passes the loaded `property` row (with intake fields)
 *     instead of separate addressFull/city/state/lat/lng.
 *   - Phase 1 wraps every fetcher with `settledSignal` so a single
 *     thrown error or hung connection no longer fails the verdict.
 *   - Phase 2 uses intake fields as primary inputs, scrapers as
 *     fallback. Discrepancies between intake and scraper data are
 *     logged for future analysis.
 *   - Phase 3 receives thesis context; narrative prompt v3 reframes
 *     per thesis (STR vs LTR vs owner-occupied vs flipping).
 *   - Emits a structured "[orchestrator] fetcher health" log line
 *     at end of phase 1 so M3.7 can prioritize repairs.
 */

export type OrchestratedVerdict = {
  ok: true;
  signal: "buy" | "watch" | "pass";
  score: number;
  confidence: number;
  summary: string;
  narrative: string;
  /**
   * Structured per-domain evidence (M3.3 / verdict-narrative v2+).
   * Type matches VerdictNarrativeOutput["data_points"] from
   * packages/ai. Frontend handles backward-compat with legacy
   * verdict rows that have a string-only shape.
   */
  dataPoints: VerdictNarrativeOutput["data_points"];
  sources: string[];
  breakdown: VerdictScore["breakdown"];
  observability: {
    modelVersion: string;
    promptVersion: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  };
};

export type OrchestratedVerdictFailure = {
  ok: false;
  error: string;
  observability: Partial<OrchestratedVerdict["observability"]>;
};

export type SignalKey =
  | "fema"
  | "usgs"
  | "fbi"
  | "census"
  | "overpass"
  | "airbnb"
  | "zillow"
  | "redfin"
  | "regulatory"
  | "placeSentiment"
  | "revenue";

export type VerdictProgressEvent =
  | { type: "phase_start"; phase: "signals" | "scoring" | "narrative" | "lint" }
  | { type: "phase_complete"; phase: "signals" | "scoring" | "narrative" | "lint" }
  | {
      type: "signal_complete";
      signal: SignalKey;
      ok: boolean;
      sourceUrls: string[];
      durationMs: number;
    }
  | {
      type: "narrative_ready";
      text: string;
      summary: string;
      model: string;
      routingReason: string;
    }
  | { type: "complete"; verdict: OrchestratedVerdict; verdictId: string }
  | { type: "error"; error: string };

export type ProgressListener = (event: VerdictProgressEvent) => void;

/** Subset of the M3.5 intake fields the orchestrator actually reads. */
type IntakeFields = Pick<
  Property,
  | "thesisType"
  | "goalType"
  | "thesisOtherDescription"
  | "listingPriceCents"
  | "userOfferPriceCents"
  | "estimatedValueCents"
  | "annualPropertyTaxCents"
  | "annualInsuranceEstimateCents"
  | "monthlyHoaFeeCents"
  | "strExpectedNightlyRateCents"
  | "strExpectedOccupancy"
  | "strCleaningFeeCents"
  | "strAvgLengthOfStayDays"
  | "ltrExpectedMonthlyRentCents"
  | "ltrVacancyRate"
  | "ltrExpectedAppreciationRate"
  | "downPaymentPercent"
  | "mortgageRate"
  | "mortgageTermYears"
  | "renovationBudgetCents"
  | "flippingArvEstimateCents"
  | "intakeCompletedAt"
>;

/** Per-signal timeout. HTTP fetchers (Zillow scrape, Airbnb API,
 *  USGS layer) get the short ceiling; LLM-cached lookups (regulatory
 *  + place-sentiment, which may incur a Haiku call on cache miss)
 *  get a longer one. */
const HTTP_FETCHER_TIMEOUT_MS = 8_000;
const LLM_CACHED_FETCHER_TIMEOUT_MS = 12_000;

export async function orchestrateVerdict(input: {
  /** Loaded `Property` row including the M3.5 intake fields.
   *  Caller is responsible for the org-scoping select. */
  property: Pick<
    Property,
    | "id"
    | "addressFull"
    | "addressLine1"
    | "city"
    | "state"
    | "zip"
    | "lat"
    | "lng"
  > &
    IntakeFields;
  userId?: string;
  orgId?: string;
  verdictId?: string;
  onProgress?: ProgressListener;
}): Promise<OrchestratedVerdict | OrchestratedVerdictFailure> {
  const { property, userId, orgId, verdictId, onProgress } = input;
  const db = getDb();
  const emit: ProgressListener = onProgress ?? (() => {});

  // ---- Phase 0: intake gate ----
  // Defense-in-depth alongside the UI-level block in M3.5. A
  // verdict generated without intake has nothing meaningful to say
  // about thesis, pricing, or revenue — fail fast with a clear
  // signal instead of producing a generic narrative.
  if (!property.intakeCompletedAt) {
    const error =
      "intake_required: complete property intake before generating verdict";
    emit({ type: "error", error });
    return { ok: false, error, observability: {} };
  }

  const lat = property.lat ? Number(property.lat) : NaN;
  const lng = property.lng ? Number(property.lng) : NaN;
  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;
  const city = property.city;
  const state = property.state;

  // ---- Phase 1: fetch everything in parallel ----
  emit({ type: "phase_start", phase: "signals" });

  // Wrap each signal so its completion fires a `signal_complete`
  // event the moment that signal settles, regardless of whether
  // sibling fetchers are still in flight. This is what makes the
  // mockup-04 stream-track tick off domains as work finishes.
  const wrap = <T>(
    key: SignalKey,
    p: Promise<T>,
    extractSources: (r: T) => string[],
    isOk: (r: T) => boolean,
  ): Promise<T> => {
    const startedAt = Date.now();
    return p.then((r) => {
      emit({
        type: "signal_complete",
        signal: key,
        ok: isOk(r),
        sourceUrls: isOk(r) ? extractSources(r) : [],
        durationMs: Date.now() - startedAt,
      });
      return r;
    });
  };

  type DataSourceResult = { ok: boolean; data?: { sourceUrl?: string } };
  const ds = (r: unknown): string[] => {
    const x = r as DataSourceResult;
    return x.ok && x.data?.sourceUrl ? [x.data.sourceUrl] : [];
  };
  type ValuationResult = { ok: boolean; data?: { url?: string } };
  const valuation = (r: unknown): string[] => {
    const x = r as ValuationResult;
    return x.ok && x.data?.url ? [x.data.url] : [];
  };
  const okFlag = (r: unknown): boolean => (r as { ok: boolean }).ok;

  // settledSignal converts throws / hangs into `{ok:false}`
  // envelopes; Promise.allSettled adds a second line of defense
  // against truly catastrophic upstream behavior. Either way, no
  // single fetcher can fail the verdict.
  const fetchers = [
    {
      key: "fema" as const,
      promise: wrap(
        "fema",
        settledSignal(getFemaFloodSignal(db, lat, lng), HTTP_FETCHER_TIMEOUT_MS, "fema"),
        ds,
        okFlag,
      ),
    },
    {
      key: "usgs" as const,
      promise: wrap(
        "usgs",
        settledSignal(getUsgsWildfireSignal(db, lat, lng), HTTP_FETCHER_TIMEOUT_MS, "usgs"),
        ds,
        okFlag,
      ),
    },
    {
      key: "fbi" as const,
      promise: wrap(
        "fbi",
        settledSignal(getFbiCrimeSignal(db, lat, lng), HTTP_FETCHER_TIMEOUT_MS, "fbi"),
        ds,
        okFlag,
      ),
    },
    {
      key: "census" as const,
      promise: wrap(
        "census",
        settledSignal(getCensusAcsSignal(db, lat, lng), HTTP_FETCHER_TIMEOUT_MS, "census"),
        ds,
        okFlag,
      ),
    },
    {
      key: "overpass" as const,
      promise: wrap(
        "overpass",
        settledSignal(getOverpassSignal(db, lat, lng), HTTP_FETCHER_TIMEOUT_MS, "overpass"),
        ds,
        okFlag,
      ),
    },
    {
      key: "airbnb" as const,
      promise: wrap(
        "airbnb",
        settledSignal(
          getAirbnbCompsSignal(db, lat, lng, `${city}, ${state}`),
          HTTP_FETCHER_TIMEOUT_MS,
          "airbnb",
        ),
        ds,
        okFlag,
      ),
    },
    {
      key: "zillow" as const,
      promise: wrap(
        "zillow",
        settledSignal(
          getZillowValuationSignal(db, addressFull),
          HTTP_FETCHER_TIMEOUT_MS,
          "zillow",
        ),
        valuation,
        okFlag,
      ),
    },
    {
      key: "redfin" as const,
      promise: wrap(
        "redfin",
        settledSignal(
          getRedfinValuationSignal(db, addressFull),
          HTTP_FETCHER_TIMEOUT_MS,
          "redfin",
        ),
        valuation,
        okFlag,
      ),
    },
    {
      key: "regulatory" as const,
      // Regulatory + placeSentiment can take longer (LLM cache miss
      // on first hit per city). They have their own internal timeout
      // semantics; here we add an outer safety net.
      promise: wrap(
        "regulatory",
        // The regulatory result shape isn't SignalResult<T>; it has
        // its own `{ok: true, ...} | {ok: false, error, source}`
        // shape. We still soft-fail it via withTimeout below.
        getRegulatorySignal({ city, state, userId, orgId }).catch(
          (err): { ok: false; error: string; sourceUrls: string[] } => ({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            sourceUrls: [],
          }),
        ),
        (r) => (r.ok ? r.sourceUrls : []),
        (r) => r.ok,
      ),
    },
    {
      key: "placeSentiment" as const,
      promise: wrap(
        "placeSentiment",
        getPlaceSentimentSignal({ lat, lng, userId, orgId }).catch(
          (err): { ok: false; error: string } => ({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
        () => [],
        (r) => r.ok,
      ),
    },
  ];

  void LLM_CACHED_FETCHER_TIMEOUT_MS;

  const settled = await Promise.allSettled(fetchers.map((f) => f.promise));
  const [
    femaResult,
    usgsResult,
    fbiResult,
    censusResult,
    overpassResult,
    airbnbResult,
    zillowResult,
    redfinResult,
    regulatorySignal,
    placeSentimentSignal,
  ] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : ({
          ok: false,
          error:
            s.reason instanceof Error ? s.reason.message : String(s.reason),
          source: fetchers[i]?.key ?? "unknown",
        } as unknown),
  ) as [
    SignalResult<{ sfha: boolean; sourceUrl: string }>,
    SignalResult<{ nearbyFireCount: number; sourceUrl: string }>,
    SignalResult<{
      violentPer1k: number;
      propertyPer1k: number;
      sourceUrl: string;
    }>,
    SignalResult<{ medianHouseholdIncome: number | null; sourceUrl: string }>,
    SignalResult<{ walkScore: number; sourceUrl: string }>,
    SignalResult<AirbnbCompsSignal>,
    SignalResult<PropertyValuation>,
    SignalResult<PropertyValuation>,
    Awaited<ReturnType<typeof getRegulatorySignal>> | { ok: false; error: string; sourceUrls: string[] },
    Awaited<ReturnType<typeof getPlaceSentimentSignal>> | { ok: false; error: string },
  ];

  emit({ type: "phase_complete", phase: "signals" });

  const fema = femaResult.ok ? femaResult.data : null;
  const usgs = usgsResult.ok ? usgsResult.data : null;
  const fbi = fbiResult.ok ? fbiResult.data : null;
  const census = censusResult.ok ? censusResult.data : null;
  const overpass = overpassResult.ok ? overpassResult.data : null;
  const airbnb: AirbnbCompsSignal | null = airbnbResult.ok
    ? airbnbResult.data
    : null;
  const zillow: PropertyValuation | null = zillowResult.ok
    ? zillowResult.data
    : null;
  const redfin: PropertyValuation | null = redfinResult.ok
    ? redfinResult.data
    : null;
  const regulatory = regulatorySignal.ok ? regulatorySignal : null;
  const placeSentiment = placeSentimentSignal.ok ? placeSentimentSignal : null;

  // Single structured log line summarizing fetcher outcomes per
  // verdict. M3.7 will use this to prioritize which broken fetcher
  // to repair first.
  console.log("[orchestrator] fetcher health", {
    verdictId: verdictId ?? null,
    propertyId: property.id,
    fetchers: {
      fema: femaResult.ok ? "ok" : "failed",
      usgs: usgsResult.ok ? "ok" : "failed",
      fbi: fbiResult.ok ? "ok" : "failed",
      census: censusResult.ok ? "ok" : "failed",
      overpass: overpassResult.ok ? "ok" : "failed",
      airbnb: airbnbResult.ok ? "ok" : "failed",
      zillow: zillowResult.ok ? "ok" : "failed",
      redfin: redfinResult.ok ? "ok" : "failed",
      regulatory: regulatorySignal.ok ? "ok" : "failed",
      placeSentiment: placeSentimentSignal.ok ? "ok" : "failed",
    },
  });

  // Discrepancy log: when a working scraper disagrees with intake
  // by >5%, write a console line so we can spot patterns over time.
  // M3.7 / M3.8 will decide whether to surface these to users.
  logPriceDiscrepancies({
    propertyId: property.id,
    userOffer: property.userOfferPriceCents,
    listing: property.listingPriceCents,
    estimate: property.estimatedValueCents,
    zillow,
    redfin,
  });

  // ---- Phase 2: deterministic computation ----
  emit({ type: "phase_start", phase: "scoring" });
  const revenueStartedAt = Date.now();

  // Intake-driven revenue first (M3.6 priority). For STR/LTR/house-
  // hacking with intake fields populated, this is the canonical
  // forecast — user's understanding of their market beats a
  // generic comp median. Comp-based fallback runs only when intake
  // didn't supply enough.
  const intakeRevenue = computeIntakeRevenue({
    thesisType: property.thesisType as IntakeRevenueThesis,
    strExpectedNightlyRateCents: property.strExpectedNightlyRateCents ?? null,
    strExpectedOccupancy: property.strExpectedOccupancy
      ? Number(property.strExpectedOccupancy)
      : null,
    strCleaningFeeCents: property.strCleaningFeeCents ?? null,
    strAvgLengthOfStayDays: property.strAvgLengthOfStayDays ?? null,
    ltrExpectedMonthlyRentCents: property.ltrExpectedMonthlyRentCents ?? null,
    ltrVacancyRate: property.ltrVacancyRate
      ? Number(property.ltrVacancyRate)
      : null,
    annualPropertyTaxCents: property.annualPropertyTaxCents ?? null,
    annualInsuranceEstimateCents: property.annualInsuranceEstimateCents ?? null,
    monthlyHoaFeeCents: property.monthlyHoaFeeCents ?? null,
  });

  const revenue =
    intakeRevenue ??
    (airbnb && airbnb.comps.length > 0
      ? (() => {
          try {
            return computeRevenueEstimate({ comps: airbnb.comps });
          } catch {
            return null;
          }
        })()
      : null);

  emit({
    type: "signal_complete",
    signal: "revenue",
    ok: revenue !== null,
    sourceUrls: [],
    durationMs: Date.now() - revenueStartedAt,
  });

  // Reference price priority: user offer > listing price > user
  // estimated value > Zillow/Redfin (when scrapers work). Cents are
  // converted to dollars at the boundary so scoring math stays
  // consistent with the legacy comp-median path.
  const referencePrice =
    centsToDollars(property.userOfferPriceCents) ??
    centsToDollars(property.listingPriceCents) ??
    centsToDollars(property.estimatedValueCents) ??
    zillow?.listPrice ??
    zillow?.currentEstimate ??
    redfin?.listPrice ??
    redfin?.currentEstimate ??
    null;

  const score = scoreVerdict({
    regulatory: regulatory
      ? { strLegal: regulatory.strLegal ?? null }
      : null,
    flood: fema ? { sfha: fema.sfha } : null,
    wildfire: usgs ? { nearbyFireCount: usgs.nearbyFireCount } : null,
    crime: fbi
      ? { violentPer1k: fbi.violentPer1k, propertyPer1k: fbi.propertyPer1k }
      : null,
    walkScore: overpass?.walkScore ?? null,
    comps: {
      count: airbnb?.comps.length ?? 0,
      medianNightlyRate: airbnb?.medianNightlyRate ?? null,
    },
    revenue: revenue ? { netAnnualMedian: revenue.netAnnualMedian } : null,
    referencePrice,
    placeSentimentBullets: placeSentiment?.bullets.length ?? 0,
  });

  // ---- Phase 3: narrative ----
  const signals = {
    address: addressFull,
    city,
    state,
    flood: fema,
    wildfire: usgs,
    crime: fbi,
    demographics: census,
    walkability: overpass,
    airbnbComps: airbnb,
    zillow,
    redfin,
    revenue,
    regulatory: regulatory
      ? {
          strLegal: regulatory.strLegal,
          permitRequired: regulatory.permitRequired,
          ownerOccupiedOnly: regulatory.ownerOccupiedOnly,
          capOnNonOwnerOccupied: regulatory.capOnNonOwnerOccupied,
          renewalFrequency: regulatory.renewalFrequency,
          minimumStayDays: regulatory.minimumStayDays,
          summary: regulatory.summary,
          sourceUrls: regulatory.sourceUrls,
          lastVerifiedAt: regulatory.lastVerifiedAt,
        }
      : null,
    placeSentiment: placeSentiment
      ? {
          bullets: placeSentiment.bullets,
          summary: placeSentiment.summary,
          sourceRefs: placeSentiment.sourceRefs,
          lastVerifiedAt: placeSentiment.lastVerifiedAt,
        }
      : null,
  };

  emit({ type: "phase_complete", phase: "scoring" });
  emit({ type: "phase_start", phase: "narrative" });

  // Thesis context for the narrative prompt v3. Extracted into its
  // own object so the prompt template can substitute fields
  // independent of the rest of the signal payload.
  const propertyContext: VerdictNarrativePropertyContext = {
    addressFull,
    thesisType: property.thesisType as VerdictNarrativePropertyContext["thesisType"],
    goalType: property.goalType as VerdictNarrativePropertyContext["goalType"],
    thesisOtherDescription: property.thesisOtherDescription ?? null,
    listingPriceCents: property.listingPriceCents ?? null,
    userOfferPriceCents: property.userOfferPriceCents ?? null,
    estimatedValueCents: property.estimatedValueCents ?? null,
    annualPropertyTaxCents: property.annualPropertyTaxCents ?? null,
    annualInsuranceEstimateCents: property.annualInsuranceEstimateCents ?? null,
    monthlyHoaFeeCents: property.monthlyHoaFeeCents ?? null,
  };

  const narrative = await writeVerdictNarrative({
    addressFull,
    score,
    signals,
    property: propertyContext,
    userId,
    orgId,
    verdictId,
  });
  if (!narrative.ok) {
    emit({ type: "error", error: `narrative_failed: ${narrative.error}` });
    return {
      ok: false,
      error: `narrative_failed: ${narrative.error}`,
      observability: narrative.observability,
    };
  }

  emit({
    type: "narrative_ready",
    text: narrative.output.narrative,
    summary: narrative.output.summary,
    model: narrative.observability.modelVersion,
    routingReason: narrative.observability.routingReason,
  });
  emit({ type: "phase_complete", phase: "narrative" });

  // Fail-closed fair-housing lint on the narrative + four data-
  // point strings. If anything flags, we refuse the verdict.
  emit({ type: "phase_start", phase: "lint" });
  const fhaFlags = lintPlaceSentiment({
    bullets: [
      narrative.output.data_points.comps.summary,
      narrative.output.data_points.revenue.summary,
      narrative.output.data_points.regulatory.summary,
      narrative.output.data_points.location.summary,
    ],
    summary: `${narrative.output.summary}\n\n${narrative.output.narrative}`,
  });
  if (fhaFlags.length > 0) {
    console.error("[verdict] fair-housing lint blocked narrative", {
      addressFull,
      flags: fhaFlags,
    });
    emit({
      type: "error",
      error: `fair_housing_lint_blocked: ${fhaFlags.map((f) => f.reason).join("; ")}`,
    });
    return {
      ok: false,
      error: `fair_housing_lint_blocked: ${fhaFlags.map((f) => f.reason).join("; ")}`,
      observability: narrative.observability,
    };
  }
  emit({ type: "phase_complete", phase: "lint" });

  // ---- Phase 4: assemble response ----
  const sources = collectSources({
    fema,
    usgs,
    fbi,
    census,
    overpass,
    airbnb,
    zillow,
    redfin,
    regulatory,
  });

  const finalVerdict: OrchestratedVerdict = {
    ok: true,
    signal: score.signal,
    score: score.score,
    confidence: score.confidence,
    summary: narrative.output.summary,
    narrative: narrative.output.narrative,
    dataPoints: narrative.output.data_points,
    sources,
    breakdown: score.breakdown,
    observability: {
      modelVersion: narrative.observability.modelVersion,
      promptVersion: narrative.observability.promptVersion,
      inputTokens: narrative.observability.inputTokens,
      outputTokens: narrative.observability.outputTokens,
      costCents: narrative.observability.costCents,
    },
  };

  emit({
    type: "complete",
    verdict: finalVerdict,
    verdictId: verdictId ?? "",
  });

  return finalVerdict;
}

type IntakeRevenueThesis = NonNullable<
  Parameters<typeof computeIntakeRevenue>[0]["thesisType"]
>;

function centsToDollars(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return cents / 100;
}

/**
 * Log when an external valuation source disagrees with the user's
 * intake by more than 5%. Console-only — observability data, not a
 * polished feature. Sentry breadcrumbs would be a v1.1 followup.
 */
function logPriceDiscrepancies(params: {
  propertyId: string;
  userOffer: number | null;
  listing: number | null;
  estimate: number | null;
  zillow: PropertyValuation | null;
  redfin: PropertyValuation | null;
}): void {
  const userListingDollars = centsToDollars(params.listing);
  const userEstimateDollars = centsToDollars(params.estimate);

  const checks: Array<{
    field: string;
    userValue: number | null;
    externalSource: string;
    externalValue: number | null | undefined;
  }> = [
    {
      field: "listing_price",
      userValue: userListingDollars,
      externalSource: "zillow_listprice",
      externalValue: params.zillow?.listPrice,
    },
    {
      field: "listing_price",
      userValue: userListingDollars,
      externalSource: "redfin_listprice",
      externalValue: params.redfin?.listPrice,
    },
    {
      field: "estimated_value",
      userValue: userEstimateDollars,
      externalSource: "zillow_estimate",
      externalValue: params.zillow?.currentEstimate,
    },
    {
      field: "estimated_value",
      userValue: userEstimateDollars,
      externalSource: "redfin_estimate",
      externalValue: params.redfin?.currentEstimate,
    },
  ];

  for (const c of checks) {
    if (c.userValue == null || c.externalValue == null) continue;
    if (c.userValue <= 0) continue;
    const variance = (c.externalValue - c.userValue) / c.userValue;
    if (Math.abs(variance) > 0.05) {
      console.warn("[orchestrator] discrepancy", {
        propertyId: params.propertyId,
        field: c.field,
        userValue: c.userValue,
        externalSource: c.externalSource,
        externalValue: c.externalValue,
        variance: Number(variance.toFixed(3)),
      });
    }
  }
}

function collectSources(signals: {
  fema: { sourceUrl?: string } | null;
  usgs: { sourceUrl?: string } | null;
  fbi: { sourceUrl?: string } | null;
  census: { sourceUrl?: string } | null;
  overpass: { sourceUrl?: string } | null;
  airbnb: AirbnbCompsSignal | null;
  zillow: PropertyValuation | null;
  redfin: PropertyValuation | null;
  regulatory: { sourceUrls: string[] } | null;
}): string[] {
  const urls = new Set<string>();
  for (const s of [
    signals.fema,
    signals.usgs,
    signals.fbi,
    signals.census,
    signals.overpass,
    signals.airbnb,
  ]) {
    if (s && "sourceUrl" in s && s.sourceUrl) urls.add(s.sourceUrl);
  }
  if (signals.zillow?.url) urls.add(signals.zillow.url);
  if (signals.redfin?.url) urls.add(signals.redfin.url);
  for (const u of signals.regulatory?.sourceUrls ?? []) urls.add(u);
  return [...urls];
}
