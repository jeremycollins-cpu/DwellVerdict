import "server-only";

import { eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { Organization, OrganizationPlan } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { organizations } = schema;

/**
 * Lookup the org for a Stripe customer id. Used by the webhook
 * handler to route subscription lifecycle events to the right org.
 */
export async function getOrgByStripeCustomerId(
  stripeCustomerId: string,
): Promise<Organization | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

export async function getOrgById(orgId: string): Promise<Organization | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row ?? null;
}

/**
 * Set the Stripe customer id on an org — called the first time we
 * mint a checkout session for an org that doesn't already have one.
 */
export async function setOrgStripeCustomerId(params: {
  orgId: string;
  stripeCustomerId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(organizations)
    .set({
      stripeCustomerId: params.stripeCustomerId,
      updatedAt: sql`NOW()`,
    })
    .where(eq(organizations.id, params.orgId));
}

/**
 * Apply a plan state update from a Stripe subscription lifecycle
 * event. Called by the webhook handler.
 *
 * - plan: internal plan name derived from the price id
 * - stripeSubscriptionId: null on subscription.deleted
 * - periodStart/periodEnd: current billing period; null on delete
 */
export async function applyStripeSubscriptionUpdate(params: {
  orgId: string;
  plan: OrganizationPlan;
  stripeSubscriptionId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}): Promise<void> {
  const db = getDb();
  await db
    .update(organizations)
    .set({
      plan: params.plan,
      stripeSubscriptionId: params.stripeSubscriptionId,
      stripePeriodStart: params.periodStart,
      stripePeriodEnd: params.periodEnd,
      updatedAt: sql`NOW()`,
    })
    .where(eq(organizations.id, params.orgId));
}
