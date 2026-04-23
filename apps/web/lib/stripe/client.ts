import "server-only";

import Stripe from "stripe";

/**
 * Lazy, module-scoped Stripe client per ADR-8 (two-tier pricing).
 * Kept lazy so envs without STRIPE_SECRET_KEY (unit tests, preview
 * deploys that shouldn't touch billing) can import this module
 * without crashing at load time.
 *
 * Env vars expected in Vercel:
 *   STRIPE_SECRET_KEY            — sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET        — whsec_... (from Stripe dashboard
 *                                   → Webhooks → [this endpoint])
 *   STRIPE_PRICE_ID_STARTER      — price_... for $20/mo DwellVerdict
 *   STRIPE_PRICE_ID_PRO          — price_... for $40/mo DwellVerdict Pro
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY not set. Provision it in Vercel env vars.",
    );
  }
  cached = new Stripe(key, {
    // Pin the API version so Stripe updates don't silently shift
    // webhook shapes under us. Bump deliberately when we review
    // Stripe's changelog.
    apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}

/**
 * Mapping from Stripe price id → internal plan name. The webhook
 * uses this to answer "which of our plans does this subscription
 * correspond to?"
 */
export function planFromPriceId(
  priceId: string | null | undefined,
): "starter" | "pro" | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  return null;
}

export function requireStripeConfig(): {
  starterPriceId: string;
  proPriceId: string;
  webhookSecret: string;
} {
  const starterPriceId = process.env.STRIPE_PRICE_ID_STARTER;
  const proPriceId = process.env.STRIPE_PRICE_ID_PRO;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!starterPriceId || !proPriceId || !webhookSecret) {
    throw new Error(
      "Stripe config incomplete — need STRIPE_PRICE_ID_STARTER, " +
        "STRIPE_PRICE_ID_PRO, STRIPE_WEBHOOK_SECRET in env vars.",
    );
  }
  return { starterPriceId, proPriceId, webhookSecret };
}
