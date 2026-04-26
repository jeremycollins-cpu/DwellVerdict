import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { Verdict } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { verdicts } = schema;

/**
 * Insert a pending verdict row and return its id. Done before the
 * Anthropic call so the UI can render a loading skeleton bound to a
 * real DB row. The route handler that performs generation updates
 * this row in place with status='ready' + the payload (or 'failed' +
 * error_message).
 */
export async function createPendingVerdict(params: {
  orgId: string;
  propertyId: string;
  createdByUserId: string;
  taskType?: string;
}): Promise<{ id: string }> {
  const db = getDb();
  const [row] = await db
    .insert(verdicts)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      createdByUserId: params.createdByUserId,
      status: "pending",
      taskType: params.taskType ?? "verdict_generation",
    })
    .returning({ id: verdicts.id });
  if (!row) throw new Error("pending verdict insert failed");
  return row;
}

/**
 * Write the final verdict payload and flip status to 'ready'.
 * Observability fields are required — CLAUDE.md non-negotiable.
 *
 * `scoreBreakdown` (M3.3) persists scoring.breakdown so the verdict
 * detail page can render "what moved the verdict" without
 * recomputing the rubric.
 */
export async function markVerdictReady(params: {
  verdictId: string;
  signal: "buy" | "watch" | "pass";
  confidence: number;
  summary: string;
  narrative: string;
  dataPoints: unknown;
  sources: string[];
  modelVersion: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  scoreBreakdown?: unknown;
}): Promise<void> {
  const db = getDb();
  await db
    .update(verdicts)
    .set({
      status: "ready",
      signal: params.signal,
      confidence: params.confidence,
      summary: params.summary,
      narrative: params.narrative,
      dataPoints: params.dataPoints,
      sources: params.sources,
      modelVersion: params.modelVersion,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costCents: params.costCents,
      scoreBreakdown: params.scoreBreakdown ?? null,
      completedAt: sql`now()`,
    })
    .where(eq(verdicts.id, params.verdictId));
}

/**
 * Flip a verdict to 'failed' with a human-readable reason. Keeps the
 * row for retry / observability instead of deleting — CLAUDE.md
 * "every AI output logs" rule applies to failures too.
 */
export async function markVerdictFailed(params: {
  verdictId: string;
  error: string;
  modelVersion?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
}): Promise<void> {
  const db = getDb();
  await db
    .update(verdicts)
    .set({
      status: "failed",
      errorMessage: params.error.slice(0, 2000),
      modelVersion: params.modelVersion,
      promptVersion: params.promptVersion,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costCents: params.costCents,
      completedAt: sql`now()`,
    })
    .where(eq(verdicts.id, params.verdictId));
}

/**
 * Load a verdict by id scoped to org. Returns null on not-found or
 * cross-org access — treat the two as equivalent for security.
 */
export async function getVerdictForOrg(params: {
  verdictId: string;
  orgId: string;
}): Promise<Verdict | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(verdicts)
    .where(and(eq(verdicts.id, params.verdictId), eq(verdicts.orgId, params.orgId)))
    .limit(1);
  return row ?? null;
}

/**
 * Return the latest verdict for a property. Used by the property
 * detail page to decide between "render ready verdict", "render
 * pending skeleton", or "render no-verdict state".
 */
export async function getLatestVerdictForProperty(params: {
  propertyId: string;
  orgId: string;
}): Promise<Verdict | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(verdicts)
    .where(and(eq(verdicts.propertyId, params.propertyId), eq(verdicts.orgId, params.orgId)))
    .orderBy(desc(verdicts.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Return all verdicts for a property, newest first. Used by the
 * M3.3 verdict-detail page's run history rail. Limit defaults to
 * 10 — the rail collapses additional rows behind a "View all"
 * link in the UI.
 */
export async function listVerdictsForProperty(params: {
  propertyId: string;
  orgId: string;
  limit?: number;
}): Promise<Verdict[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(verdicts)
    .where(
      and(
        eq(verdicts.propertyId, params.propertyId),
        eq(verdicts.orgId, params.orgId),
      ),
    )
    .orderBy(desc(verdicts.createdAt))
    .limit(params.limit ?? 10);
  return rows;
}
