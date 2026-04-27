"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { ParsedAddressSchema } from "@/lib/address";
import { resolveAppUser } from "@/lib/db/queries/users";
import { upsertPropertyFromAddress } from "@/lib/db/queries/properties";

/**
 * Server action invoked when a user selects an address from the
 * AddressAutocomplete dropdown.
 *
 * Behavior CHANGED in M3.5: the action no longer consumes a report
 * slot or pre-creates a pending verdict. Property creation is now
 * free; the report slot is charged when the user submits the
 * intake wizard (where the verdict actually starts generating).
 * This keeps users from being charged for properties they create
 * and then abandon mid-onboarding.
 *
 * Steps (in order):
 *   1. Authenticate via Clerk.
 *   2. Resolve the Clerk user to our internal user + org row.
 *   3. Validate the parsed address (never trust client input).
 *   4. Upsert the property (dedupe on place id + normalized address).
 *   5. Return the propertyId; the client routes to /intake (or the
 *      latest verdict if the org already finished onboarding for
 *      this address).
 */
export async function createPropertyAction(
  rawAddress: unknown,
): Promise<
  | {
      ok: false;
      error: "unauthorized" | "invalid_address";
      message?: string;
    }
  | { ok: true; propertyId: string; wasNew: boolean }
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

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;
  if (!email)
    return { ok: false, error: "unauthorized", message: "No email on Clerk session" };

  const name =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ").trim() || null;

  const appUser = await resolveAppUser(clerkUserId, email, name);
  if (!appUser) return { ok: false, error: "unauthorized", message: "User soft-deleted" };

  const { property, wasNew } = await upsertPropertyFromAddress({
    orgId: appUser.orgId,
    createdByUserId: appUser.userId,
    address: parsed.data,
  });

  return { ok: true, propertyId: property.id, wasNew };
}

/**
 * Thin wrapper that also performs the redirect. Client code invokes
 * this from a form action; separating the redirect from the data call
 * keeps the former testable without mocking next/navigation.
 *
 * Routes new properties to the intake wizard. The property detail
 * page handles re-pastes of existing properties — it redirects to
 * the latest verdict if intake is already complete, or to /intake
 * if it isn't.
 */
export async function createPropertyAndRedirect(
  rawAddress: unknown,
): Promise<never | { ok: false; error: string; message?: string }> {
  const result = await createPropertyAction(rawAddress);
  if (!result.ok) return result;
  redirect(`/app/properties/${result.propertyId}`);
}
