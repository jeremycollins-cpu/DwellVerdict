import { coordKey, TTL, withCache, type DbClient } from "./cache";
import {
  UsgsWildfireSignalSchema,
  type UsgsWildfireSignal,
  type SignalResult,
} from "./types";

/**
 * USGS / NIFC Historic Wildfire Perimeters client per ADR-6.
 *
 * USGS ScienceBase hosts the consolidated US wildfire perimeter
 * dataset with a public ArcGIS REST endpoint. We query for fires
 * within a 5-mile radius of the target lat/lng to measure wildfire
 * exposure — not definitive (a one-time fire N years ago doesn't
 * mean future risk), but a useful signal alongside flood zone.
 *
 * Free, no API key required. 30-day TTL — the dataset updates a
 * few times per year.
 *
 * Service:
 *   https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/
 *   WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query
 *
 * For historical perimeters (multi-year), the NIFC dataset is
 * authoritative:
 *   https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-
 *   interagency-fire-perimeters-in-gacc/about
 *
 * We use the broader historical service for v0. If latency becomes
 * an issue we can switch to the year-to-date service (smaller but
 * enough for "anything burned here recently?").
 */

const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/US_Wildfires_v1/FeatureServer/0/query";
const SOURCE_URL =
  "https://data-nifc.opendata.arcgis.com/datasets/us-wildfires";
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
  url.searchParams.set("outFields", "IncidentName,GISAcres,FireDiscoveryDateTime");
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
        IncidentName?: string | null;
        GISAcres?: number | null;
        FireDiscoveryDateTime?: number | string | null;
      };
    }>;
  };

  const features = payload.features ?? [];
  const acres = features
    .map((f) => f.attributes.GISAcres ?? 0)
    .filter((a) => a > 0);
  const years = features
    .map((f) => {
      const raw = f.attributes.FireDiscoveryDateTime;
      if (!raw) return null;
      const d = typeof raw === "number" ? new Date(raw) : new Date(raw);
      return isNaN(d.getTime()) ? null : d.getUTCFullYear();
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
