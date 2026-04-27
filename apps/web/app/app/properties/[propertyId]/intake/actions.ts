"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { resolveAppUser } from "@/lib/db/queries/users";
import {
  getPropertyForOrg,
  markIntakeComplete,
  savePartialIntake,
} from "@/lib/db/queries/properties";
import {
  consumeReport,
  refundReport,
  getPlanForUser,
} from "@/lib/db/queries/report-usage";
import { createPendingVerdict } from "@/lib/db/queries/verdicts";
import {
  INTAKE_STEP_SCHEMAS,
  type IntakeStepNumber,
  propertyIntakeSubmitSchema,
} from "@/lib/onboarding/schema";

/**
 * Per-step "Save and continue" — validates the step's payload via
 * the corresponding Zod schema, persists fields it owns, bumps
 * `intake_step_completed`, and stamps `intake_last_saved_at`.
 *
 * Returns the new step the client should advance to (or the same
 * step on validation error). Used by both the "Next" button and
 * "Save and finish later" — the difference is purely client-side
 * navigation.
 */
export async function saveIntakeStepAction(params: {
  propertyId: string;
  step: IntakeStepNumber;
  payload: unknown;
}): Promise<
  | { ok: false; error: "unauthorized" | "not_found" | "invalid_payload"; message?: string }
  | { ok: true; nextStep: number }
> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { ok: false, error: "unauthorized" };

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { ok: false, error: "unauthorized" };
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) return { ok: false, error: "unauthorized" };

  const stepSchema = INTAKE_STEP_SCHEMAS[params.step];
  if (!stepSchema) {
    return { ok: false, error: "invalid_payload", message: "Unknown step" };
  }

  const parsed = stepSchema.safeParse(params.payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_payload",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const updated = await savePartialIntake({
    propertyId: params.propertyId,
    orgId: appUser.orgId,
    step: params.step,
    fields: parsed.data,
  });
  if (!updated) return { ok: false, error: "not_found" };

  revalidatePath(`/app/properties/${params.propertyId}/intake`);
  return { ok: true, nextStep: Math.min(params.step + 1, 7) };
}

/**
 * Final intake submit. Order matters:
 *   1. Validate full payload (thesis-goal compatibility refinement).
 *   2. Consume a report slot. Free users get 1 lifetime; starter/
 *      pro get monthly caps. If consume fails, intake is NOT
 *      marked complete — the user can come back and submit again
 *      after upgrading or after the cap resets.
 *   3. Mark intake complete (writes the full payload + stamps
 *      `intake_completed_at`).
 *   4. Create a pending verdict. The verdict-detail page picks up
 *      the pending row and the StreamingVerdict client component
 *      kicks off generation via the SSE endpoint.
 *   5. Redirect to /verdicts/[verdictId].
 *
 * Refunds the report slot if either the intake-complete write or
 * the verdict-create write fails after consume.
 */
export async function submitIntakeAction(params: {
  propertyId: string;
  payload: unknown;
}): Promise<
  | {
      ok: false;
      error:
        | "unauthorized"
        | "not_found"
        | "invalid_payload"
        | "free_trial_used"
        | "monthly_cap_reached"
        | "subscription_canceled"
        | "rate_limited";
      message?: string;
      resetAt?: string;
      plan?: string;
      limit?: number;
    }
  | never
> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { ok: false, error: "unauthorized" };

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { ok: false, error: "unauthorized" };
  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) return { ok: false, error: "unauthorized" };

  const property = await getPropertyForOrg({
    propertyId: params.propertyId,
    orgId: appUser.orgId,
  });
  if (!property) return { ok: false, error: "not_found" };

  const parsed = propertyIntakeSubmitSchema.safeParse(params.payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_payload",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const plan = await getPlanForUser(appUser.userId);
  const meter = await consumeReport({ userId: appUser.userId, plan });
  if (!meter.ok) {
    return {
      ok: false,
      error: meter.reason,
      plan: meter.plan,
      limit: meter.limit,
      resetAt: meter.resetAt?.toISOString(),
    };
  }

  let verdictId: string;
  try {
    const completed = await markIntakeComplete({
      propertyId: params.propertyId,
      orgId: appUser.orgId,
      payload: parsed.data,
    });
    if (!completed) throw new Error("intake_complete_write_failed");

    const { id } = await createPendingVerdict({
      orgId: appUser.orgId,
      propertyId: params.propertyId,
      createdByUserId: appUser.userId,
    });
    verdictId = id;
  } catch (err) {
    await refundReport({ userId: appUser.userId, plan }).catch(() => {});
    throw err;
  }

  // Cache busts before redirect so the property list and detail
  // pages reflect the new intake state without a hard refresh.
  revalidatePath(`/app/properties`);
  revalidatePath(`/app/properties/${params.propertyId}`);
  redirect(`/app/properties/${params.propertyId}/verdicts/${verdictId}`);
}
