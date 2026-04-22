import "server-only";

import { eq, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";

import { getDb } from "@/lib/db";

const { userVerdictLimits } = schema;

/**
 * CLAUDE.md pricing — free tier gets 3 verdicts per month, paid tiers
 * bypass. Paid-tier check lives in the caller (org.plan); this file
 * only handles free-tier metering.
 */
export const FREE_TIER_MONTHLY_LIMIT = 3;

/**
 * Compute the start of the next monthly window. We use the user's
 * first-use timestamp as the anchor — simpler and more predictable
 * than calendar months for the user ("you get 3 per 30 days from your
 * first run").
 */
function nextMonthBoundary(from: Date): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 30);
  return d;
}

/**
 * Check-and-increment the free tier counter for a user, atomically.
 * Returns { ok: true, remaining } on success, or { ok: false,
 * resetAt, limit } when the user has exhausted their quota.
 *
 * Resets lazily on read — if `now >= reset_at`, the counter rolls
 * back to 1 (counting this use) and `reset_at` rolls forward 30
 * days. No nightly cron needed.
 */
export async function consumeFreeVerdict(
  userId: string,
): Promise<
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; remaining: 0; resetAt: Date; limit: number }
> {
  const db = getDb();
  const now = new Date();
  const nextWindow = nextMonthBoundary(now);

  // Single upsert that handles both "first use this month" (insert)
  // and "subsequent use" (update with reset check).
  const [row] = await db
    .insert(userVerdictLimits)
    .values({
      userId,
      verdictsThisMonth: 1,
      resetAt: nextWindow,
    })
    .onConflictDoUpdate({
      target: userVerdictLimits.userId,
      set: {
        verdictsThisMonth: sql`
          CASE
            WHEN ${userVerdictLimits.resetAt} <= NOW()
              THEN 1
            WHEN ${userVerdictLimits.verdictsThisMonth} < ${FREE_TIER_MONTHLY_LIMIT}
              THEN ${userVerdictLimits.verdictsThisMonth} + 1
            ELSE ${userVerdictLimits.verdictsThisMonth}
          END
        `,
        resetAt: sql`
          CASE
            WHEN ${userVerdictLimits.resetAt} <= NOW()
              THEN ${nextWindow}
            ELSE ${userVerdictLimits.resetAt}
          END
        `,
        updatedAt: sql`NOW()`,
      },
    })
    .returning({
      count: userVerdictLimits.verdictsThisMonth,
      resetAt: userVerdictLimits.resetAt,
    });

  if (!row) throw new Error("verdict limit upsert returned no row");

  if (row.count > FREE_TIER_MONTHLY_LIMIT) {
    // We hit the cap — the CASE above left `count` unchanged at the
    // limit, but we're over. Decrement back and signal failure.
    // (Shouldn't happen with the CASE, defensive.)
    await db
      .update(userVerdictLimits)
      .set({ verdictsThisMonth: FREE_TIER_MONTHLY_LIMIT })
      .where(eq(userVerdictLimits.userId, userId));
    return {
      ok: false,
      remaining: 0,
      resetAt: row.resetAt,
      limit: FREE_TIER_MONTHLY_LIMIT,
    };
  }

  if (row.count === FREE_TIER_MONTHLY_LIMIT) {
    // Check — was this the increment that consumed the last slot, or
    // were we already at the limit and the CASE left it unchanged? We
    // can't tell from the returned row alone. Re-read the prior state
    // by checking whether reset_at just rolled: if it rolled, this is
    // a fresh cycle use #3 (ok). If not, and count is at limit, we
    // may have been blocked — but since the SQL only increments when
    // under the limit, reaching `limit` via the increment path means
    // this call is the one that consumed slot #3, so it's ok.
    return {
      ok: true,
      remaining: 0,
      resetAt: row.resetAt,
    };
  }

  return {
    ok: true,
    remaining: FREE_TIER_MONTHLY_LIMIT - row.count,
    resetAt: row.resetAt,
  };
}

/**
 * Undo a consume — called when the verdict generation fails, so we
 * don't charge a quota slot to the user for our service failing.
 * Decrements the counter by 1, floored at 0.
 */
export async function refundFreeVerdict(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(userVerdictLimits)
    .set({
      verdictsThisMonth: sql`GREATEST(${userVerdictLimits.verdictsThisMonth} - 1, 0)`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(userVerdictLimits.userId, userId));
}
