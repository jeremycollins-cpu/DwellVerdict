import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  sendScoutMessage,
  lintPlaceSentiment,
  SCOUT_CHAT_HISTORY_CAP,
} from "@dwellverdict/ai";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import { getLatestVerdictForProperty } from "@/lib/db/queries/verdicts";
import {
  getPlanForUser,
  consumeScoutMessage,
} from "@/lib/db/queries/report-usage";
import {
  listScoutMessages,
  appendScoutMessage,
} from "@/lib/db/queries/scout";

/**
 * POST /api/scout/message — send a Scout chat turn per ADR-8.
 *
 * Gate stack (in order):
 *   1. Clerk auth
 *   2. Pro-tier plan (ADR-8 exclusive feature)
 *   3. Rate limit (30/day, 300/month; consumeScoutMessage)
 *   4. Property must belong to caller's org
 *
 * Then: build property context from the property row + latest
 * verdict, pull recent conversation, call Haiku, lint the reply
 * for fair-housing violations (fail-closed), persist both user
 * and assistant turns, return the reply.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  propertyId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid_input", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) {
    return Response.json({ ok: false, error: "no_email" }, { status: 401 });
  }
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    null;
  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) {
    return Response.json({ ok: false, error: "user_deleted" }, { status: 401 });
  }

  // Pro-tier gate
  const plan = await getPlanForUser(appUser.userId);
  if (plan !== "pro") {
    return Response.json(
      {
        ok: false,
        error: "pro_required",
        message: "Scout chat requires a DwellVerdict Pro subscription.",
        plan,
      },
      { status: 403 },
    );
  }

  // Rate limit
  const meter = await consumeScoutMessage(appUser.userId);
  if (!meter.ok) {
    return Response.json(
      {
        ok: false,
        error: meter.reason,
        message:
          meter.reason === "daily_cap_reached"
            ? "Scout daily cap reached (30 messages). Resets tomorrow UTC."
            : "Scout monthly cap reached (300 messages). Resets on the 1st.",
        dayResetAt: meter.dayResetAt?.toISOString(),
        periodResetAt: meter.periodResetAt?.toISOString(),
      },
      { status: 429 },
    );
  }

  // Property + context
  const property = await getPropertyForOrg({
    propertyId: parsed.data.propertyId,
    orgId: appUser.orgId,
  });
  if (!property) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const verdict = await getLatestVerdictForProperty({
    propertyId: parsed.data.propertyId,
    orgId: appUser.orgId,
  });

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  const propertyContext = {
    address: addressFull,
    city: property.city,
    state: property.state,
    latestVerdict:
      verdict && verdict.status === "ready"
        ? {
            signal: verdict.signal,
            confidence: verdict.confidence,
            summary: verdict.summary,
            dataPoints: verdict.dataPoints,
            generatedAt: verdict.completedAt?.toISOString(),
          }
        : null,
  };

  // Pull recent conversation. We store oldest-first; the task
  // expects oldest-first too.
  const priorMessages = await listScoutMessages({
    propertyId: parsed.data.propertyId,
    orgId: appUser.orgId,
    limit: SCOUT_CHAT_HISTORY_CAP * 2, // a bit of overhead for pairs
  });
  const history = priorMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Persist the user's message before calling Anthropic so even
  // if the LLM fails the transcript reflects intent.
  await appendScoutMessage({
    orgId: appUser.orgId,
    propertyId: parsed.data.propertyId,
    userId: appUser.userId,
    role: "user",
    content: parsed.data.message,
  });

  const result = await sendScoutMessage({
    propertyContext,
    history,
    userMessage: parsed.data.message,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: "scout_failed", message: result.error },
      { status: 502 },
    );
  }

  // Defense-in-depth: if a FHA-flagged phrase sneaks through, drop
  // the reply rather than persist + show it.
  const flags = lintPlaceSentiment({
    bullets: [result.reply],
    summary: "",
  });
  if (flags.length > 0) {
    console.error("[scout] fair-housing lint blocked reply", { flags });
    const safeReply =
      "I can only share objective signals here — no subjective neighborhood " +
      "characterizations. Want me to pull the specific data points (walk " +
      "score, flood zone, comp revenue) for this property?";
    await appendScoutMessage({
      orgId: appUser.orgId,
      propertyId: parsed.data.propertyId,
      userId: null,
      role: "assistant",
      content: safeReply,
      modelVersion: result.observability.modelVersion,
      promptVersion: result.observability.promptVersion,
      inputTokens: result.observability.inputTokens,
      outputTokens: result.observability.outputTokens,
      costCents: result.observability.costCents,
    });
    return Response.json({
      ok: true,
      reply: safeReply,
      remainingToday: meter.remainingToday,
      remainingThisPeriod: meter.remainingThisPeriod,
      flagged: true,
    });
  }

  await appendScoutMessage({
    orgId: appUser.orgId,
    propertyId: parsed.data.propertyId,
    userId: null,
    role: "assistant",
    content: result.reply,
    modelVersion: result.observability.modelVersion,
    promptVersion: result.observability.promptVersion,
    inputTokens: result.observability.inputTokens,
    outputTokens: result.observability.outputTokens,
    costCents: result.observability.costCents,
  });

  return Response.json({
    ok: true,
    reply: result.reply,
    remainingToday: meter.remainingToday,
    remainingThisPeriod: meter.remainingThisPeriod,
    flagged: false,
  });
}
