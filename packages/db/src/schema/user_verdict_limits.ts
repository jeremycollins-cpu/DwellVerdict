import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * user_verdict_limits — free-tier metering per CLAUDE.md pricing.
 *
 * Free tier ships 3 verdicts/month. One row per user, upserted on every
 * verdict generation. `reset_at` is the start of the user's next monthly
 * window; once `now() >= reset_at` the counter resets in application
 * code (no nightly cron — cheaper to compute on read).
 *
 * Paid tiers bypass this table entirely; check org.plan first and only
 * meter free-tier users.
 */
export const userVerdictLimits = pgTable(
  "user_verdict_limits",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    verdictsThisMonth: integer("verdicts_this_month").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nonNegativeCount: check(
      "user_verdict_limits_count_non_negative",
      sql`${table.verdictsThisMonth} >= 0`,
    ),
  }),
);

export type UserVerdictLimit = typeof userVerdictLimits.$inferSelect;
export type NewUserVerdictLimit = typeof userVerdictLimits.$inferInsert;
