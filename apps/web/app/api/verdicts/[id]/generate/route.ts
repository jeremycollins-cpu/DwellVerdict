import { auth, currentUser } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

import { decideCostCap, VERDICT_NARRATIVE_PROMPT_VERSION } from "@dwellverdict/ai";

import {
  orchestrateVerdict,
  type VerdictProgressEvent,
} from "@/lib/verdict/orchestrator";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getPropertyForOrg } from "@/lib/db/queries/properties";
import {
  createPendingVerdict,
  getVerdictForOrg,
  markVerdictFailed,
  markVerdictReady,
} from "@/lib/db/queries/verdicts";
import { refundReport, getPlanForUser } from "@/lib/db/queries/report-usage";
import { getUserMonthlySpendCents } from "@/lib/db/queries/ai-usage-events";
import { describeError } from "@/lib/errors";

/**
 * POST /api/verdicts/[id]/generate — kick off Anthropic verdict
 * generation for a pending or failed verdict row, streaming
 * progress events as Server-Sent Events.
 *
 * SSE event types (one per `event:` line):
 *   phase_start       — phase boundary entered
 *   phase_complete    — phase boundary exited
 *   signal_complete   — one of the 11 signals settled
 *   narrative_ready   — narrative AI call finished, full text + model
 *   complete          — final verdict assembled (success terminal)
 *   error             — fatal failure (terminal)
 *
 * The route still writes the verdict row to the DB on completion or
 * failure (existing markVerdictReady / markVerdictFailed semantics)
 * — the SSE stream is purely additive observability that the
 * frontend consumes for the mockup-04 streaming UI. Polling clients
 * (or SSE-aware clients that lose the connection) can fall back to
 * /api/verdicts/[id]/status to read the final DB state.
 *
 * Node runtime is required: Edge runtime caps streaming duration at
 * a level too low for verdict generation (60-180s typical).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sse(event: VerdictProgressEvent): Uint8Array {
  // SSE wire format: `event: <name>\ndata: <json>\n\n`
  const body = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(body);
}

function sseError(message: string): Uint8Array {
  const evt: VerdictProgressEvent = { type: "error", error: message };
  return sse(evt);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  Sentry.setTag("operation", "verdict_generation");

  const { id: verdictId } = await context.params;

  const body = await req.json().catch(() => ({}));
  const force =
    body && typeof body === "object" && "force" in body && body.force === true;

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

  // Idempotency: ready short-circuits unless caller passed force.
  if (verdict.status === "ready" && !force) {
    return Response.json({ ok: true, status: "ready", verdictId });
  }

  // Insert-only regenerate (M3.3 / CLAUDE.md immutability rule).
  // When the caller passes force=true on an already-ready verdict,
  // create a NEW pending row for the same property and orchestrate
  // against that. Preserves the prior verdict for run history; the
  // streaming UI uses the new verdictId from the SSE complete
  // event to navigate to the new verdict's URL.
  //
  // First-run (status='pending') and failed retries continue to
  // update in place — those represent a single attempt at the
  // current verdict, not a fresh run worth its own row.
  let effectiveVerdictId = verdict.id;
  if (verdict.status === "ready" && force) {
    const newVerdict = await createPendingVerdict({
      orgId: appUser.orgId,
      propertyId: verdict.propertyId,
      createdByUserId: appUser.userId,
    });
    effectiveVerdictId = newVerdict.id;
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

  // M3.0 cost-cap check. Hard-block users past the upper threshold;
  // surface "degrade" silently for now (M6.1 will use it for Scout).
  const monthlySpendCents = await getUserMonthlySpendCents(appUser.userId);
  const capDecision = decideCostCap(monthlySpendCents);
  if (!capDecision.allowed) {
    return Response.json(
      {
        ok: false,
        error: "monthly_cost_cap_exceeded",
        message:
          "You've reached this month's AI usage cap. Resets on the 1st of the next calendar month, or contact support.",
        monthlySpendCents: capDecision.monthlySpendCents,
        capCents: capDecision.capCents,
      },
      { status: 429 },
    );
  }

  const addressFull =
    property.addressFull ??
    `${property.addressLine1}, ${property.city}, ${property.state} ${property.zip}`;

  // Test mode bypass: skip the AI call, write a synthetic ready
  // verdict, and return a single SSE payload for parity with the
  // streaming flow. Same gate the legacy non-streaming route used.
  if (process.env.VERDICT_TEST_MODE === "mock") {
    await markVerdictReady({
      verdictId,
      signal: "watch",
      confidence: 55,
      summary: `[TEST MODE] Mock verdict for ${addressFull}.`,
      narrative:
        "[TEST MODE] Synthetic verdict; no Anthropic call made. " +
        "Unset VERDICT_TEST_MODE to restore real generation.",
      dataPoints: {
        comps: "[TEST MODE]",
        revenue: "[TEST MODE]",
        regulatory: "[TEST MODE]",
        location: "[TEST MODE]",
      },
      sources: ["https://dwellverdict.com/docs/test-mode"],
      modelVersion: "mock",
      promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
    });
    return Response.json({ ok: true, status: "ready", verdictId, mode: "mock" });
  }

  // Stream verdict generation as SSE. Each progress event from the
  // orchestrator gets serialized and pushed to the client; the
  // route handler still writes markVerdictReady / markVerdictFailed
  // at the end so non-SSE clients see the canonical state via the
  // /api/verdicts/[id]/status polling endpoint.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Heartbeat so the connection doesn't time out behind any
      // intermediary (Vercel's edge → function pipe, browsers, the
      // user's reverse-proxy if any). Comment-only frames per the
      // SSE spec — clients ignore them but TCP stays open.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(":\n\n"));
        } catch {
          // Controller may be closed if the user navigated away.
        }
      }, 15_000);

      try {
        const result = await orchestrateVerdict({
          property,
          userId: appUser.userId,
          orgId: appUser.orgId,
          verdictId: effectiveVerdictId,
          onProgress: (event) => {
            try {
              controller.enqueue(sse(event));
            } catch {
              // Stream closed (client disconnected). The orchestrator
              // keeps running to completion regardless — verdict
              // persistence is decoupled from the SSE channel.
            }
          },
        });

        if (!result.ok) {
          await markVerdictFailed({
            verdictId: effectiveVerdictId,
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
          // The orchestrator already emitted an `error` event above.
        } else {
          await markVerdictReady({
            verdictId: effectiveVerdictId,
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
            scoreBreakdown: result.breakdown,
          });
          // The orchestrator already emitted a `complete` event.
        }
      } catch (err) {
        const { message, code } = describeError(err);
        console.error("[verdicts/generate] unexpected error", {
          verdictId: effectiveVerdictId,
          code,
          message,
          raw: err,
        });
        try {
          controller.enqueue(sseError(`unexpected: ${message}`));
        } catch {}
        await markVerdictFailed({
          verdictId: effectiveVerdictId,
          error: `unexpected: ${message}`,
          promptVersion: VERDICT_NARRATIVE_PROMPT_VERSION,
        }).catch(() => undefined);
        await refundReport({
          userId: appUser.userId,
          plan: await getPlanForUser(appUser.userId),
        }).catch(() => undefined);
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Vercel's gateway buffering for SSE responses so
      // events surface to the client as soon as they're enqueued.
      "X-Accel-Buffering": "no",
    },
  });
}
