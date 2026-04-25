import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Onboarding intent enums (M1.2).
 *
 * Stored as plain text columns (not pg enums) so we can evolve the
 * vocabulary without a follow-up migration each time. Validation happens
 * at the application boundary via the Zod schemas in
 * `apps/web/lib/onboarding/schema.ts`. The CHECK constraints on the
 * table mirror those values as a defence-in-depth at the DB layer.
 */
export const INTENT_SEGMENTS = ["investor", "shopper", "agent", "exploring"] as const;
export type IntentSegment = (typeof INTENT_SEGMENTS)[number];

export const STRATEGY_FOCUSES = [
  "str",
  "ltr",
  "house_hacking",
  "flip",
  "brrrr",
  "vacation_home",
] as const;
export type StrategyFocus = (typeof STRATEGY_FOCUSES)[number];

export const DEAL_RANGES = [
  "under_500k",
  "500k_1m",
  "1m_3m",
  "3m_5m",
  "over_5m",
] as const;
export type DealRange = (typeof DEAL_RANGES)[number];

/**
 * users — mirrored from Clerk.
 *
 * Source of truth for identity is Clerk; this table exists so other tables
 * (forecasts.created_by, audit rows, etc.) can foreign-key to a stable uuid
 * without round-tripping to Clerk on every query.
 *
 * Onboarding fields (M1.2) are populated by the M3.4 onboarding flow.
 * All five are nullable so existing users (backfilled with
 * `onboarding_completed_at = NOW()` in 0010_onboarding_fields.sql) can
 * skip onboarding entirely. New users have `onboarding_completed_at`
 * NULL until they finish the flow.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    intentSegment: text("intent_segment"),
    strategyFocus: text("strategy_focus").array(),
    targetMarkets: text("target_markets").array(),
    dealRange: text("deal_range"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    clerkIdUnique: uniqueIndex("users_clerk_id_unique").on(table.clerkId),
    emailIdx: index("users_email_idx").on(table.email),
    intentSegmentCheck: check(
      "users_intent_segment_check",
      sql`${table.intentSegment} IS NULL OR ${table.intentSegment} IN ('investor', 'shopper', 'agent', 'exploring')`,
    ),
    dealRangeCheck: check(
      "users_deal_range_check",
      sql`${table.dealRange} IS NULL OR ${table.dealRange} IN ('under_500k', '500k_1m', '1m_3m', '3m_5m', 'over_5m')`,
    ),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
