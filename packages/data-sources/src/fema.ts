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

const NFHL_URL =
  "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query";
const SOURCE_URL = "https://msc.fema.gov/portal/";

export async function fetchFemaFlood(
  lat: number,
  lng: number,
): Promise<FemaFloodSignal> {
  const url = new URL(NFHL_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("geometry", JSON.stringify({ x: lng, y: lat }));
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "FLD_ZONE,SFHA_TF,STATIC_BFE,ZONE_SUBTY");
  url.searchParams.set("returnGeometry", "false");

  const res = await fetch(url, {
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
      accept: "application/json",
    },
    // Respectful timeout — NFHL is usually fast (<1s) but can spike.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`FEMA NFHL responded ${res.status}`);
  }

  const payload = (await res.json()) as {
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
  const bfe = feature?.attributes.STATIC_BFE ?? null;

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
