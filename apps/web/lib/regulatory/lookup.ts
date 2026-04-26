import "server-only";

import {
  lookupRegulatory,
  type RegulatoryLookupOutput,
} from "@dwellverdict/ai";
import type { RegulatoryCacheRow } from "@dwellverdict/db";

import {
  getRegulatoryCacheRow,
  isRegulatoryCacheFresh,
  upsertRegulatoryCacheRow,
} from "@/lib/db/queries/regulatory-cache";

/**
 * Regulatory-signal orchestrator per ADR-6.
 *
 * Flow:
 *   - Cache hit + fresh → return cached row immediately. $0 AI cost.
 *   - Cache hit + stale (TTL expired) → return cached row
 *     immediately, enqueue a background refresh. v0 ships the
 *     synchronous refresh path (no Inngest yet) so the first
 *     caller after expiry pays the latency; subsequent callers
 *     hit fresh cache.
 *   - Cache miss → block, call Haiku + web_search, upsert, return.
 *
 * Output shape is a typed `RegulatorySignal` with `lastVerifiedAt`
 * so the UI can surface age and the "verify with city" disclaimer.
 */

export type RegulatorySignal =
  | {
      ok: true;
      fromCache: boolean;
      isStale: boolean;
      city: string;
      state: string;
      strLegal: "yes" | "restricted" | "no" | "unclear" | null;
      permitRequired: "yes" | "no" | "unclear" | null;
      ownerOccupiedOnly: "yes" | "no" | "depends" | "unclear" | null;
      capOnNonOwnerOccupied: string | null;
      renewalFrequency: "annual" | "biennial" | "none" | null;
      minimumStayDays: number | null;
      summary: string;
      sourceUrls: string[];
      lastVerifiedAt: string; // ISO
    }
  | { ok: false; error: string; city: string; state: string };

export async function getRegulatorySignal(params: {
  city: string;
  state: string;
  /** When set, the AI usage event is attributed to this user.
   *  Cache hits skip the AI call entirely so attribution only
   *  matters on cache miss. */
  userId?: string;
  orgId?: string;
}): Promise<RegulatorySignal> {
  const { city, state, userId, orgId } = params;

  const cached = await getRegulatoryCacheRow({ city, state });
  if (cached && isRegulatoryCacheFresh(cached)) {
    return rowToSignal({ row: cached, isStale: false });
  }

  // Cache miss OR stale: fetch live.
  // v0 synchronous refresh; Inngest background path is a TODO.
  const result = await lookupRegulatory({ city, state, userId, orgId });
  if (!result.ok) {
    // Degrade gracefully: if we have a stale cache row, return it
    // rather than erroring the caller. Some signal is better than
    // none, and the UI flags the age.
    if (cached) {
      return rowToSignal({ row: cached, isStale: true });
    }
    return { ok: false, error: result.error, city, state };
  }

  await upsertRegulatoryCacheRow({
    city,
    state,
    strLegal: result.output.str_legal,
    permitRequired: result.output.permit_required,
    ownerOccupiedOnly: result.output.owner_occupied_only,
    capOnNonOwnerOccupied: result.output.cap_on_non_oo,
    renewalFrequency: result.output.renewal_frequency,
    minimumStayDays: result.output.minimum_stay_days,
    summary: result.output.summary,
    sourceUrls: result.output.sources,
    modelVersion: result.observability.modelVersion,
    promptVersion: result.observability.promptVersion,
    inputTokens: result.observability.inputTokens,
    outputTokens: result.observability.outputTokens,
    costCents: result.observability.costCents,
  });

  return outputToSignal({ city, state, output: result.output });
}

function rowToSignal(params: {
  row: RegulatoryCacheRow;
  isStale: boolean;
}): RegulatorySignal {
  const { row, isStale } = params;
  return {
    ok: true,
    fromCache: true,
    isStale,
    city: row.city,
    state: row.state,
    strLegal: row.strLegal as "yes" | "restricted" | "no" | "unclear" | null,
    permitRequired: row.permitRequired as "yes" | "no" | "unclear" | null,
    ownerOccupiedOnly: row.ownerOccupiedOnly as
      | "yes"
      | "no"
      | "depends"
      | "unclear"
      | null,
    capOnNonOwnerOccupied: row.capOnNonOwnerOccupied,
    renewalFrequency: row.renewalFrequency as
      | "annual"
      | "biennial"
      | "none"
      | null,
    minimumStayDays: row.minimumStayDays,
    summary: row.summary ?? "",
    sourceUrls: Array.isArray(row.sourceUrls)
      ? (row.sourceUrls as string[])
      : [],
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
  };
}

function outputToSignal(params: {
  city: string;
  state: string;
  output: RegulatoryLookupOutput;
}): RegulatorySignal {
  return {
    ok: true,
    fromCache: false,
    isStale: false,
    city: params.city,
    state: params.state,
    strLegal: params.output.str_legal,
    permitRequired: params.output.permit_required,
    ownerOccupiedOnly: params.output.owner_occupied_only,
    capOnNonOwnerOccupied: params.output.cap_on_non_oo,
    renewalFrequency: params.output.renewal_frequency,
    minimumStayDays: params.output.minimum_stay_days,
    summary: params.output.summary,
    sourceUrls: params.output.sources,
    lastVerifiedAt: new Date().toISOString(),
  };
}
