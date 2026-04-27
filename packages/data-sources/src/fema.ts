import { coordKey, TTL, withCache, type DbClient } from "./cache";
import {
  FemaFloodSignalSchema,
  type FemaFloodSignal,
  type SignalResult,
} from "./types";

/**
 * FEMA National Flood Hazard Layer (NFHL) client per ADR-6.
 *
 * Endpoint: FEMA's ArcGIS REST service exposes flood-hazard polygons
 * queryable by point geometry. Returns the flood zone, SFHA flag,
 * and base flood elevation for a lat/lng.
 *
 * Free, no API key required. Rate limits are generous; we still
 * cache for 30 days per ADR-6 because flood-zone boundaries change
 * rarely (LOMA/LOMR revisions are months apart).
 *
 * Docs: https://msc.fema.gov/portal/resources/feature-service
 * Service: https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query
 *
 * NFHL layer 28 is the Flood Hazard Zones layer. The `geometry`
 * query param accepts a point in EPSG:4326; we ask for the FLD_ZONE
 * (zone code), SFHA_TF (Y/N), and STATIC_BFE fields.
 */

// FEMA's canonical NFHL ArcGIS service is alive at
// `hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer`.
// Layer 28 is "Flood Hazard Zones" (FLD_ZONE / SFHA_TF / STATIC_BFE
// fields per the layer metadata). M3.7 diagnostic confirmed the
// `services.arcgis.com/HAJAw18hMX4YJMdE/...FeatureServer` path the
// pre-M3.7 code pointed at returns 400 "Invalid URL" for every
// query — that hosted FeatureServer was never the canonical home;
// the migration claim in the prior comment was incorrect. Layer 27
// is kept as a fallback (FEMA's "Flood Hazard Boundaries" layer
// has the same FLD_ZONE attribute, useful when a coord falls on a
// boundary polygon rather than a zone polygon).
const NFHL_QUERY_URLS = [
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/27/query",
];
const SOURCE_URL = "https://msc.fema.gov/portal/";

export async function fetchFemaFlood(
  lat: number,
  lng: number,
): Promise<FemaFloodSignal> {
  let lastError = "FEMA NFHL: no endpoint tried";
  for (const base of NFHL_QUERY_URLS) {
    const url = new URL(base);
    url.searchParams.set("f", "json");
    url.searchParams.set("geometry", JSON.stringify({ x: lng, y: lat }));
    url.searchParams.set("geometryType", "esriGeometryPoint");
    url.searchParams.set("inSR", "4326");
    url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
    url.searchParams.set(
      "outFields",
      "FLD_ZONE,SFHA_TF,STATIC_BFE,ZONE_SUBTY",
    );
    url.searchParams.set("returnGeometry", "false");

    const res = await fetch(url, {
      headers: {
        "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError = `FEMA NFHL ${res.status} at ${base}${
        body ? `: ${body.slice(0, 200)}` : ""
      }`;
      continue;
    }
    const text = await res.text();
    // Esri sometimes 200s with a JSON-wrapped error instead of 4xx.
    if (text.includes('"error"') && !text.includes('"features"')) {
      lastError = `FEMA NFHL returned error payload at ${base}: ${text.slice(0, 200)}`;
      continue;
    }
    return parseFemaResponse(text);
  }
  throw new Error(lastError);
}

function parseFemaResponse(text: string): FemaFloodSignal {
  const payload = JSON.parse(text) as {
    features?: Array<{
      attributes: {
        FLD_ZONE?: string | null;
        SFHA_TF?: string | null;
        STATIC_BFE?: number | null;
        ZONE_SUBTY?: string | null;
      };
    }>;
  };

  // A point may hit multiple polygons (zone + subtype). Pick the
  // most specific — zone codes like 'AE' beat generic 'X'. Simple
  // heuristic: prefer any feature with an SFHA=Y flag; fall back
  // to the first feature.
  const feature =
    payload.features?.find(
      (f) => (f.attributes.SFHA_TF ?? "").toUpperCase() === "T",
    ) ?? payload.features?.[0];

  const zone = feature?.attributes.FLD_ZONE ?? null;
  const sfha =
    (feature?.attributes.SFHA_TF ?? "").toUpperCase() === "T";
  // STATIC_BFE returns the sentinel -9999.0 for "not applicable"
  // (zones outside the SFHA, panels without elevation data). Treat
  // any non-positive BFE as null so it doesn't surface in the
  // narrative as "Base Flood Elevation: -9999 ft".
  const rawBfe = feature?.attributes.STATIC_BFE ?? null;
  const bfe = rawBfe != null && rawBfe > 0 ? rawBfe : null;

  const summary = buildFemaSummary({ zone, sfha, bfe });

  return FemaFloodSignalSchema.parse({
    floodZone: zone,
    sfha,
    bfeFeet: bfe,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

function buildFemaSummary(params: {
  zone: string | null;
  sfha: boolean;
  bfe: number | null;
}): string {
  if (!params.zone) {
    return "No FEMA flood-zone polygon intersects this point. Outside the mapped floodplain.";
  }
  if (!params.sfha) {
    return `Flood zone ${params.zone} — minimal flood risk per FEMA NFHL. Flood insurance not federally required.`;
  }
  const bfeText = params.bfe != null ? ` Base Flood Elevation: ${params.bfe} ft.` : "";
  return `Flood zone ${params.zone} (Special Flood Hazard Area). Flood insurance federally required for federally-backed mortgages.${bfeText}`;
}

/**
 * Cached + wrapped entry point for the verdict orchestrator.
 */
export async function getFemaFloodSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<FemaFloodSignal>> {
  try {
    const data = await withCache({
      db,
      source: "fema",
      cacheKey: coordKey(lat, lng),
      ttlMs: TTL.FEMA,
      fetch: () => fetchFemaFlood(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "fema",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "fema",
    };
  }
}
