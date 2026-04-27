import { coordKey, TTL, withCache, type DbClient } from "./cache";
import {
  UsgsWildfireSignalSchema,
  type UsgsWildfireSignal,
  type SignalResult,
} from "./types";

/**
 * USGS / NIFC Historic Wildfire Perimeters client per ADR-6.
 *
 * NIFC publishes the consolidated US wildfire perimeter dataset as
 * a public ArcGIS Feature Service. We query for fires within a
 * 5-mile radius of the target lat/lng to measure wildfire exposure
 * — not definitive (a one-time fire N years ago doesn't mean
 * future risk), but a useful signal alongside flood zone.
 *
 * Free, no API key required. 30-day TTL — the dataset updates a
 * few times per year.
 *
 * Service (M3.7 fix): the canonical home for the multi-year
 * perimeter history is the InterAgencyFirePerimeterHistory view.
 * The pre-M3.7 endpoint at `US_Wildfires_v1/FeatureServer/0` was
 * retired and returns 400 "Invalid URL" today. The view below has
 * the same shape but renamed fields (INCIDENT, GIS_ACRES,
 * FIRE_YEAR_INT) — see parser below.
 */

const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/InterAgencyFirePerimeterHistory_All_Years_View/FeatureServer/0/query";
const SOURCE_URL =
  "https://data-nifc.opendata.arcgis.com/datasets/nifc::interagencyfireperimeterhistory-all-years-view";
const RADIUS_MILES = 5;

export async function fetchUsgsWildfire(
  lat: number,
  lng: number,
): Promise<UsgsWildfireSignal> {
  const url = new URL(NIFC_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("geometry", JSON.stringify({ x: lng, y: lat }));
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("distance", String(RADIUS_MILES));
  url.searchParams.set("units", "esriSRUnit_StatuteMile");
  // M3.7 field rename: the InterAgencyFirePerimeterHistory view
  // exposes INCIDENT / GIS_ACRES / FIRE_YEAR_INT (the prior
  // US_Wildfires_v1 layer used IncidentName / GISAcres /
  // FireDiscoveryDateTime). FIRE_YEAR_INT is already an integer
  // year, so we don't need date parsing.
  url.searchParams.set("outFields", "INCIDENT,GIS_ACRES,FIRE_YEAR_INT");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "500");

  const res = await fetch(url, {
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`USGS/NIFC responded ${res.status}`);
  }

  const payload = (await res.json()) as {
    features?: Array<{
      attributes: {
        INCIDENT?: string | null;
        GIS_ACRES?: number | null;
        FIRE_YEAR_INT?: number | null;
      };
    }>;
  };

  const features = payload.features ?? [];
  const acres = features
    .map((f) => f.attributes.GIS_ACRES ?? 0)
    .filter((a) => a > 0);
  const years = features
    .map((f) => {
      const y = f.attributes.FIRE_YEAR_INT;
      return typeof y === "number" && y > 1900 && y < 2100 ? y : null;
    })
    .filter((y): y is number => y !== null);

  const nearbyFireCount = features.length;
  const largestNearbyAcres = acres.length > 0 ? Math.max(...acres) : null;
  const mostRecentYear = years.length > 0 ? Math.max(...years) : null;

  const summary = buildUsgsSummary({
    nearbyFireCount,
    largestNearbyAcres,
    mostRecentYear,
  });

  return UsgsWildfireSignalSchema.parse({
    nearbyFireCount,
    largestNearbyAcres,
    mostRecentYear,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

function buildUsgsSummary(p: {
  nearbyFireCount: number;
  largestNearbyAcres: number | null;
  mostRecentYear: number | null;
}): string {
  if (p.nearbyFireCount === 0) {
    return `No recorded wildfires within ${RADIUS_MILES} miles in NIFC data.`;
  }
  const acresText =
    p.largestNearbyAcres != null
      ? ` Largest nearby fire: ${Math.round(p.largestNearbyAcres).toLocaleString()} acres.`
      : "";
  const yearText = p.mostRecentYear != null ? ` Most recent: ${p.mostRecentYear}.` : "";
  return `${p.nearbyFireCount} wildfire${p.nearbyFireCount === 1 ? "" : "s"} within ${RADIUS_MILES} miles per NIFC.${acresText}${yearText}`;
}

export async function getUsgsWildfireSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<UsgsWildfireSignal>> {
  try {
    const data = await withCache({
      db,
      source: "usgs",
      cacheKey: coordKey(lat, lng),
      ttlMs: TTL.USGS,
      fetch: () => fetchUsgsWildfire(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "usgs",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "usgs",
    };
  }
}
