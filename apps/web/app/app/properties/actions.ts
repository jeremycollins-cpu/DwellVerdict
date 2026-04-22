"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ParsedAddressSchema } from "@/lib/address";
import { resolveAppUser } from "@/lib/db/queries/users";
import { upsertPropertyFromAddress } from "@/lib/db/queries/properties";
import { createPendingVerdict } from "@/lib/db/queries/verdicts";
import { consumeFreeVerdict, refundFreeVerdict } from "@/lib/db/queries/verdict-limits";

/**
 * Server action invoked when a user selects an address from the
 * AddressAutocomplete dropdown.
 *
 * What it does (in order):
 *   1. Authenticate the request via Clerk.
 *   2. Resolve the Clerk user to our internal user + org row.
 *   3. Validate the parsed address (never trust client-submitted data).
 *   4. Upsert the property (dedupe on place id + normalized address).
 *   5. Check free-tier metering and consume a slot if applicable.
 *   6. Create a pending verdict row.
 *   7. Redirect to the property detail page, where a client component
 *      will call POST /api/verdicts/[id]/generate to kick off Anthropic.
 *
 * The split between "create pending row here" and "run Anthropic in a
 * route handler" keeps server actions quick (<1s) and lets the long
 * work run in a dedicated endpoint with its own timeout envelope.
 */
export async function createPropertyAction(
  rawAddress: unknown,
): Promise<
  | { ok: false; error: "unauthorized" | "invalid_address" | "rate_limited"; message?: string; resetAt?: string }
  | { ok: true; propertyId: string; verdictId: string }
> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { ok: false, error: "unauthorized" };

  const parsed = ParsedAddressSchema.safeParse(rawAddress);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_address",
      message: parsed.error.issues[0]?.message ?? "Address shape invalid",
    };
  }

  // Clerk's server-side user lookup — we need email + name to sync to
  // our users row in case the webhook lagged.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email) return { ok: false, error: "unauthorized", message: "No email on Clerk session" };

  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) return { ok: false, error: "unauthorized", message: "User soft-deleted" };

  // Free-tier metering. Future: paid orgs bypass this check; for now
  // every user is on the starter plan per organizations.plan default.
  const meter = await consumeFreeVerdict(appUser.userId);
  if (!meter.ok) {
    return {
      ok: false,
      error: "rate_limited",
      resetAt: meter.resetAt.toISOString(),
    };
  }

  try {
    const { property } = await upsertPropertyFromAddress({
      orgId: appUser.orgId,
      createdByUserId: appUser.userId,
      address: parsed.data,
    });

    const { id: verdictId } = await createPendingVerdict({
      orgId: appUser.orgId,
      propertyId: property.id,
      createdByUserId: appUser.userId,
    });

    // Note: we don't fire the Anthropic call here — the /app/properties/[id]
    // page renders a pending skeleton and its VerdictRenderer client
    // component POSTs to /api/verdicts/[id]/generate on mount. This
    // keeps server actions fast and puts long work in a dedicated
    // route with its own timeout envelope.

    return { ok: true, propertyId: property.id, verdictId };
  } catch (err) {
    // We already consumed the user's free-tier slot — refund it so
    // they're not punished for our failure.
    await refundFreeVerdict(appUser.userId).catch(() => {
      // Best-effort; log-only.
    });
    throw err;
  }
}

/**
 * Thin wrapper that also performs the redirect. Client code invokes
 * this from a form action; separating the redirect from the data call
 * keeps the former testable without mocking next/navigation.
 */
export async function createPropertyAndRedirect(
  rawAddress: unknown,
): Promise<never | { ok: false; error: string; message?: string; resetAt?: string }> {
  const result = await createPropertyAction(rawAddress);
  if (!result.ok) return result;
  redirect(`/app/properties/${result.propertyId}`);
}
