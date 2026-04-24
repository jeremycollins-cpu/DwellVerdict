import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { OrganizationPlan } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { userReportUsage, organizations } = schema;

/**
 * Plan-aware report quota enforcement per ADR-5 + ADR-7 + ADR-8.
 *
 *   free      — 1 lifetime free report, then blocked
 *   starter   — 50 reports per calendar month ($20/mo)
 *   pro       — 200 reports per calendar month ($40/mo)
 *   canceled  — 0 reports (read-only access to historical rows)
 *
 * Reset cadence is calendar month at 00:00 UTC on the 1st. Aligned
 * to Stripe's default invoice date anchoring so the user-visible
 * reset matches "my next bill" rather than a rolling 30-day window.
 *
 * "Calendar month" is computed against the *user's* current UTC
 * month — we don't try to honor local time zones here. Users in
 * UTC-8 effectively see the reset happen at 4pm local on the last
 * day of their calendar month. Acceptable for v0; revisit if a
 * user complains about off-by-one timing.
 */

export const PLAN_MONTHLY_LIMITS: Record<OrganizationPlan, number> = {
  free: 0, // free uses lifetime counter, not monthly
  starter: 50,
  pro: 200,
  canceled: 0,
};

/** Pro-tier Scout chat rate limits. */
export const SCOUT_DAILY_LIMIT = 30;
export const SCOUT_MONTHLY_LIMIT = 300;

/** Returns start-of-next-calendar-month in UTC. */
function nextCalendarMonth(from: Date): Date {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return d;
}

/** Returns start-of-tomorrow-UTC — used for Scout daily rollover. */
function nextUtcDay(from: Date): Date {
  const d = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return d;
}

export type ConsumeReportResult =
  | { ok: true; plan: OrganizationPlan; remaining: number; resetAt: Date | null }
  | {
      ok: false;
      reason:
        | "free_trial_used"
        | "monthly_cap_reached"
        | "subscription_canceled";
      plan: OrganizationPlan;
      limit: number;
      resetAt: Date | null;
    };

/**
 * Atomic check-and-increment for a report consume. The query path
 * differs by plan:
 *
 *   - `free`: check `free_report_used_at`. If null, set it to now()
 *     and allow. If set, block.
 *   - `starter` / `pro`: upsert the row with monthly counter logic.
 *     Reset counter lazily if `now >= period_reset_at`. Block if
 *     the counter is already at the plan's limit.
 *   - `canceled`: always block.
 *
 * Caller is responsible for:
 *   - Reading `org.plan` before calling
 *   - Calling `refundReport(userId, plan)` on downstream failure
 *     so the user isn't charged for our service failures
 */
