import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { getStripe, requireStripeConfig } from "@/lib/stripe/client";
import { resolveAppUser } from "@/lib/db/queries/users";
import {
  getOrgById,
  setOrgStripeCustomerId,
} from "@/lib/db/queries/organizations";

/**
 * POST /api/stripe/checkout — creates a Stripe Checkout Session
 * for a new subscription (starter or pro) per ADR-8.
 *
 * Flow:
 *   1. Authenticate via Clerk.
 *   2. Resolve the user → app user + org.
 *   3. Ensure the org has a Stripe customer id (create on first
 *      checkout).
 *   4. Create a subscription Checkout Session for the requested
 *      price id + redirect the client to the Stripe-hosted page.
 *
 * Upgrade / downgrade between plans goes through the Billing
 * Portal (see /api/stripe/portal) — not this endpoint. This is
 * only for net-new subs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  plan: z.enum(["starter", "pro"]),
});

export async function POST(req: Request): Promise<Response> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
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
  if (!org) {
    return Response.json({ ok: false, error: "org_not_found" }, { status: 404 });
  }

  let stripe: ReturnType<typeof getStripe>;
  let priceId: string;
  try {
    stripe = getStripe();
    const { starterPriceId, proPriceId } = requireStripeConfig();
    priceId = parsed.data.plan === "starter" ? starterPriceId : proPriceId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe/checkout] config error", { message });
    return Response.json(
      { ok: false, error: "stripe_config", message },
      { status: 500 },
    );
  }

  // Create or reuse the Stripe customer for this org. We don't
  // want to create a new customer every checkout — that duplicates
  // billing history.
  let stripeCustomerId = org.stripeCustomerId;
  try {
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        name: name ?? org.name,
        metadata: {
          org_id: org.id,
          clerk_user_id: clerkUserId,
        },
      });
      stripeCustomerId = customer.id;
      await setOrgStripeCustomerId({
        orgId: org.id,
        stripeCustomerId,
      });
    }

    const appUrl = process.env.APP_URL ?? "https://dwellverdict.com";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Show a "promo code" field on the Stripe-hosted Checkout
      // page. Codes are created + managed in Stripe dashboard →
      // Products → Coupons → Promotion Codes. Founder path: create
      // a 100%-off forever coupon, generate a promo code under it,
      // enter at checkout to bypass paying yourself.
      allow_promotion_codes: true,
      success_url: `${appUrl}/app/properties?checkout=success`,
      cancel_url: `${appUrl}/pricing?checkout=canceled`,
      // Tie the session back to our org so the webhook can correlate
      // even if the customer metadata lookup ever gets lossy.
      metadata: {
        org_id: org.id,
        plan: parsed.data.plan,
      },
      subscription_data: {
        metadata: {
          org_id: org.id,
          plan: parsed.data.plan,
        },
      },
    });

    if (!session.url) {
      return Response.json(
        { ok: false, error: "stripe_session_missing_url" },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, url: session.url });
  } catch (err) {
    // Surface Stripe's actual error code + message to the client
    // instead of bubbling a bare 500. Common causes:
    //   - STRIPE_PRICE_ID_{STARTER,PRO} missing or pointing at a
    //     price from the other mode (test vs live)
    //   - STRIPE_SECRET_KEY in the wrong mode
    //   - Coupon / promo constraints
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    console.error("[stripe/checkout] failed", {
      orgId: org.id,
      plan: parsed.data.plan,
      priceId,
      stripeCustomerId,
      code,
      message,
    });
    return Response.json(
      { ok: false, error: "checkout_failed", code, message },
      { status: 502 },
    );
  }
}
