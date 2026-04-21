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
 * Plan tiers — must match pricing in CLAUDE.md.
 *
 * Stored as text (not a pg enum) so we can evolve tiers without a migration
 * every time. Validation lives in the application layer via Zod.
 */
export const ORGANIZATION_PLANS = ["starter", "pro", "portfolio"] as const;
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
    plan: text("plan").notNull().default("starter"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    clerkOrgIdUnique: uniqueIndex("organizations_clerk_org_id_unique").on(table.clerkOrgId),
    stripeCustomerIdUnique: uniqueIndex("organizations_stripe_customer_id_unique").on(
      table.stripeCustomerId,
    ),
    planIdx: index("organizations_plan_idx").on(table.plan),
    planCheck: check(
      "organizations_plan_check",
      sql`${table.plan} IN ('starter', 'pro', 'portfolio')`,
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
  }),
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
