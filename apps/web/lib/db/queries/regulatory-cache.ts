import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { RegulatoryCacheRow } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { regulatoryCache } = schema;

/** 30-day TTL per ADR-6. */
export const REGULATORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Lookup a cached regulatory record by (city, state). Returns the
 * row whether fresh or stale — caller decides whether to refresh.
 */
export async function getRegulatoryCacheRow(params: {
  city: string;
  state: string;
}): Promise<RegulatoryCacheRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(regulatoryCache)
    .where(
      and(
        eq(regulatoryCache.city, normalizeCity(params.city)),
        eq(regulatoryCache.state, normalizeState(params.state)),
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
 */
export async function upsertRegulatoryCacheRow(params: {
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

  await db
    .insert(regulatoryCache)
    .values({
      city: normalizeCity(params.city),
      state: normalizeState(params.state),
      strLegal: params.strLegal,
      permitRequired: params.permitRequired,
      ownerOccupiedOnly: params.ownerOccupiedOnly,
      capOnNonOwnerOccupied: params.capOnNonOwnerOccupied,
      renewalFrequency: params.renewalFrequency,
      minimumStayDays: params.minimumStayDays,
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
      target: [regulatoryCache.city, regulatoryCache.state],
      set: {
        strLegal: params.strLegal,
        permitRequired: params.permitRequired,
        ownerOccupiedOnly: params.ownerOccupiedOnly,
        capOnNonOwnerOccupied: params.capOnNonOwnerOccupied,
        renewalFrequency: params.renewalFrequency,
        minimumStayDays: params.minimumStayDays,
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
