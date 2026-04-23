import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * Plan tiers — must match pricing in ADR-8 (supersedes ADR-5).
 *
 *   free      — signed up, no subscription. Gets 1 lifetime free report.
 *   starter   — $20/mo DwellVerdict subscriber. 50 reports / calendar month.
 *   pro       — $40/mo DwellVerdict Pro subscriber. 200 reports / calendar
 *               month + Scout AI chat (30/day, 300/mo) + priority verdict
 *               queue.
 *   canceled  — previously paid, current billing period ended. Read-only
 *               access to historical rows; cannot consume new reports. The
 *               Stripe webhook sets this on subscription.deleted.
 *
 * Stored as text (not a pg enum) so we can evolve tiers without a migration
 * every time. Validation lives in the application layer via Zod.
 */
export const ORGANIZATION_PLANS = ["free", "starter", "pro", "canceled"] as const;
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

export const ORGANIZATION_MEMBER_ROLES = ["owner", "member"] as const;
export type OrganizationMemberRole = (typeof ORGANIZATION_MEMBER_ROLES)[number];

/**
 * organizations — mirrored from Clerk Organizations.
 *
 * Every user-owned row in the product is scoped by `org_id`. A personal
 * account shows up here as a single-member org.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkOrgId: text("clerk_org_id").notNull(),
    name: text("name").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    // Stripe subscription id for the org's active subscription. Null
    // when plan is 'free' or 'canceled' (no active sub). The Stripe
    // webhook keeps this in sync with the subscription lifecycle.
    stripeSubscriptionId: text("stripe_subscription_id"),
    // Start/end of the current Stripe billing period. Used by the
    // consumeReport query to know when to roll over the monthly
    // report counter. Null when plan is 'free' (no billing period).
    stripePeriodStart: timestamp("stripe_period_start", { withTimezone: true }),
    stripePeriodEnd: timestamp("stripe_period_end", { withTimezone: true }),
    plan: text("plan").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    clerkOrgIdUnique: uniqueIndex("organizations_clerk_org_id_unique").on(table.clerkOrgId),
    stripeCustomerIdUnique: uniqueIndex("organizations_stripe_customer_id_unique").on(
      table.stripeCustomerId,
    ),
    stripeSubscriptionIdUnique: uniqueIndex(
      "organizations_stripe_subscription_id_unique",
    ).on(table.stripeSubscriptionId),
    planIdx: index("organizations_plan_idx").on(table.plan),
    planCheck: check(
      "organizations_plan_check",
      sql`${table.plan} IN ('free', 'starter', 'pro', 'canceled')`,
    ),
  }),
);

/**
 * organization_members — join table between users and organizations.
 *
 * Composite primary key (org_id, user_id). Role drives authz checks in
 * application code; Clerk is still the source of truth for membership.
 */
export const organizationMembers = pgTable(
  "organization_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId] }),
    userIdIdx: index("organization_members_user_id_idx").on(table.userId),
    roleCheck: check("organization_members_role_check", sql`${table.role} IN ('owner', 'member')`),
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
