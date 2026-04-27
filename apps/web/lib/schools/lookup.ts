import "server-only";

import {
  TTL,
  withCache,
  SchoolsSignalSchema,
  type DbClient,
  type SchoolsSignal,
} from "@dwellverdict/data-sources";
import { lookupSchools } from "@dwellverdict/ai";

/**
 * Schools fetcher wrapper (M3.10).
 *
 * Wraps the LLM-backed `lookupSchools` task with the shared
 * `data_source_cache` (90-day TTL, source = `schools`, key =
 * `${state}:${city}` lowercased). On cache hit, no AI call —
 * cost-free read. On cache miss, Haiku is called once for the
 * city; subsequent properties in the same city for the next 90
 * days reuse that single lookup.
 *
 * Returns the full `SchoolsSignal` envelope (`{ ok: true, data,
 * source, fetchedAt }` or `{ ok: false, error, source }`) so the
 * orchestrator can drop it into the `signal_complete` log line
 * shape without further wrapping.
 */
export type SchoolsResult =
  | { ok: true; data: SchoolsSignal; source: "schools"; fetchedAt: string }
  | { ok: false; error: string; source: "schools" };

export async function getSchoolsSignal(params: {
  db: DbClient;
  city: string;
  state: string;
  /** Optional userId so the LLM call (cache miss path) is logged
   *  to ai_usage_events. Cache hits don't reach this code at all. */
  userId?: string;
  orgId?: string;
  verdictId?: string;
}): Promise<SchoolsResult> {
  const { db, city, state, userId, orgId, verdictId } = params;

  if (!city || !state) {
    return {
      ok: false,
      error: "schools: city and state are required",
      source: "schools",
    };
  }

  const cacheKey = `${state.toLowerCase()}:${city.toLowerCase()}`;

  try {
    const data = await withCache({
      db,
      source: "schools",
      cacheKey,
      ttlMs: TTL.SCHOOLS,
      fetch: async () => {
        const result = await lookupSchools({
          city,
          state,
          userId,
          orgId,
          verdictId,
        });
        if (!result.ok) {
          throw new Error(result.error);
        }
        // Map snake_case LLM output → camelCase signal shape +
        // attach metadata. The Zod parse catches any drift.
        const out = result.output;
        const signal: SchoolsSignal = SchoolsSignalSchema.parse({
          city,
          state: state.toUpperCase(),
          elementarySchools: out.elementary_schools,
          middleSchools: out.middle_schools,
          highSchools: out.high_schools,
          districtSummary: out.district_summary ?? null,
          notableFactors: out.notable_factors,
          dataQuality: out.data_quality,
          summary: buildSchoolsSummary(out, city, state),
          sourceUrl: `https://www.greatschools.org/search/search.page?q=${encodeURIComponent(city)}%2C+${state}`,
        });
        return signal;
      },
    });
    return {
      ok: true,
      data,
      source: "schools",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      source: "schools",
    };
  }
}

/**
 * One-line summary the narrative prompt and UI use as a fallback
 * when they don't want to compose from individual schools. Mirrors
 * the pattern other signals use (FEMA / USGS / Census all build a
 * `summary` string in their fetcher).
 */
function buildSchoolsSummary(
  out: {
    elementary_schools: Array<{ rating?: number }>;
    middle_schools: Array<{ rating?: number }>;
    high_schools: Array<{ rating?: number }>;
    data_quality: "rich" | "partial" | "unavailable";
  },
  city: string,
  state: string,
): string {
  if (out.data_quality === "unavailable") {
    return `School quality data unavailable for ${city}, ${state}.`;
  }
  const median = (entries: Array<{ rating?: number }>): number | null => {
    const ratings = entries
      .map((e) => e.rating)
      .filter((r): r is number => typeof r === "number");
    if (ratings.length === 0) return null;
    ratings.sort((a, b) => a - b);
    const mid = Math.floor(ratings.length / 2);
    return ratings.length % 2
      ? ratings[mid]!
      : (ratings[mid - 1]! + ratings[mid]!) / 2;
  };
  const e = median(out.elementary_schools);
  const m = median(out.middle_schools);
  const h = median(out.high_schools);
  const parts: string[] = [];
  if (e != null) parts.push(`Elementary ${e.toFixed(1)}/10`);
  if (m != null) parts.push(`Middle ${m.toFixed(1)}/10`);
  if (h != null) parts.push(`High ${h.toFixed(1)}/10`);
  if (parts.length === 0) {
    return `${city}, ${state}: schools data partial — no median ratings available.`;
  }
  return `${city}, ${state} median school ratings: ${parts.join(" · ")}.`;
}
