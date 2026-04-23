import { coordKey, TTL, withCache, type DbClient } from "./cache";
import {
  CensusAcsSignalSchema,
  type CensusAcsSignal,
  type SignalResult,
} from "./types";

/**
 * US Census ACS (American Community Survey) client per ADR-6 +
 * fair-housing guardrails in ADR-7 and CLAUDE.md.
 *
 * Two-step lookup:
 *   1. Census Geocoder — lat/lng → census tract FIPS (free, no key)
 *   2. ACS 5-Year API — tract-level variables (free, API key required
 *      beyond ~500 requests/day per IP)
 *
 * Fair-housing non-negotiables enforced here:
 *   - Only neutral numeric variables (income, home value, vacancy)
 *   - NEVER race/ethnicity/religion variables (B02001, B03002, etc.)
 *   - All values surface with source URL so the user sees "median
 *     income $67K, per Census ACS 2023" not "this is a middle-class
 *     area"
 *
 * ACS variables we pull:
 *   B19013_001E  Median household income (past 12 months)
 *   B25077_001E  Median value for owner-occupied housing units
 *   B25002_003E  Vacant housing units
 *   B25002_001E  Total housing units
 *
 * TTL: 90 days. ACS 5-Year releases happen annually in December.
 */

const GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
const ACS_URL = "https://api.census.gov/data/2022/acs/acs5";
const SOURCE_URL =
  "https://data.census.gov/";

type TractFips = {
  stateFips: string;
  countyFips: string;
  tractCode: string;
};

async function geocodeToTract(lat: number, lng: number): Promise<TractFips | null> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set("x", lng.toString());
  url.searchParams.set("y", lat.toString());
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");
  url.searchParams.set("layers", "Census Tracts");

  const res = await fetch(url, {
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Census Geocoder responded ${res.status}`);

  const payload = (await res.json()) as {
    result?: {
      geographies?: {
        "Census Tracts"?: Array<{
          STATE?: string;
          COUNTY?: string;
          TRACT?: string;
        }>;
      };
    };
  };

  const tract = payload.result?.geographies?.["Census Tracts"]?.[0];
  if (!tract?.STATE || !tract.COUNTY || !tract.TRACT) return null;
  return {
    stateFips: tract.STATE,
    countyFips: tract.COUNTY,
    tractCode: tract.TRACT,
  };
}

export async function fetchCensusAcs(
  lat: number,
  lng: number,
): Promise<CensusAcsSignal> {
  const tract = await geocodeToTract(lat, lng);
  if (!tract) throw new Error("Census Geocoder returned no tract for this point");

  const vars = [
    "B19013_001E", // median household income
    "B25077_001E", // median home value
    "B25002_001E", // total housing units
    "B25002_003E", // vacant housing units
  ];

  const url = new URL(ACS_URL);
  url.searchParams.set("get", vars.join(","));
  url.searchParams.set(
    "for",
    `tract:${tract.tractCode}`,
  );
  url.searchParams.set(
    "in",
    `state:${tract.stateFips} county:${tract.countyFips}`,
  );
  const apiKey = process.env.CENSUS_API_KEY;
  if (apiKey) url.searchParams.set("key", apiKey);

  const res = await fetch(url, {
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Census ACS responded ${res.status}`);

  // ACS returns [header_row, data_row]. Header order matches our vars.
  const rows = (await res.json()) as string[][];
  const data = rows[1];
  if (!data) throw new Error("Census ACS returned empty data");

  const income = parseAcsNumber(data[0]);
  const homeValue = parseAcsNumber(data[1]);
  const totalUnits = parseAcsNumber(data[2]);
  const vacantUnits = parseAcsNumber(data[3]);

  const vacancyRate =
    totalUnits != null && totalUnits > 0 && vacantUnits != null
      ? vacantUnits / totalUnits
      : null;

  const summary = buildCensusSummary({
    income,
    homeValue,
    vacancyRate,
  });

  return CensusAcsSignalSchema.parse({
    stateFips: tract.stateFips,
    countyFips: tract.countyFips,
    tractCode: tract.tractCode,
    medianHouseholdIncome: income,
    medianHomeValue: homeValue,
    incomeChange5y: null, // requires 2 queries; v0 skips
    vacancyRate,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

/**
 * ACS uses sentinel negative values to mean "suppressed / no data".
 * Convert them to null before we surface anything.
 */
function parseAcsNumber(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function buildCensusSummary(p: {
  income: number | null;
  homeValue: number | null;
  vacancyRate: number | null;
}): string {
  const parts: string[] = [];
  if (p.income != null) {
    parts.push(`Median household income: $${Math.round(p.income).toLocaleString()}`);
  }
  if (p.homeValue != null) {
    parts.push(`Median home value: $${Math.round(p.homeValue).toLocaleString()}`);
  }
  if (p.vacancyRate != null) {
    parts.push(`Vacancy rate: ${(p.vacancyRate * 100).toFixed(1)}%`);
  }
  return parts.length > 0
    ? `Census tract-level data (ACS 5-Year): ${parts.join(" · ")}.`
    : "No Census ACS data available for this tract.";
}

export async function getCensusAcsSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<CensusAcsSignal>> {
  try {
    const data = await withCache({
      db,
      source: "census",
      cacheKey: coordKey(lat, lng),
      ttlMs: TTL.CENSUS,
      fetch: () => fetchCensusAcs(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "census",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "census",
    };
  }
}