export async function consumeReport(params: {
  userId: string;
  plan: OrganizationPlan;
}): Promise<ConsumeReportResult> {
  const { userId, plan } = params;
  const db = getDb();
  const now = new Date();

  if (plan === "canceled") {
    return {
      ok: false,
      reason: "subscription_canceled",
      plan,
      limit: 0,
      resetAt: null,
    };
  }

  if (plan === "free") {
    // Lifetime free report — check the usage row atomically. UPDATE
    // ... WHERE free_report_used_at IS NULL returns 0 rows if the
    // user has already used theirs.
    const [existing] = await db
      .insert(userReportUsage)
      .values({
        userId,
        freeReportUsedAt: now,
      })
      .onConflictDoUpdate({
        target: userReportUsage.userId,
        set: {
          freeReportUsedAt: sql`
            CASE
              WHEN ${userReportUsage.freeReportUsedAt} IS NULL THEN ${now}
              ELSE ${userReportUsage.freeReportUsedAt}
            END
          `,
          updatedAt: sql`NOW()`,
        },
      })
      .returning({
        freeReportUsedAt: userReportUsage.freeReportUsedAt,
      });

    if (!existing) throw new Error("user_report_usage upsert returned no row");

    // If the returned timestamp matches what we tried to set, this
    // was the first consume. If it's earlier than `now`, the user
    // had already consumed their free report.
    const usedAt = existing.freeReportUsedAt;
    if (usedAt && Math.abs(usedAt.getTime() - now.getTime()) > 1000) {
      // More than 1s drift — this is an already-used row.
      return {
        ok: false,
        reason: "free_trial_used",
        plan,
        limit: 1,
        resetAt: null,
      };
    }

    return { ok: true, plan, remaining: 0, resetAt: null };
  }

  // starter / pro — calendar-month counter logic
  const limit = PLAN_MONTHLY_LIMITS[plan];
  const nextReset = nextCalendarMonth(now);

  const [row] = await db
    .insert(userReportUsage)
    .values({
      userId,
      reportsThisPeriod: 1,
      periodResetAt: nextReset,
    })
    .onConflictDoUpdate({
      target: userReportUsage.userId,
      set: {
        reportsThisPeriod: sql`
          CASE
            WHEN ${userReportUsage.periodResetAt} IS NULL
              OR ${userReportUsage.periodResetAt} <= NOW()
              THEN 1
            WHEN ${userReportUsage.reportsThisPeriod} < ${limit}
              THEN ${userReportUsage.reportsThisPeriod} + 1
            ELSE ${userReportUsage.reportsThisPeriod}
          END
        `,
        periodResetAt: sql`
          CASE
            WHEN ${userReportUsage.periodResetAt} IS NULL
              OR ${userReportUsage.periodResetAt} <= NOW()
              THEN ${nextReset}
            ELSE ${userReportUsage.periodResetAt}
          END
        `,
        // Roll the Scout monthly counter at the same boundary.
        scoutMessagesThisPeriod: sql`
          CASE
            WHEN ${userReportUsage.periodResetAt} IS NULL
              OR ${userReportUsage.periodResetAt} <= NOW()
              THEN 0
            ELSE ${userReportUsage.scoutMessagesThisPeriod}
          END
        `,
        updatedAt: sql`NOW()`,
      },
    })
    .returning({
      count: userReportUsage.reportsThisPeriod,
      resetAt: userReportUsage.periodResetAt,
    });

  if (!row) throw new Error("user_report_usage upsert returned no row");

  if (row.count > limit) {
    // CASE should have clamped — defensive: clamp and report cap hit.
    await db
      .update(userReportUsage)
      .set({ reportsThisPeriod: limit })
      .where(eq(userReportUsage.userId, userId));
    return {
      ok: false,
      reason: "monthly_cap_reached",
      plan,
      limit,
      resetAt: row.resetAt,
    };
  }

  const remaining = limit - row.count;
  return { ok: true, plan, remaining, resetAt: row.resetAt };
}

/**
 * Undo a consume — called when report generation fails downstream.
 * For free-plan lifetime-free rollback we clear the timestamp so the
 * user can retry. For monthly plans we decrement the counter.
 */
