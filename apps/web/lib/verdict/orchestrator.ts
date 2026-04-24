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
import { scoreVerdict, writeVerdictNarrative, type VerdictScore } from "@dwellverdict/ai";

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
}): Promise<OrchestratedVerdict | OrchestratedVerdictFailure> {
  const { addressFull, city, state, lat, lng } = input;
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
    getAirbnbCompsSignal(db, lat, lng),
    getZillowValuationSignal(db, addressFull),
    getRedfinValuationSignal(db, addressFull),
    getRegulatorySignal({ city, state }),
    getPlaceSentimentSignal({ lat, lng }),
  ]);

  // Unpack with null fallbacks so downstream can degrade gracefully.
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
  });
  if (!narrative.ok) {
    return {
      ok: false,
      error: `narrative_failed: ${narrative.error}`,
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
