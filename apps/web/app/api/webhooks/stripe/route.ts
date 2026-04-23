import type Stripe from "stripe";

import { getStripe, planFromPriceId, requireStripeConfig } from "@/lib/stripe/client";
import {
  applyStripeSubscriptionUpdate,
  getOrgByStripeCustomerId,
} from "@/lib/db/queries/organizations";

/**
 * Stripe webhook handler per ADR-8.
 *
 * Listens for subscription lifecycle events and mirrors them onto
 * the organizations row:
 *
 *   checkout.session.completed         — new sub created via Checkout.
 *                                        Pull the subscription and sync.
 *   customer.subscription.created      — fires alongside checkout.session;
 *                                        idempotent sync.
 *   customer.subscription.updated      — plan change (upgrade/downgrade
 *                                        via Billing Portal) or period
 *                                        roll.
 *   customer.subscription.deleted      — canceled / ended. plan →
 *                                        'canceled', stripeSubscriptionId
 *                                        cleared.
 *   invoice.paid / invoice.payment_failed — logged but not acted on
 *                                        for v0. Dunning comes later.
 *
 * Security: the raw body is required for signature verification.
 * Next.js route handlers give us the raw bytes via req.text() as
 * long as we don't read the body elsewhere first.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const stripe = getStripe();
  const { webhookSecret } = requireStripeConfig();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return Response.json(
      { ok: false, error: "missing_stripe_signature" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe webhook] signature verification failed", { message });
    return Response.json(
      { ok: false, error: "invalid_signature", message },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) break; // one-time payments don't create subs
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(sub);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscriptionCanceled(sub);
        break;
      }
      default:
        // Many events fire that we don't care about (payment_method
        // attached, charge succeeded, etc.). Silent 200 keeps Stripe
        // happy without noisy logs.
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[stripe webhook] handler error", {
      type: event.type,
      id: event.id,
      message,
    });
    // Return 500 so Stripe retries with backoff.
    return Response.json({ ok: false, error: "handler_error", message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) {
    console.warn("[stripe webhook] subscription for unknown customer", {
      customerId,
      subId: sub.id,
    });
    return;
  }

  // A subscription can technically carry multiple items; for our
  // two-tier pricing we expect exactly one.
  const priceId = sub.items.data[0]?.price.id;
  const plan = planFromPriceId(priceId);
  if (!plan) {
    console.warn("[stripe webhook] subscription has unrecognized price id", {
      priceId,
      subId: sub.id,
    });
    return;
  }

  // Stripe returns unix seconds; Drizzle expects JS Date.
  const periodStart = new Date(sub.current_period_start * 1000);
  const periodEnd = new Date(sub.current_period_end * 1000);

  // Statuses we treat as "paid and active": active, trialing.
  // past_due: still treat as the paid plan; dunning handles reminders.
  // canceled / incomplete_expired / unpaid: treat as canceled.
  const isActive =
    sub.status === "active" ||
    sub.status === "trialing" ||
    sub.status === "past_due";

  await applyStripeSubscriptionUpdate({
    orgId: org.id,
    plan: isActive ? plan : "canceled",
    stripeSubscriptionId: sub.id,
    periodStart: isActive ? periodStart : null,
    periodEnd: isActive ? periodEnd : null,
  });
}

async function syncSubscriptionCanceled(sub: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;
  await applyStripeSubscriptionUpdate({
    orgId: org.id,
    plan: "canceled",
    stripeSubscriptionId: null,
    periodStart: null,
    periodEnd: null,
  });
}
