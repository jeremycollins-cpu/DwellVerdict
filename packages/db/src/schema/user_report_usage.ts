import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * user_report_usage — per-user metering for report quotas and Scout
 * chat rate limits per ADR-5 + ADR-8.
 *
 * Replaces the older `user_verdict_limits` table. Renamed because the
 * scope broadened beyond free-tier verdict counts to cover all tiers,
 * the lifetime free-trial flag, and Scout chat rate limits.
 *
 * One row per user. Upserted on first report or Scout message.
 *
 * Lifetime free report (per ADR-5):
 *   - `free_report_used_at` is null until the user consumes their
 *     lifetime free report. Once set, never cleared — even if the
 *     user subscribes and then cancels, they cannot re-trial.
 *
 * Monthly report counters:
 *   - `reports_this_period` counts reports consumed since the last
 *     period reset.
 *   - `period_reset_at` is the start of the next calendar month at
 *     00:00 UTC. For users on a paid plan, this tracks the Stripe
 *     billing period start; for free users it tracks the calendar
 *     month (only relevant if we ever add a recurring free quota).
 *   - Reset happens lazily on read (`consumeReport` checks
 *     `now() >= period_reset_at` and rolls the counter).
 *
 * Scout chat rate limits (per ADR-8, Pro tier only):
 *   - `scout_messages_today` — daily counter, resets at
 *     `scout_day_reset_at`.
 *   - `scout_messages_this_period` — monthly counter, shares
 *     `period_reset_at` with the report counter so both roll at the
 *     same calendar-month boundary.
 *   - Rate limits: 30/day + 300/period for pro-tier subscribers.
 *     Non-pro users cannot call the chat endpoint at all; the gate
 *     is enforced in application code before this row is touched.
 */
export const userReportUsage = pgTable(
  "user_report_usage",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    // Lifetime free-report trial consumption — nullable. Set to now()
    // the first time a free-plan user runs a verdict. Never cleared.
    freeReportUsedAt: timestamp("free_report_used_at", { withTimezone: true }),

    // Monthly report counter + period rollover.
    reportsThisPeriod: integer("reports_this_period").notNull().default(0),
    periodResetAt: timestamp("period_reset_at", { withTimezone: true }),

    // Scout chat counters (pro-tier only).
    scoutMessagesToday: integer("scout_messages_today").notNull().default(0),
    scoutDayResetAt: timestamp("scout_day_reset_at", { withTimezone: true }),
    scoutMessagesThisPeriod: integer("scout_messages_this_period")
      .notNull()
      .default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportsNonNegative: check(
      "user_report_usage_reports_non_negative",
      sql`${table.reportsThisPeriod} >= 0`,
    ),
    scoutDayNonNegative: check(
      "user_report_usage_scout_today_non_negative",
      sql`${table.scoutMessagesToday} >= 0`,
    ),
    scoutPeriodNonNegative: check(
      "user_report_usage_scout_period_non_negative",
      sql`${table.scoutMessagesThisPeriod} >= 0`,
    ),
  }),
);

export type UserReportUsage = typeof userReportUsage.$inferSelect;
export type NewUserReportUsage = typeof userReportUsage.$inferInsert;
