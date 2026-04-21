import { getDb } from "@/lib/db";
import { verifyClerkWebhook } from "@/lib/clerk/verify-webhook";
import {
  handleUserCreated,
  handleUserDeleted,
  handleUserUpdated,
  type SyncResult,
} from "@/lib/clerk/sync";

/**
 * Requires the Node runtime for @neondatabase/serverless WebSocket Pool and
 * svix's Node crypto paths. Do not switch to edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wrap a sync result into the right HTTP response.
 *
 * `skipped_no_email` is a 200 on purpose: Clerk retries 500s indefinitely,
 * so we surface the reason in the body and stop the retry loop. Everything
 * else is a regular 200.
 */
function respondWithSync(sync: SyncResult): Response {
  if (sync.kind === "skipped_no_email") {
    return Response.json({ ok: false, skipped: "no_email" }, { status: 200 });
  }
  return Response.json({ ok: true, sync }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  const result = verifyClerkWebhook(
    rawBody,
    req.headers,
    process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  );

  if (!result.ok) {
    // 401 for signature issues (auth failure); 400 for client-side payload
    // problems; 500 when we're misconfigured.
    if (result.reason === "missing_secret") {
      return Response.json({ error: "server_misconfigured" }, { status: 500 });
    }
    if (result.reason === "bad_signature") {
      return Response.json({ error: "invalid_signature" }, { status: 401 });
    }
    return Response.json(
      { error: result.reason, detail: result.detail },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    switch (result.event.type) {
      case "user.created":
        return respondWithSync(await handleUserCreated(db, result.event));
      case "user.updated":
        return respondWithSync(await handleUserUpdated(db, result.event));
      case "user.deleted":
        return respondWithSync(await handleUserDeleted(db, result.event));
    }
  } catch (err) {
    // Unexpected DB or svix error — return 500 so Clerk retries with
    // exponential backoff.
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[clerk webhook] sync failed", err);
    return Response.json({ error: "sync_failed", detail: message }, { status: 500 });
  }
}
