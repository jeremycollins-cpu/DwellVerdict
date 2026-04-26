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
  type AirbnbCompsSignal,
  type PropertyValuation,
} from "@dwellverdict/data-sources";
import {
  scoreVerdict,
  writeVerdictNarrative,
  lintPlaceSentiment,
  type VerdictScore,
} from "@dwellverdict/ai";

import { getDb } from "@/lib/db";
import { getRegulatorySignal } from "@/lib/regulatory/lookup";
import { getPlaceSentimentSignal } from "@/lib/place-sentiment/lookup";

/**
 * Rules-first verdict orchestrator per ADR-6.
 *
 * Flow:
 *   1. Fetch all free-data signals in parallel (cached, cheap).
 *   2. Fetch regulatory + place-sentiment LLM signals in parallel
 *      (each have their own cache; first hit per city/bucket is
 *      ~$0.03-0.05, subsequent hits ~$0).
 *   3. Compute revenue formula from Airbnb comps (deterministic).
 *   4. Run scoring rubric (deterministic).
 *   5. Call verdict-narrative Haiku task (~$0.005) to write the
 *      2-3 paragraph explanation.
 *   6. Return the composed verdict payload for the route handler
 *      to persist.
 *
 * Steady-state per-verdict cost: ~$0.005 (narrative only; other
 * signals cache-hit). Matches ADR-6's target.
 */

export type OrchestratedVerdict = {
  ok: true;
  signal: "buy" | "watch" | "pass";
  score: number;
  confidence: number;
  summary: string;
  narrative: string;
  dataPoints: {
    comps: string;
    revenue: string;
    regulatory: string;
    location: string;
  };
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

export async function orchestrateVerdict(input: {
  addressFull: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  /** Logged on every AI call inside the orchestrator (narrative,
   *  regulatory cache miss, place-sentiment cache miss) so cost
   *  events get attributed to the right user. */
  userId?: string;
  orgId?: string;
  /** Set on the verdict that triggered this orchestration. The
   *  narrative AI usage event will reference it; analytics surfaces
   *  pivot from a verdict to its underlying AI calls via this. */
  verdictId?: string;
}): Promise<OrchestratedVerdict | OrchestratedVerdictFailure> {
  const { addressFull, city, state, lat, lng, userId, orgId, verdictId } = input;
  const db = getDb();

  // ---- Phase 1: fetch everything in parallel ----
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
  ] = await Promise.all([
    getFemaFloodSignal(db, lat, lng),
    getUsgsWildfireSignal(db, lat, lng),
    getFbiCrimeSignal(db, lat, lng),
    getCensusAcsSignal(db, lat, lng),
    getOverpassSignal(db, lat, lng),
    getAirbnbCompsSignal(db, lat, lng, `${city}, ${state}`),
    getZillowValuationSignal(db, addressFull),
    getRedfinValuationSignal(db, addressFull),
    getRegulatorySignal({ city, state, userId, orgId }),
    getPlaceSentimentSignal({ lat, lng, userId, orgId }),
  ]);

  // Unpack with null fallbacks so downstream can degrade gracefully.
  // Log every signal's outcome — success/failure/empty — so we can
  // actually see in Vercel logs what happened for each property.
  // Without this, signal failures are invisible and we can't tell
  // a real data gap from a broken scraper.
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

  console.log("[verdict/orchestrator] signal summary", {
    addressFull,
    lat,
    lng,
    fema: femaResult.ok
      ? { ok: true, sfha: fema?.sfha }
      : { ok: false, error: femaResult.error },
    usgs: usgsResult.ok
      ? { ok: true, nearbyFireCount: usgs?.nearbyFireCount }
      : { ok: false, error: usgsResult.error },
    fbi: fbiResult.ok
      ? { ok: true, violentPer1k: fbi?.violentPer1k }
      : { ok: false, error: fbiResult.error },
    census: censusResult.ok
      ? { ok: true, medianIncome: census?.medianHouseholdIncome }
      : { ok: false, error: censusResult.error },
    overpass: overpassResult.ok
      ? { ok: true, walkScore: overpass?.walkScore }
      : { ok: false, error: overpassResult.error },
    airbnb: airbnbResult.ok
      ? {
          ok: true,
          compCount: airbnb?.comps.length ?? 0,
          median: airbnb?.medianNightlyRate,
        }
      : { ok: false, error: airbnbResult.error },
    zillow: zillowResult.ok
      ? {
          ok: true,
          listPrice: zillow?.listPrice,
          estimate: zillow?.currentEstimate,
        }
      : { ok: false, error: zillowResult.error },
    redfin: redfinResult.ok
      ? {
          ok: true,
          listPrice: redfin?.listPrice,
          estimate: redfin?.currentEstimate,
        }
      : { ok: false, error: redfinResult.error },
    regulatory: regulatorySignal.ok
      ? { ok: true, strLegal: regulatory?.strLegal }
      : { ok: false, error: regulatorySignal.error },
    placeSentiment: placeSentimentSignal.ok
      ? {
          ok: true,
          bulletCount: placeSentiment?.bullets.length ?? 0,
        }
      : { ok: false, error: placeSentimentSignal.error },
  });

  // ---- Phase 2: deterministic computation ----
  const revenue =
    airbnb && airbnb.comps.length > 0
      ? (() => {
          try {
            return computeRevenueEstimate({ comps: airbnb.comps });
          } catch {
            return null;
          }
        })()
      : null;

  const referencePrice =
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

  const narrative = await writeVerdictNarrative({
    addressFull,
    score,
    signals,
    userId,
    orgId,
    verdictId,
  });
  if (!narrative.ok) {
    return {
      ok: false,
      error: `narrative_failed: ${narrative.error}`,
      observability: narrative.observability,
    };
  }

  // Fail-closed fair-housing lint on the narrative + four data-
  // point strings. If anything flags, we refuse the verdict
  // rather than persist a potentially-FHA-problematic record.
  // The caller marks the verdict failed; user retries or we
  // iterate the prompt. Same pattern as place-sentiment.
  const fhaFlags = lintPlaceSentiment({
    bullets: [
      narrative.output.data_points.comps,
      narrative.output.data_points.revenue,
      narrative.output.data_points.regulatory,
      narrative.output.data_points.location,
    ],
    summary: `${narrative.output.summary}\n\n${narrative.output.narrative}`,
  });
  if (fhaFlags.length > 0) {
    console.error("[verdict] fair-housing lint blocked narrative", {
      addressFull,
      flags: fhaFlags,
    });
    return {
      ok: false,
      error: `fair_housing_lint_blocked: ${fhaFlags.map((f) => f.reason).join("; ")}`,
      observability: narrative.observability,
    };
  }

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

  return {
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