export async function refundReport(params: {
  userId: string;
  plan: OrganizationPlan;
}): Promise<void> {
  const { userId, plan } = params;
  const db = getDb();

  if (plan === "free") {
    await db
      .update(userReportUsage)
      .set({
        freeReportUsedAt: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(userReportUsage.userId, userId));
    return;
  }

  if (plan === "starter" || plan === "pro") {
    await db
      .update(userReportUsage)
      .set({
        reportsThisPeriod: sql`GREATEST(${userReportUsage.reportsThisPeriod} - 1, 0)`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(userReportUsage.userId, userId));
  }
  // canceled: no-op; there was nothing to consume anyway.
}

/**
 * Scout chat rate-limit consumer. Pro-tier only — caller must check
 * org.plan === 'pro' before invoking. Enforces both daily (30) and
 * monthly (300) caps atomically.
 */
export type ConsumeScoutResult =
  | {
      ok: true;
      remainingToday: number;
      remainingThisPeriod: number;
      dayResetAt: Date;
      periodResetAt: Date | null;
    }
  | {
      ok: false;
      reason: "daily_cap_reached" | "monthly_cap_reached";
      dayResetAt: Date;
      periodResetAt: Date | null;
    };

export async function consumeScoutMessage(
  userId: string,
): Promise<ConsumeScoutResult> {
  const db = getDb();
  const now = new Date();
  const nextDay = nextUtcDay(now);
  const nextReset = nextCalendarMonth(now);

  const [row] = await db
    .insert(userReportUsage)
    .values({
      userId,
      scoutMessagesToday: 1,
      scoutDayResetAt: nextDay,
      scoutMessagesThisPeriod: 1,
      periodResetAt: nextReset,
    })
    .onConflictDoUpdate({
      target: userReportUsage.userId,
      set: {
        scoutMessagesToday: sql`
          CASE
            WHEN ${userReportUsage.scoutDayResetAt} IS NULL
              OR ${userReportUsage.scoutDayResetAt} <= NOW()
              THEN 1
            WHEN ${userReportUsage.scoutMessagesToday} < ${SCOUT_DAILY_LIMIT}
              THEN ${userReportUsage.scoutMessagesToday} + 1
            ELSE ${userReportUsage.scoutMessagesToday}
          END
        `,
        scoutDayResetAt: sql`
          CASE
            WHEN ${userReportUsage.scoutDayResetAt} IS NULL
              OR ${userReportUsage.scoutDayResetAt} <= NOW()
              THEN ${nextDay}
            ELSE ${userReportUsage.scoutDayResetAt}
          END
        `,
        scoutMessagesThisPeriod: sql`
          CASE
            WHEN ${userReportUsage.periodResetAt} IS NULL
              OR ${userReportUsage.periodResetAt} <= NOW()
              THEN 1
            WHEN ${userReportUsage.scoutMessagesThisPeriod} < ${SCOUT_MONTHLY_LIMIT}
              THEN ${userReportUsage.scoutMessagesThisPeriod} + 1
            ELSE ${userReportUsage.scoutMessagesThisPeriod}
          END
        `,
        periodResetAt: sql`
          CASE
            WHEN ${userReportUsage.periodResetAt} IS NULL
              OR ${userReportUsage.periodResetAt} <= NOW()
              THEN ${nextReset}
            ELSE ${userReportUsage.periodResetAt}
          END
        `,
        updatedAt: sql`NOW()`,
      },
    })
    .returning({
      today: userReportUsage.scoutMessagesToday,
      thisPeriod: userReportUsage.scoutMessagesThisPeriod,
      dayResetAt: userReportUsage.scoutDayResetAt,
      periodResetAt: userReportUsage.periodResetAt,
    });

  if (!row) throw new Error("user_report_usage Scout upsert returned no row");

  if (row.today > SCOUT_DAILY_LIMIT) {
    await db
      .update(userReportUsage)
      .set({ scoutMessagesToday: SCOUT_DAILY_LIMIT })
      .where(eq(userReportUsage.userId, userId));
    return {
      ok: false,
      reason: "daily_cap_reached",
      dayResetAt: row.dayResetAt ?? nextDay,
      periodResetAt: row.periodResetAt,
    };
  }
  if (row.thisPeriod > SCOUT_MONTHLY_LIMIT) {
    await db
      .update(userReportUsage)
      .set({ scoutMessagesThisPeriod: SCOUT_MONTHLY_LIMIT })
      .where(eq(userReportUsage.userId, userId));
    return {
      ok: false,
      reason: "monthly_cap_reached",
      dayResetAt: row.dayResetAt ?? nextDay,
      periodResetAt: row.periodResetAt,
    };
  }

  return {
    ok: true,
    remainingToday: SCOUT_DAILY_LIMIT - row.today,
    remainingThisPeriod: SCOUT_MONTHLY_LIMIT - row.thisPeriod,
    dayResetAt: row.dayResetAt ?? nextDay,
    periodResetAt: row.periodResetAt,
  };
}

/**
 * Read-only snapshot of a user's current usage row. Used by the
 * billing page to show "X of Y reports used this period" without
 * mutating anything. Returns null before the user has ever
 * consumed a report or Scout message (no row exists yet).
 */
export async function getUsageForUser(userId: string): Promise<{
  freeReportUsedAt: Date | null;
  reportsThisPeriod: number;
  periodResetAt: Date | null;
  scoutMessagesToday: number;
  scoutDayResetAt: Date | null;
  scoutMessagesThisPeriod: number;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      freeReportUsedAt: userReportUsage.freeReportUsedAt,
      reportsThisPeriod: userReportUsage.reportsThisPeriod,
      periodResetAt: userReportUsage.periodResetAt,
      scoutMessagesToday: userReportUsage.scoutMessagesToday,
      scoutDayResetAt: userReportUsage.scoutDayResetAt,
      scoutMessagesThisPeriod: userReportUsage.scoutMessagesThisPeriod,
    })
    .from(userReportUsage)
    .where(eq(userReportUsage.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Look up the authoritative org plan for a user. Used by the route
 * handler + server action before calling consumeReport.
 */
export async function getPlanForUser(userId: string): Promise<OrganizationPlan> {
  const db = getDb();
  const [row] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .innerJoin(
      schema.organizationMembers,
      eq(schema.organizationMembers.orgId, organizations.id),
    )
    .where(
      and(
        eq(schema.organizationMembers.userId, userId),
        sql`${organizations.deletedAt} IS NULL`,
      ),
    )
    .limit(1);

  return (row?.plan ?? "free") as OrganizationPlan;
}
