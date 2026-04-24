import { coordKey, TTL, withCache, type DbClient } from "./cache";
import {
  FbiCrimeSignalSchema,
  type FbiCrimeSignal,
  type SignalResult,
} from "./types";

/**
 * FBI Crime Data Explorer (CDE) client per ADR-6.
 *
 * v0 implementation is state-level: we resolve the state from the
 * Census geocoder, then pull the FBI's state-level annual estimate.
 * City-level precision requires resolving the primary police
 * agency's ORI code for the address, which is a complex join we
 * don't have the geocoding for yet. State-level is coarser but
 * real and non-misleading — the UI surfaces "Tennessee violent
 * crime rate: X per 1K" not "Nashville violent crime rate: X"
 * so users understand the scope.
 *
 * Needs a free API key from https://api.data.gov/signup/ in the
 * `FBI_API_KEY` env var. Without it, the client returns an error
 * result and the verdict orchestrator degrades gracefully.
 *
 * TTL: 30 days. FBI data updates annually but coverage revisions
 * can land mid-year.
 */

const FBI_BASE = "https://api.usa.gov/crime/fbi/cde";
const SOURCE_URL = "https://cde.ucr.cjis.gov/";

// Map Census state FIPS codes to postal abbreviations. FBI endpoints
// use abbr, Census returns FIPS, so we need the cross-walk.
const STATE_FIPS_TO_ABBR: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
  "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
  "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

/** Resolve lat/lng → state abbreviation via the Census geocoder. */
async function geocodeToStateAbbr(lat: number, lng: number): Promise<string | null> {
  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/geographies/coordinates",
  );
  url.searchParams.set("x", lng.toString());
  url.searchParams.set("y", lat.toString());
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");
  url.searchParams.set("layers", "States");

  const res = await fetch(url, {
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as {
    result?: { geographies?: { States?: Array<{ STATE?: string }> } };
  };
  const fips = payload.result?.geographies?.States?.[0]?.STATE;
  return fips ? (STATE_FIPS_TO_ABBR[fips] ?? null) : null;
}

export async function fetchFbiCrime(
  lat: number,
  lng: number,
): Promise<FbiCrimeSignal> {
  const apiKey = process.env.FBI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FBI_API_KEY not set. Get a free key at https://api.data.gov/signup/",
    );
  }

  const stateAbbr = await geocodeToStateAbbr(lat, lng);
  if (!stateAbbr) throw new Error("Could not resolve state from coordinates");

  // Latest-year-available window (we don't know what year FBI has
  // loaded, so walk backwards from "two years ago" to avoid
  // requesting an incomplete year). v0 pulls a 1-year window for
  // simplicity.
  const year = new Date().getUTCFullYear() - 2;

  // Violent crime rate (offense = V) and property crime rate (P)
  // at state level. CDE endpoint shape:
  // /estimate/state/{abbr}/{offense}?API_KEY=...&from=...&to=...
  // NOTE: FBI CDE's estimate endpoint shape has changed a few
  // times; if the specific URL below 4xx's, fall back to the
  // cleaner /summarized/state/{abbr}/{offense} path or update
  // the base URL here.
  const violentRate = await fetchStateOffense(stateAbbr, "V", year, apiKey);
  const propertyRate = await fetchStateOffense(stateAbbr, "P", year, apiKey);

  const totalPer1k = (violentRate ?? 0) + (propertyRate ?? 0);

  const summary = buildFbiSummary({
    stateAbbr,
    year,
    violent: violentRate,
    property: propertyRate,
  });

  return FbiCrimeSignalSchema.parse({
    ori: `state:${stateAbbr}`,
    agencyName: `${stateAbbr} statewide (FBI UCR)`,
    year,
    violentPer1k: violentRate ?? 0,
    propertyPer1k: propertyRate ?? 0,
    totalPer1k,
    metroViolentPer1k: null, // city-level not implemented in v0
    metroPropertyPer1k: null,
    summary,
    sourceUrl: SOURCE_URL,
  });
}

async function fetchStateOffense(
  stateAbbr: string,
  offense: "V" | "P",
  year: number,
  apiKey: string,
): Promise<number | null> {
  const url = new URL(`${FBI_BASE}/estimate/state/${stateAbbr}/${offense}`);
  url.searchParams.set("from", `01-${year}`);
  url.searchParams.set("to", `12-${year}`);
  url.searchParams.set("API_KEY", apiKey);

  const res = await fetch(url, {
    headers: {
      "user-agent": "ParcelBot/1.0 (+https://dwellverdict.com/bot)",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as {
    results?: Array<{ rate?: number; year?: number }>;
  };
  // Rate is per 100K per FBI convention; convert to per 1K.
  const rate = payload.results?.[0]?.rate;
  if (typeof rate !== "number") return null;
  return rate / 100;
}

function buildFbiSummary(p: {
  stateAbbr: string;
  year: number;
  violent: number | null;
  property: number | null;
}): string {
  if (p.violent == null && p.property == null) {
    return `FBI crime data unavailable for ${p.stateAbbr} in ${p.year}.`;
  }
  const v = p.violent != null ? p.violent.toFixed(1) : "—";
  const prop = p.property != null ? p.property.toFixed(1) : "—";
  return (
    `${p.stateAbbr} (${p.year}): ${v} violent / ${prop} property per 1,000 residents (FBI UCR). ` +
    "State-level — local agency precision not yet available."
  );
}

export async function getFbiCrimeSignal(
  db: DbClient,
  lat: number,
  lng: number,
): Promise<SignalResult<FbiCrimeSignal>> {
  try {
    const data = await withCache({
      db,
      source: "fbi",
      cacheKey: coordKey(lat, lng),
      ttlMs: TTL.FBI,
      fetch: () => fetchFbiCrime(lat, lng),
    });
    return {
      ok: true,
      data,
      source: "fbi",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "fbi",
    };
  }
}
