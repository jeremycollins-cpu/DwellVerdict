import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type {
  RegulatoryCacheRow,
  RegulatoryThesisDimension,
} from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { regulatoryCache } = schema;

/** 30-day TTL per ADR-6. */
export const REGULATORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Lookup a cached regulatory record by (city, state, thesis_dimension).
 * Returns the row whether fresh or stale — caller decides whether
 * to refresh.
 */
export async function getRegulatoryCacheRow(params: {
  city: string;
  state: string;
  thesisDimension: RegulatoryThesisDimension;
}): Promise<RegulatoryCacheRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(regulatoryCache)
    .where(
      and(
        eq(regulatoryCache.city, normalizeCity(params.city)),
        eq(regulatoryCache.state, normalizeState(params.state)),
        eq(regulatoryCache.thesisDimension, params.thesisDimension),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function isRegulatoryCacheFresh(row: RegulatoryCacheRow): boolean {
  return row.expiresAt > new Date();
}

/**
 * Upsert a regulatory record. Called after lookupRegulatory()
 * succeeds; sets last_verified_at to now and rolls expires_at
 * forward by the TTL.
 *
 * Per-thesis structured fields land in two columns: STR-specific
 * fields go into the legacy typed columns (str_legal etc.) for
 * backwards-compat with existing reads; non-STR theses leave those
 * NULL and persist their structured shape under
 * thesis_specific_fields jsonb.
 */
export async function upsertRegulatoryCacheRow(params: {
  city: string;
  state: string;
  thesisDimension: RegulatoryThesisDimension;
  // STR-typed columns — populated only when thesisDimension='str'.
  strLegal?: "yes" | "restricted" | "no" | "unclear" | null;
  permitRequired?: "yes" | "no" | "unclear" | null;
  ownerOccupiedOnly?: "yes" | "no" | "depends" | "unclear" | null;
  capOnNonOwnerOccupied?: string | null;
  renewalFrequency?: "annual" | "biennial" | "none" | null;
  minimumStayDays?: number | null;
  // Thesis-specific structured shape — anything that isn't the
  // shared trailer (summary, sources, notable_factors). Nullable
  // for STR rows where the typed columns hold the data instead.
  thesisSpecificFields?: Record<string, unknown> | null;
  notableFactors: string[];
  summary: string;
  sourceUrls: string[];
  r2SnapshotKeys?: string[];
  modelVersion: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REGULATORY_TTL_MS);

  const isStr = params.thesisDimension === "str";
  const strLegal = isStr ? (params.strLegal ?? null) : null;
  const permitRequired = isStr ? (params.permitRequired ?? null) : null;
  const ownerOccupiedOnly = isStr ? (params.ownerOccupiedOnly ?? null) : null;
  const capOnNonOwnerOccupied = isStr
    ? (params.capOnNonOwnerOccupied ?? null)
    : null;
  const renewalFrequency = isStr ? (params.renewalFrequency ?? null) : null;
  const minimumStayDays = isStr ? (params.minimumStayDays ?? null) : null;

  await db
    .insert(regulatoryCache)
    .values({
      city: normalizeCity(params.city),
      state: normalizeState(params.state),
      thesisDimension: params.thesisDimension,
      strLegal,
      permitRequired,
      ownerOccupiedOnly,
      capOnNonOwnerOccupied,
      renewalFrequency,
      minimumStayDays,
      thesisSpecificFields: params.thesisSpecificFields ?? null,
      notableFactors: params.notableFactors,
      summary: params.summary,
      sourceUrls: params.sourceUrls,
      r2SnapshotKeys: params.r2SnapshotKeys ?? [],
      modelVersion: params.modelVersion,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costCents: params.costCents,
      lastVerifiedAt: now,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        regulatoryCache.city,
        regulatoryCache.state,
        regulatoryCache.thesisDimension,
      ],
      set: {
        strLegal,
        permitRequired,
        ownerOccupiedOnly,
        capOnNonOwnerOccupied,
        renewalFrequency,
        minimumStayDays,
        thesisSpecificFields: params.thesisSpecificFields ?? null,
        notableFactors: params.notableFactors,
        summary: params.summary,
        sourceUrls: params.sourceUrls,
        r2SnapshotKeys: params.r2SnapshotKeys ?? [],
        modelVersion: params.modelVersion,
        promptVersion: params.promptVersion,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costCents: params.costCents,
        lastVerifiedAt: now,
        expiresAt,
        updatedAt: sql`NOW()`,
      },
    });
}

/**
 * Normalize city names so "Nashville" and "nashville" hit the
 * same cache row. Lowercased + trimmed — we don't try to
 * canonicalize further (e.g., "Saint Louis" vs "St. Louis")
 * because the LLM is tolerant of either and we'd rather over-
 * cache than under-cache in this pass.
 */
function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function normalizeState(state: string): string {
  return state.trim().toUpperCase();
}
