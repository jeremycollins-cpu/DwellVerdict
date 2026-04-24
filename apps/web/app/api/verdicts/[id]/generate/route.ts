import { auth, currentUser } from "@clerk/nextjs/server";

import { VERDICT_NARRATIVE_PROMPT_VERSION } from "@dwellverdict/ai";

import { orchestrateVerdict } from "@/lib/verdict/orchestrator";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import {
  getVerdictForOrg,
  markVerdictFailed,
  markVerdictReady,
} from "@/lib/db/queries/verdicts";
import { refundReport, getPlanForUser } from "@/lib/db/queries/report-usage";

/**
 * POST /api/verdicts/[id]/generate — kick off (or complete) Anthropic
 * verdict generation for a pending verdict row.
 *
 * Why a route handler and not a server action: the Anthropic call can
 * take 60-180s with adaptive thinking + web search, well past the
 * default server-action envelope. Route handlers on Node runtime let
 * us raise `maxDuration` (300s is the Vercel Pro ceiling) and compose
 * more cleanly with client-side fetch() for long-running work.
 *
 * If a verdict still hits the 300s envelope consistently, the right
 * next step is to move generation behind Inngest (already in stack
 * per CLAUDE.md): return 202 here, fire a background job, let the
 * existing pending → ready transition drive the UI. We haven't yet
 * because the p95 Anthropic turnaround fits inside this envelope.
 *
 * Idempotency: the client may call this twice during a refresh or
 * retry. We guard by reading the verdict's current status — if it's
 * already 'ready', return the existing payload; if 'failed', allow a
 * retry (which walks the row forward from failed → pending → ready).
 *
 * Refund: if generation fails, we refund the user's free-tier quota
 * slot that the server action consumed. We swallow refund failures —
 * under-charging once is better than ballooning error surfaces.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: verdictId } = await context.params;

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
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;
  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) {
    return Response.json({ ok: false, error: "user_deleted" }, { status: 401 });
  }

  const verdict = await getVerdictForOrg({
    verdictId,
    orgId: appUser.orgId,
  });
  if (!verdict) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Idempotency: already-ready short-circuits. pending / failed both
  // fall through to generation — markVerdictReady / markVerdictFailed
  // overwrite the final state regardless of prior status.
  //
  // TODO(inngest): proper in-flight dedupe so concurrent POSTs can't
  // kick off duplicate Anthropic calls against the same row. Needs
  // either a new `generation_started_at` column + atomic claim, or
  // Inngest's event-key dedup (preferred — it'll arrive with the
  // background-job migration). Until then, autoStart=false on the
  // client plus the always-visible disabled "Working…" state handle
  // the common case.
  if (verdict.status === "ready") {
    return Response.json({ ok: true, status: "ready", verdictId });
  }

  const property = await getPropertyForOrg({
    propertyId: verdict.propertyId,
    orgId: appUser.orgId,
  });
  if (!property) {
    return Response.json({ ok: false, error: "property_not_found" }, { status: 404 });
  }

  const lat = property.lat ? Number(property.lat) : NaN;
  const lng = property.lng ? Number(property.lng) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    await markVerdictFailed({
      verdictId,
      error: "Property has no coordinates — cannot generate verdict",
      promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
    });
    return Response.json(
      { ok: false, error: "no_coordinates" },
      { status: 422 },
    );
  }

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  // VERDICT_TEST_MODE=mock short-circuits the Anthropic call entirely
  // and writes a synthetic ready verdict. Intended for UI / DB /
  // routing / deploy verification without spending on inference.
  // Leave unset (or set to "off") for real generation.
  if (process.env.VERDICT_TEST_MODE === "mock") {
    await markVerdictReady({
      verdictId,
      signal: "watch",
      confidence: 55,
      summary: `[TEST MODE] Mock verdict for ${addressFull}. No Anthropic call was made.`,
      narrative:
        "[TEST MODE] This is a synthetic verdict generated without calling " +
        "Anthropic. It exists to let you verify the pending → ready UI " +
        "transition, the certificate render, and the DB write path " +
        "without spending on inference. Unset VERDICT_TEST_MODE in Vercel " +
        "env vars to restore real generation.",
      dataPoints: {
        comps: "[TEST MODE] No comps fetched.",
        revenue: "[TEST MODE] No revenue estimate.",
        regulatory: "[TEST MODE] No regulatory lookup.",
        location: "[TEST MODE] No location signals.",
      },
      sources: [
        "https://dwellverdict.com/docs/test-mode",
        "https://dwellverdict.com/docs/test-mode-2",
      ],
      modelVersion: "mock",
      promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    });
    return Response.json({ ok: true, status: "ready", verdictId, mode: "mock" });
  }

  // Outer guard: orchestrateVerdict catches per-signal failures and
  // returns an OrchestratedVerdictFailure, but DB writes
  // (markVerdictFailed / markVerdictReady) or other unexpected
  // errors could still throw.
  // If anything slips through, mark the verdict failed with a
  // sanitised message and return a 502 the UI knows how to render as
  // a retry state — never bubble a bare 500 to the browser.
  try {
    const result = await orchestrateVerdict({
      addressFull,
      city: property.city,
      state: property.state,
      lat,
      lng,
    });

    if (!result.ok) {
      await markVerdictFailed({
        verdictId,
        error: result.error,
        modelVersion: result.observability.modelVersion,
        promptVersion: result.observability.promptVersion,
        inputTokens: result.observability.inputTokens,
        outputTokens: result.observability.outputTokens,
        costCents: result.observability.costCents,
      });
      await refundReport({
        userId: appUser.userId,
        plan: await getPlanForUser(appUser.userId),
      }).catch(() => undefined);
      return Response.json(
        { ok: false, error: "generation_failed", message: result.error },
        { status: 502 },
      );
    }

    await markVerdictReady({
      verdictId,
      signal: result.signal,
      confidence: result.confidence,
      summary: result.summary,
      narrative: result.narrative,
      dataPoints: result.dataPoints,
      sources: result.sources,
      modelVersion: result.observability.modelVersion,
      promptVersion: result.observability.promptVersion,
      inputTokens: result.observability.inputTokens,
      outputTokens: result.observability.outputTokens,
      costCents: result.observability.costCents,
    });

    return Response.json({ ok: true, status: "ready", verdictId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[verdicts/generate] unexpected error", {
      verdictId,
      message,
    });
    await markVerdictFailed({
      verdictId,
      error: `unexpected: ${message}`,
      promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
    }).catch(() => undefined);
    await refundReport({
      userId: appUser.userId,
      plan: await getPlanForUser(appUser.userId),
    }).catch(() => undefined);
    return Response.json(
      { ok: false, error: "generation_failed", message },
      { status: 502 },
    );
  }
}
