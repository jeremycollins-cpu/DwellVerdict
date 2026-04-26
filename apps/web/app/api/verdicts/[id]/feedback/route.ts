import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import {
  VERDICT_FEEDBACK_ISSUE_CATEGORIES,
  VERDICT_FEEDBACK_RATINGS,
} from "@dwellverdict/db";

import { resolveAppUser } from "@/lib/db/queries/users";
import { getVerdictForOrg } from "@/lib/db/queries/verdicts";
import {
  deleteVerdictFeedback,
  upsertVerdictFeedback,
} from "@/lib/db/queries/verdict-feedback";

/**
 * POST /api/verdicts/[id]/feedback — record (or overwrite) a user's
 * thumbs up/down on a verdict, with optional comment + issue
 * categories on thumbs_down.
 *
 * DELETE /api/verdicts/[id]/feedback — remove the user's feedback
 * for that verdict. Used by the "Change" affordance in the UI when
 * a user wants to clear their rating before re-rating.
 *
 * The (user_id, verdict_id) unique index guarantees one row per
 * pair; upsert keeps re-rating cheap.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBodySchema = z.object({
  rating: z.enum(VERDICT_FEEDBACK_RATINGS),
  comment: z.string().min(1).max(2000).optional(),
  issueCategories: z
    .array(z.enum(VERDICT_FEEDBACK_ISSUE_CATEGORIES))
    .max(VERDICT_FEEDBACK_ISSUE_CATEGORIES.length)
    .optional(),
});

async function resolveCaller(): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; status: number; error: string }
> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { ok: false, status: 401, error: "unauthorized" };
  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { ok: false, status: 401, error: "no_email" };
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() ||
    null;
  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) return { ok: false, status: 401, error: "user_deleted" };
  return { ok: true, userId: appUser.userId, orgId: appUser.orgId };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: verdictId } = await context.params;

  const caller = await resolveCaller();
  if (!caller.ok) {
    return Response.json(
      { ok: false, error: caller.error },
      { status: caller.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "invalid_input",
        message: parsed.error.issues[0]?.message,
      },
      { status: 400 },
    );
  }

  const verdict = await getVerdictForOrg({
    verdictId,
    orgId: caller.orgId,
  });
  if (!verdict) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Snapshots require ready-state verdicts — pending and failed
  // rows don't have signal/confidence/model set, and feedback on a
  // not-yet-rendered verdict is meaningless.
  if (
    verdict.status !== "ready" ||
    !verdict.signal ||
    verdict.confidence === null ||
    !verdict.modelVersion
  ) {
    return Response.json(
      { ok: false, error: "verdict_not_ready" },
      { status: 409 },
    );
  }

  await upsertVerdictFeedback({
    verdictId,
    userId: caller.userId,
    orgId: caller.orgId,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
    issueCategories: parsed.data.issueCategories,
    verdictSignal: verdict.signal as "buy" | "watch" | "pass",
    verdictConfidence: verdict.confidence,
    verdictModel: verdict.modelVersion,
  });

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: verdictId } = await context.params;

  const caller = await resolveCaller();
  if (!caller.ok) {
    return Response.json(
      { ok: false, error: caller.error },
      { status: caller.status },
    );
  }

  await deleteVerdictFeedback({ verdictId, userId: caller.userId });
  return Response.json({ ok: true });
}
