import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { ScoutMessage } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { scoutMessages } = schema;

/**
 * Per-property Scout chat persistence per ADR-8. Messages stored
 * oldest-first so listChatMessages feeds the LLM directly as
 * conversation history.
 */

export async function listScoutMessages(params: {
  propertyId: string;
  orgId: string;
  limit?: number;
}): Promise<ScoutMessage[]> {
  const db = getDb();
  return db
    .select()
    .from(scoutMessages)
    .where(
      and(
        eq(scoutMessages.propertyId, params.propertyId),
        eq(scoutMessages.orgId, params.orgId),
      ),
    )
    .orderBy(asc(scoutMessages.createdAt))
    .limit(params.limit ?? 200);
}

export async function appendScoutMessage(params: {
  orgId: string;
  propertyId: string;
  userId: string | null;
  role: "user" | "assistant";
  content: string;
  modelVersion?: string | null;
  promptVersion?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
}): Promise<ScoutMessage> {
  const db = getDb();
  const [row] = await db
    .insert(scoutMessages)
    .values({
      orgId: params.orgId,
      propertyId: params.propertyId,
      userId: params.userId,
      role: params.role,
      content: params.content,
      modelVersion: params.modelVersion ?? null,
      promptVersion: params.promptVersion ?? null,
      inputTokens: params.inputTokens ?? null,
      outputTokens: params.outputTokens ?? null,
      costCents: params.costCents ?? null,
    })
    .returning();
  if (!row) throw new Error("scout_message insert returned no row");
  return row;
}
