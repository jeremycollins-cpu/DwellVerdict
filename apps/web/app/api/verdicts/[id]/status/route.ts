import { auth, currentUser } from "@clerk/nextjs/server";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getVerdictForOrg } from "@/lib/db/queries/verdicts";

/**
 * GET /api/verdicts/[id]/status — polling fallback for clients that
 * can't (or didn't) maintain the SSE connection from the generate
 * endpoint.
 *
 * Returns the verdict's current DB state as a small JSON payload.
 * No partial-progress reporting today — the row only flips to
 * 'ready' or 'failed' once the orchestrator finishes. The
 * mockup-04 streaming UI is the SSE-only experience; polling
 * clients see "still pending" until the final state lands.
 *
 * Tracking partial progress in DB columns is a v1.1 follow-up
 * (would let polling reflect the same stream-track UI as SSE);
 * deferred to keep M3.2 from needing a schema migration.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    null;
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

  // Defense in depth (M3.6 fix-forward): only surface errorMessage
  // when the row is actually in a failed state. Stale errorMessage
  // values from prior failed attempts that succeeded on regenerate
  // shouldn't leak to polling clients even if the markVerdictReady
  // null-out misses for some future reason.
  const errorMessage =
    verdict.status === "failed" ? verdict.errorMessage : null;
  return Response.json({
    ok: true,
    status: verdict.status,
    completedAt: verdict.completedAt?.toISOString() ?? null,
    errorMessage,
  });
}
