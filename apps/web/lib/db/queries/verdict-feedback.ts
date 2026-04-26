import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type {
  VerdictFeedback,
  VerdictFeedbackIssueCategory,
  VerdictFeedbackRating,
} from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { verdictFeedback } = schema;

/**
 * Upsert a user's feedback on a verdict. The (user_id, verdict_id)
 * unique index lets us re-rate by overwriting in place.
 */
export async function upsertVerdictFeedback(params: {
  verdictId: string;
  userId: string;
  orgId?: string;
  rating: VerdictFeedbackRating;
  comment?: string;
  issueCategories?: VerdictFeedbackIssueCategory[];
  verdictSignal: "buy" | "watch" | "pass";
  verdictConfidence: number;
  verdictModel: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(verdictFeedback)
    .values({
      verdictId: params.verdictId,
      userId: params.userId,
      orgId: params.orgId,
      rating: params.rating,
      comment: params.comment,
      issueCategories: params.issueCategories,
      verdictSignal: params.verdictSignal,
      verdictConfidence: params.verdictConfidence,
      verdictModel: params.verdictModel,
    })
    .onConflictDoUpdate({
      target: [verdictFeedback.userId, verdictFeedback.verdictId],
      set: {
        rating: params.rating,
        comment: params.comment ?? null,
        issueCategories: params.issueCategories ?? null,
        // Re-snapshot the verdict state in case the verdict was
        // regenerated between feedback events.
        verdictSignal: params.verdictSignal,
        verdictConfidence: params.verdictConfidence,
        verdictModel: params.verdictModel,
        createdAt: sql`now()`,
      },
    });
}

export async function deleteVerdictFeedback(params: {
  verdictId: string;
  userId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .delete(verdictFeedback)
    .where(
      and(
        eq(verdictFeedback.verdictId, params.verdictId),
        eq(verdictFeedback.userId, params.userId),
      ),
    );
}

export async function getVerdictFeedbackForUser(params: {
  verdictId: string;
  userId: string;
}): Promise<VerdictFeedback | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(verdictFeedback)
    .where(
      and(
        eq(verdictFeedback.verdictId, params.verdictId),
        eq(verdictFeedback.userId, params.userId),
      ),
    )
    .limit(1);
  return row ?? null;
}
