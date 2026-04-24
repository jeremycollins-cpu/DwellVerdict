import { auth, currentUser } from "@clerk/nextjs/server";

import { getStripe } from "@/lib/stripe/client";
import { resolveAppUser } from "@/lib/db/queries/users";
import { getOrgById } from "@/lib/db/queries/organizations";

/**
 * POST /api/stripe/portal — returns a URL to the Stripe-hosted
 * Billing Portal for the signed-in user's org. The portal handles
 * plan upgrade/downgrade (starter ↔ pro), payment method updates,
 * and subscription cancellation.
 *
 * All state changes made in the portal come back through the
 * Stripe webhook at /api/webhooks/stripe, so we don't write
 * anything here — just mint the portal session URL.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
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

  const org = await getOrgById(appUser.orgId);
  if (!org || !org.stripeCustomerId) {
    return Response.json(
      { ok: false, error: "no_stripe_customer", message: "No active subscription yet." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const appUrl = process.env.APP_URL ?? "https://dwellverdict.com";

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl}/app/settings/billing`,
  });

  return Response.json({ ok: true, url: session.url });
}
